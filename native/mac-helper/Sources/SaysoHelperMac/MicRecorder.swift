@preconcurrency import AVFoundation
import Foundation
import SaysoHelperCore

/// Captures the default microphone as 16 kHz mono Float32. The engine runs only while recording,
/// so the macOS mic indicator is on only while the user holds Fn.
@MainActor
public final class MicRecorder: AudioRecording {
    private var engine: AVAudioEngine?
    private let samples = SampleBuffer()

    public init() {}

    public func start() async throws {
        try await Self.ensurePermission()
        teardown()
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let inFormat = input.outputFormat(forBus: 0)
        guard inFormat.sampleRate > 0, inFormat.channelCount > 0 else {
            throw ServiceError(code: HelperErrorCode.micFailed, message: "no microphone input available")
        }
        guard
            let outFormat = AVAudioFormat(
                commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false),
            let converter = AVAudioConverter(from: inFormat, to: outFormat)
        else {
            throw ServiceError(code: HelperErrorCode.micFailed, message: "cannot convert \(inFormat) to 16 kHz mono")
        }
        samples.reset()
        input.installTap(
            onBus: 0, bufferSize: 4096, format: inFormat,
            block: Self.makeTapBlock(Converter(converter: converter, outFormat: outFormat), samples))
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            throw ServiceError(code: HelperErrorCode.micFailed, message: "audio engine failed: \(error.localizedDescription)")
        }
        self.engine = engine
    }

    public func stop() -> [Float] {
        teardown()
        return samples.take()
    }

    public func cancel() {
        teardown()
        _ = samples.take()
    }

    private func teardown() {
        guard let engine else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        self.engine = nil
    }

    /// Built outside the main actor: the tap block runs on the audio thread.
    private nonisolated static func makeTapBlock(_ converter: Converter, _ sink: SampleBuffer) -> AVAudioNodeTapBlock {
        { buffer, _ in converter.convert(buffer, into: sink) }
    }

    private static func ensurePermission() async throws {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            return
        case .notDetermined:
            if await AVCaptureDevice.requestAccess(for: .audio) { return }
        default:
            break
        }
        throw ServiceError(
            code: HelperErrorCode.micDenied,
            message: "Microphone access is off. Turn it on in System Settings → Privacy & Security → Microphone.")
    }
}

/// Thread-safe sample accumulator shared between the audio thread and the main actor.
final class SampleBuffer: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [Float] = []

    func reset() {
        lock.withLock { storage.removeAll(keepingCapacity: true) }
    }

    func append(_ chunk: UnsafeBufferPointer<Float>) {
        lock.withLock { storage.append(contentsOf: chunk) }
    }

    func take() -> [Float] {
        lock.withLock {
            let out = storage
            storage = []
            return out
        }
    }
}

/// Wraps AVAudioConverter, which is only ever used from the audio thread.
final class Converter: @unchecked Sendable {
    private let converter: AVAudioConverter
    private let outFormat: AVAudioFormat

    init(converter: AVAudioConverter, outFormat: AVAudioFormat) {
        self.converter = converter
        self.outFormat = outFormat
    }

    func convert(_ input: AVAudioPCMBuffer, into sink: SampleBuffer) {
        let ratio = outFormat.sampleRate / input.format.sampleRate
        let capacity = AVAudioFrameCount(Double(input.frameLength) * ratio) + 64
        guard let output = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: capacity) else { return }
        var supplied = false
        var error: NSError?
        let status = converter.convert(to: output, error: &error) { _, inputStatus in
            if supplied {
                inputStatus.pointee = .noDataNow
                return nil
            }
            supplied = true
            inputStatus.pointee = .haveData
            return input
        }
        guard status != .error, let channel = output.floatChannelData else { return }
        sink.append(UnsafeBufferPointer(start: channel[0], count: Int(output.frameLength)))
    }
}
