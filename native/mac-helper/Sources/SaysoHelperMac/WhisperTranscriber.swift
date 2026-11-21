import Foundation
import SaysoHelperCore
@preconcurrency import WhisperKit

/// On-device speech-to-text with WhisperKit (Apple Neural Engine), word timestamps on.
/// The model downloads once into `modelsDir`, then loads from disk.
public actor WhisperTranscriber: Transcribing {
    public nonisolated let modelName: String
    private let modelsDir: URL
    private var language: String?
    private var loading: Task<KitBox, Error>?

    public init(modelName: String, modelsDir: URL, language: String?) {
        self.modelName = modelName
        self.modelsDir = modelsDir
        self.language = language
    }

    public func setLanguage(_ code: String?) {
        language = code
    }

    /// Downloads (first run) and loads the model. Safe to call more than once.
    public func load() async throws {
        _ = try await kit()
    }

    public func transcribe(_ samples: [Float]) async throws -> Transcription {
        // Under 0.1 s there is nothing to decode; Whisper tends to hallucinate on silence.
        guard samples.count >= Int(sampleRate / 10) else { return Transcription(text: "", words: []) }
        let kit = try await kit().kit
        let options = DecodingOptions(
            task: .transcribe,
            language: language,
            temperature: 0,
            usePrefillPrompt: language != nil,
            skipSpecialTokens: true,
            withoutTimestamps: false,
            wordTimestamps: true,
            chunkingStrategy: .vad
        )
        let results: [TranscriptionResult]
        do {
            results = try await kit.transcribe(audioArray: AudioGain.lifted(samples), decodeOptions: options)
        } catch {
            throw ServiceError(code: HelperErrorCode.sttFailed, message: "transcription failed: \(error)")
        }
        let segments = results.flatMap(\.segments)
        let words = segments.flatMap { $0.words ?? [] }.map { w in
            Word(
                text: w.word.trimmingCharacters(in: .whitespaces),
                startMs: Double(max(0, w.start)) * 1000,
                endMs: Double(max(0, w.end)) * 1000,
                p: Double(min(1, max(0, w.probability)))
            )
        }.filter { !$0.text.isEmpty }
        let text = results.map(\.text).joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return Transcription(text: text, words: words)
    }

    /// Reads an audio file as 16 kHz mono samples (dev tool: `SaysoHelper --transcribe <file>`).
    public static func loadAudioFile(_ path: String) throws -> [Float] {
        try AudioProcessor.loadAudioAsFloatArray(fromPath: path)
    }

    private func kit() async throws -> KitBox {
        if let loading { return try await loading.value }
        let config = WhisperKitConfig(
            model: modelName,
            downloadBase: modelsDir,
            verbose: false,
            logLevel: .error,
            prewarm: true,
            load: true,
            download: true
        )
        let task = Task { KitBox(kit: try await WhisperKit(config)) }
        loading = task
        do {
            return try await task.value
        } catch {
            loading = nil
            throw ServiceError(code: HelperErrorCode.sttFailed, message: "could not load \(modelName): \(error)")
        }
    }
}

/// WhisperKit is not Sendable; the actor serialises all use of it.
final class KitBox: @unchecked Sendable {
    let kit: WhisperKit
    init(kit: WhisperKit) { self.kit = kit }
}
