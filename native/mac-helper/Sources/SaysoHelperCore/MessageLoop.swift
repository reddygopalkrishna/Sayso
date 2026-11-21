import Foundation

/// Where the helper writes NDJSON lines (stdout in production, a buffer in tests).
public protocol LineWriter: Sendable {
    func write(_ line: String)
}

public struct StandardOutputWriter: LineWriter {
    public init() {}
    public func write(_ line: String) {
        // FileHandle writes are unbuffered, so each message reaches the app immediately.
        FileHandle.standardOutput.write(Data(line.utf8))
    }
}

public enum LoopOutcome: Equatable, Sendable {
    case keepRunning
    case stop
}

/// Executes app requests against the OS services and reports events. Holds no product logic.
@MainActor
public final class MessageLoop {
    public static let helperVersion = "0.2.0"

    private let writer: LineWriter
    private let osDescription: String
    private let recorder: AudioRecording
    private let transcriber: Transcribing
    private let inserter: TextInserting
    private let contextProvider: ContextProviding
    private let keyPresser: KeyPressing
    private let escapeCapture: EscapeCapturing
    private var recordingID: String?

    public init(
        writer: LineWriter,
        recorder: AudioRecording,
        transcriber: Transcribing,
        inserter: TextInserting,
        contextProvider: ContextProviding,
        keyPresser: KeyPressing,
        escapeCapture: EscapeCapturing,
        osDescription: String = MessageLoop.currentOS()
    ) {
        self.writer = writer
        self.recorder = recorder
        self.transcriber = transcriber
        self.inserter = inserter
        self.contextProvider = contextProvider
        self.keyPresser = keyPresser
        self.escapeCapture = escapeCapture
        self.osDescription = osDescription
    }

    /// Must be called once before handling any line: the app waits for `ready`.
    public func start() {
        send(.ready(helperVersion: Self.helperVersion, os: osDescription))
    }

    public func send(_ message: HelperMessage) {
        writer.write(message.encodedLine())
    }

    /// Handles one line from stdin. Long work (recording start, transcription, paste) runs in a
    /// Task; `pending` lets tests await it.
    @discardableResult
    public func handle(line: String) -> (LoopOutcome, Task<Void, Never>?) {
        if line.trimmingCharacters(in: .whitespaces).isEmpty { return (.keepRunning, nil) }
        let message: AppMessage
        do {
            message = try AppMessage.decode(line)
        } catch {
            send(.error(id: nil, code: HelperErrorCode.badMessage, msg: "could not decode line: \(error)"))
            return (.keepRunning, nil)
        }
        switch message {
        case let .ping(id):
            send(.pong(id: id))
            return (.keepRunning, nil)
        case .shutdown:
            escapeCapture.setCapture(false)
            if recordingID != nil { recorder.cancel() }
            return (.stop, nil)
        case let .recordStart(id):
            return (.keepRunning, Task { await self.recordStart(id) })
        case let .recordStop(id):
            return (.keepRunning, Task { await self.recordStop(id) })
        case let .recordCancel(id):
            if recordingID == id {
                recorder.cancel()
                recordingID = nil
            }
            send(.done(id: id))
            return (.keepRunning, nil)
        case let .getContext(id):
            send(.context(id: id, context: contextProvider.current()))
            return (.keepRunning, nil)
        case let .insertText(id, text):
            return (.keepRunning, Task { await self.insert(id, text) })
        case let .captureEscape(id, enabled):
            escapeCapture.setCapture(enabled)
            send(.done(id: id))
            return (.keepRunning, nil)
        case let .keyPress(id, key, modifiers):
            return (.keepRunning, Task { await self.pressKey(id, key, modifiers) })
        }
    }

    private func recordStart(_ id: String) async {
        guard recordingID == nil else {
            send(.error(id: id, code: HelperErrorCode.alreadyRecording, msg: "already recording"))
            return
        }
        recordingID = id
        do {
            try await recorder.start()
            // A cancel may have arrived while the mic was starting.
            guard recordingID == id else {
                recorder.cancel()
                return
            }
            send(.done(id: id))
        } catch {
            if recordingID == id { recordingID = nil }
            sendError(id: id, error, fallbackCode: HelperErrorCode.micFailed)
        }
    }

    private func recordStop(_ id: String) async {
        guard recordingID == id else {
            send(.error(id: id, code: HelperErrorCode.notRecording, msg: "no recording with id \(id)"))
            return
        }
        recordingID = nil
        let samples = recorder.stop()
        let audioMs = Double(samples.count) / sampleRate * 1000
        let clock = ContinuousClock()
        let started = clock.now
        do {
            let transcription = try await transcriber.transcribe(samples)
            let elapsed = clock.now - started
            let sttMs = Double(elapsed.components.seconds) * 1000
                + Double(elapsed.components.attoseconds) / 1e15
            send(.transcript(
                id: id, transcription: transcription, audioMs: audioMs, sttMs: sttMs,
                model: transcriber.modelName))
        } catch {
            sendError(id: id, error, fallbackCode: HelperErrorCode.sttFailed)
        }
    }

    private func insert(_ id: String, _ text: String) async {
        do {
            try await inserter.insert(text)
            send(.done(id: id))
        } catch {
            sendError(id: id, error, fallbackCode: HelperErrorCode.accessibilityDenied)
        }
    }

    private func pressKey(_ id: String, _ key: String, _ modifiers: [Modifier]) async {
        guard let code = KeyMap.code(for: key) else {
            send(.error(id: id, code: HelperErrorCode.badMessage, msg: "unknown key \(key)"))
            return
        }
        do {
            try await keyPresser.press(keyCode: code, modifiers: modifiers)
            send(.done(id: id))
        } catch {
            sendError(id: id, error, fallbackCode: HelperErrorCode.accessibilityDenied)
        }
    }

    private func sendError(id: String, _ error: Error, fallbackCode: String) {
        if let error = error as? ServiceError {
            send(.error(id: id, code: error.code, msg: error.message))
        } else {
            send(.error(id: id, code: fallbackCode, msg: String(describing: error)))
        }
    }

    public nonisolated static func currentOS() -> String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "macOS \(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }
}
