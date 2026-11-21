@preconcurrency import AVFoundation
import Foundation
import SaysoHelperCore

/// Captures the default microphone as 16 kHz mono Float32 for as long as it is on, handing each
/// chunk to a callback (hands-free listening). Audio is passed on in memory only: nothing is saved.
@MainActor
public final class StreamingMic: ContinuousListening {
    private var engine: AVAudioEngine?

    public init() {}

    public func start(onSamples: @escaping @Sendable ([Float]) -> Void) async throws {
        try await MicRecorder.ensurePermission()
        stop()
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
        let sink = CallbackSink(onSamples)
        let convert = Converter(converter: converter, outFormat: outFormat)
        input.installTap(onBus: 0, bufferSize: 4096, format: inFormat) { buffer, _ in
            convert.convert(buffer, into: sink)
        }
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            throw ServiceError(code: HelperErrorCode.micFailed, message: "audio engine failed: \(error.localizedDescription)")
        }
        self.engine = engine
    }

    public func stop() {
        guard let engine else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        self.engine = nil
    }
}

private final class CallbackSink: SampleSink {
    private let handler: @Sendable ([Float]) -> Void
    init(_ handler: @escaping @Sendable ([Float]) -> Void) { self.handler = handler }
    func append(_ chunk: UnsafeBufferPointer<Float>) { handler(Array(chunk)) }
}
