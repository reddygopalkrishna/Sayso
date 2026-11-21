@preconcurrency import AVFoundation
import Foundation
import SaysoHelperCore

/// Captures the default microphone as 16 kHz mono Float32. The engine runs only while recording,
/// so the macOS mic indicator is on only while the user holds Fn.
@MainActor
public final class MicRecorder: AudioRecording {
    /// An engine built ahead of time but not running: no capture and no mic indicator until start().
    private struct Prepared {
        let engine: AVAudioEngine
        let inFormat: AVAudioFormat
        let converter: AVAudioConverter
        let outFormat: AVAudioFormat
        let builtAt: ContinuousClock.Instant
        /// Set when the engine reads audio through a sink node (small, fast buffers); nil = use a tap.
        let sink: SinkHandler?
    }

    /// Frames per tap buffer: about 21 ms at 48 kHz. The first audio arrives one buffer after the
    /// engine starts, so a large buffer (4096 = 85 ms) delays the first word.
    static let tapFrames: AVAudioFrameCount = 1024
    /// A prepared engine older than this is rebuilt (the default input device may have changed).
    private static let maxPreparedAge: Duration = .seconds(300)

    private var engine: AVAudioEngine?
    private var prepared: Prepared?
    private var configObserver: NSObjectProtocol?
    private let samples = SampleBuffer()

    public init() {}

    /// Builds the engine, the converter and the formats now, so start() only has to start it.
    /// Never prompts for permission, never starts the engine, and does nothing while recording.
    public func prepare() {
        guard engine == nil, prepared == nil,
              AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
        else { return }
        prepared = Self.build()
        if let built = prepared {
            // A device change (headphones, another mic) makes the prepared engine stale.
            configObserver = NotificationCenter.default.addObserver(
                forName: .AVAudioEngineConfigurationChange, object: built.engine, queue: .main
            ) { [weak self] _ in
                Task { @MainActor in self?.dropPrepared() }
            }
        }
    }

    private func dropPrepared() {
        if let configObserver { NotificationCenter.default.removeObserver(configObserver) }
        configObserver = nil
        prepared = nil
    }

    private static func build() -> Prepared? {
        let engine = AVAudioEngine()
        let inFormat = engine.inputNode.outputFormat(forBus: 0)
        guard inFormat.sampleRate > 0, inFormat.channelCount > 0,
              let outFormat = AVAudioFormat(
                commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false),
              let converter = AVAudioConverter(from: inFormat, to: outFormat)
        else { return nil }
        // A tap delivers its first buffer only after about 100 ms whatever size is asked for; a
        // sink node is called with each hardware buffer (a few ms). Used when the format is plain
        // float; otherwise the tap is the fallback.
        var handler: SinkHandler?
        // Off unless SAYSO_MIC_SINK=1: its audio content is not yet verified against real speech.
        if ProcessInfo.processInfo.environment["SAYSO_MIC_SINK"] == "1",
           inFormat.commonFormat == .pcmFormatFloat32, !inFormat.isInterleaved {
            let h = SinkHandler(inFormat: inFormat, converter: Converter(converter: converter, outFormat: outFormat))
            let node = AVAudioSinkNode { _, frames, list in
                h.receive(frames: frames, list: list)
                return noErr
            }
            engine.attach(node)
            engine.connect(engine.inputNode, to: node, format: inFormat)
            handler = h
        }
        engine.prepare()  // allocates buffers; does not start the microphone
        return Prepared(
            engine: engine, inFormat: inFormat, converter: converter, outFormat: outFormat,
            builtAt: .now, sink: handler)
    }

    public func start() async throws {
        let probe = StartProbe(keyDownAt: HotkeyClock.shared.lastDown)
        try await Self.ensurePermission()
        teardown()
        var ready = prepared
        dropPrepared()
        if let candidate = ready, ContinuousClock.now - candidate.builtAt > Self.maxPreparedAge {
            ready = nil
        }
        guard let ready = ready ?? Self.build() else {
            throw ServiceError(code: HelperErrorCode.micFailed, message: "no microphone input available")
        }
        let engine = ready.engine
        samples.reset()
        if let sink = ready.sink {
            sink.begin(into: samples, probe: probe)
        } else {
            engine.inputNode.installTap(
                onBus: 0, bufferSize: Self.tapFrames, format: ready.inFormat,
                block: Self.makeTapBlock(Converter(converter: ready.converter, outFormat: ready.outFormat), samples, probe))
        }
        do {
            try engine.start()
            probe.engineStarted()
        } catch {
            if ready.sink == nil { engine.inputNode.removeTap(onBus: 0) }
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
    private nonisolated static func makeTapBlock(
        _ converter: Converter, _ sink: SampleBuffer, _ probe: StartProbe
    ) -> AVAudioNodeTapBlock {
        { buffer, _ in
            converter.convert(buffer, into: sink)
            if let report = probe.firstSample() {
                FileHandle.standardError.write(Data("\(report.line)\n".utf8))
            }
        }
    }

    static func ensurePermission() async throws {
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

/// Where converted audio goes: a buffer for a held recording, or a callback for continuous listening.
protocol SampleSink: Sendable {
    func append(_ chunk: UnsafeBufferPointer<Float>)
}

/// Thread-safe sample accumulator shared between the audio thread and the main actor.
final class SampleBuffer: SampleSink, @unchecked Sendable {
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

    func convert(_ input: AVAudioPCMBuffer, into sink: any SampleSink) {
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


/// Receives the microphone's own small buffers from an AVAudioSinkNode (on the audio thread) and
/// hands them, converted to 16 kHz mono, to the sample buffer. Idle until begin().
final class SinkHandler: @unchecked Sendable {
    private let inFormat: AVAudioFormat
    private let converter: Converter
    private let lock = NSLock()
    private var sink: SampleBuffer?
    private var probe: StartProbe?

    init(inFormat: AVAudioFormat, converter: Converter) {
        self.inFormat = inFormat
        self.converter = converter
    }

    func begin(into sink: SampleBuffer, probe: StartProbe) {
        lock.withLock {
            self.sink = sink
            self.probe = probe
        }
    }

    func receive(frames: AVAudioFrameCount, list: UnsafePointer<AudioBufferList>) {
        let (sink, probe) = lock.withLock { (self.sink, self.probe) }
        guard let sink, frames > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: inFormat, frameCapacity: frames),
              let channels = buffer.floatChannelData
        else { return }
        buffer.frameLength = frames
        let source = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: list))
        for channel in 0..<min(Int(inFormat.channelCount), source.count) {
            guard let data = source[channel].mData else { continue }
            memcpy(channels[channel], data, Int(frames) * MemoryLayout<Float>.size)
        }
        converter.convert(buffer, into: sink)
        if let report = probe?.firstSample() {
            FileHandle.standardError.write(Data("\(report.line)\n".utf8))
        }
    }
}
