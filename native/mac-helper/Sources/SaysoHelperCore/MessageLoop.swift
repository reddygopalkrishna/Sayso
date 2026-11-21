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
    private let holdKeys: HoldKeyConfiguring?
    private let listener: ContinuousListening?
    private let screenReader: ScreenReading?
    private let appControl: AppControlling
    private let scroller: Scrolling
    private let elementPresser: ElementPressing
    private let permissions: PermissionControlling
    private var recordingID: String?

    // Hands-free: the microphone runs continuously, a segmenter cuts it into utterances, and each
    // utterance is transcribed in order and reported as a `heard` event.
    private var segmenter = SpeechSegmenter()
    private var listening = false
    private var listenInput: AsyncStream<[Float]>.Continuation?
    private var listenTask: Task<Void, Never>?
    private var transcribeChain: Task<Void, Never>?

    public init(
        writer: LineWriter,
        recorder: AudioRecording,
        transcriber: Transcribing,
        inserter: TextInserting,
        contextProvider: ContextProviding,
        keyPresser: KeyPressing,
        escapeCapture: EscapeCapturing,
        appControl: AppControlling,
        scroller: Scrolling,
        elementPresser: ElementPressing,
        permissions: PermissionControlling,
        holdKeys: HoldKeyConfiguring? = nil,
        listener: ContinuousListening? = nil,
        screenReader: ScreenReading? = nil,
        osDescription: String = MessageLoop.currentOS()
    ) {
        self.writer = writer
        self.recorder = recorder
        self.transcriber = transcriber
        self.inserter = inserter
        self.contextProvider = contextProvider
        self.keyPresser = keyPresser
        self.escapeCapture = escapeCapture
        self.holdKeys = holdKeys
        self.listener = listener
        self.screenReader = screenReader
        self.appControl = appControl
        self.scroller = scroller
        self.elementPresser = elementPresser
        self.permissions = permissions
        self.osDescription = osDescription
    }

    /// Must be called once before handling any line: the app waits for `ready`.
    public func start() {
        send(.ready(helperVersion: Self.helperVersion, os: osDescription))
    }

    public func send(_ message: HelperMessage) {
        if case .hotkey(phase: .down) = message { HotkeyClock.shared.markDown() }
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
            listener?.stop()
            listenInput?.finish()
            return (.stop, nil)
        case let .recordStart(id):
            return (.keepRunning, Task { await self.recordStart(id) })
        case let .recordStop(id):
            return (.keepRunning, Task { await self.recordStop(id) })
        case let .recordCancel(id):
            if recordingID == id {
                recorder.cancel()
                recorder.prepare()
                recordingID = nil
            }
            send(.done(id: id))
            return (.keepRunning, nil)
        case let .getContext(id):
            send(.context(id: id, context: contextProvider.current()))
            return (.keepRunning, nil)
        case let .insertText(id, text):
            return (.keepRunning, Task { await self.insert(id, text) })
        case let .getPermissions(id):
            send(.permissions(id: id, state: permissions.status()))
            return (.keepRunning, nil)
        case let .requestPermission(id, kind):
            return (.keepRunning, Task {
                let state = await self.permissions.request(kind)
                self.send(.permissions(id: id, state: state))
            })
        case let .listApps(id):
            send(.apps(id: id, apps: appControl.listApps()))
            return (.keepRunning, nil)
        case let .openApp(id, bundleId):
            return (.keepRunning, Task {
                await self.perform(id, fallbackCode: HelperErrorCode.appNotFound) {
                    try await self.appControl.open(bundleId: bundleId)
                }
            })
        case let .activateApp(id, bundleId):
            return (.keepRunning, Task {
                await self.perform(id, fallbackCode: HelperErrorCode.appNotFound) {
                    try await self.appControl.activate(bundleId: bundleId)
                }
            })
        case let .openURL(id, url):
            return (.keepRunning, Task {
                await self.perform(id, fallbackCode: HelperErrorCode.badUrl) {
                    try self.appControl.openURL(url)
                }
            })
        case let .scroll(id, direction, amount):
            return (.keepRunning, Task {
                await self.perform(id, fallbackCode: HelperErrorCode.accessibilityDenied) {
                    try self.scroller.scroll(direction: direction, amount: amount)
                }
            })
        case let .pressElement(id, label):
            return (.keepRunning, Task {
                await self.perform(id, fallbackCode: HelperErrorCode.elementNotFound) {
                    try await self.elementPresser.press(label: label)
                }
            })
        case let .focusField(id, label):
            return (.keepRunning, Task {
                await self.perform(id, fallbackCode: HelperErrorCode.elementNotFound) {
                    try await self.elementPresser.focusField(label: label)
                }
            })
        case let .pressPosition(id, kind, index):
            return (.keepRunning, Task {
                await self.perform(id, fallbackCode: HelperErrorCode.elementNotFound) {
                    try await self.elementPresser.pressPosition(kind: kind, index: index)
                }
            })
        case let .captureEscape(id, enabled):
            escapeCapture.setCapture(enabled)
            send(.done(id: id))
            return (.keepRunning, nil)
        case let .setLanguage(id, language):
            return (.keepRunning, Task { [transcriber] in
                await transcriber.setLanguage(language)
                self.send(.done(id: id))
            })
        case let .listElements(id):
            return (.keepRunning, Task {
                guard let reader = self.screenReader else {
                    self.send(.error(id: id, code: HelperErrorCode.accessibilityDenied, msg: "reading the screen is not available"))
                    return
                }
                do {
                    self.send(.elements(id: id, items: try await reader.listElements()))
                } catch {
                    self.sendError(id: id, error, fallbackCode: HelperErrorCode.accessibilityDenied)
                }
            })
        case let .startListening(id):
            return (.keepRunning, Task { await self.startListening(id) })
        case let .stopListening(id):
            return (.keepRunning, Task { await self.stopListening(id) })
        case let .setHoldKey(id, key):
            holdKeys?.setHoldKey(key)
            send(.done(id: id))
            return (.keepRunning, nil)
        case let .keyPress(id, key, modifiers):
            return (.keepRunning, Task { await self.pressKey(id, key, modifiers) })
        }
    }

    private func startListening(_ id: String) async {
        guard let listener else {
            send(.error(id: id, code: HelperErrorCode.micFailed, msg: "listening is not available"))
            return
        }
        if listening {
            send(.done(id: id))
            return
        }
        let (stream, input) = AsyncStream<[Float]>.makeStream()
        do {
            try await listener.start { samples in input.yield(samples) }
        } catch {
            input.finish()
            sendError(id: id, error, fallbackCode: HelperErrorCode.micFailed)
            return
        }
        segmenter = SpeechSegmenter()
        listening = true
        listenInput = input
        listenTask = Task { [weak self] in
            for await samples in stream {
                guard let self else { return }
                for utterance in self.segmenter.feed(samples) { self.transcribeUtterance(utterance) }
            }
        }
        send(.done(id: id))
    }

    private func stopListening(_ id: String) async {
        if listening {
            listening = false
            listener?.stop()
            listenInput?.finish()
            listenInput = nil
            await listenTask?.value
            listenTask = nil
            if let rest = segmenter.flush() { transcribeUtterance(rest) }
            await transcribeChain?.value
        }
        send(.done(id: id))
    }

    /// Transcribes one utterance after the ones before it, so `heard` events keep their order.
    private func transcribeUtterance(_ samples: [Float]) {
        let previous = transcribeChain
        transcribeChain = Task { [transcriber] in
            await previous?.value
            let audioMs = Double(samples.count) / sampleRate * 1000
            let clock = ContinuousClock()
            let started = clock.now
            guard let transcription = try? await transcriber.transcribe(samples) else { return }
            let elapsed = clock.now - started
            let sttMs = Double(elapsed.components.seconds) * 1000
                + Double(elapsed.components.attoseconds) / 1e15
            let text = transcription.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return }
            self.send(.heard(
                transcription: transcription, audioMs: audioMs, sttMs: sttMs,
                model: transcriber.modelName))
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
                recorder.prepare()
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
        recorder.prepare()  // ready for the next key press, while this one is transcribed
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

    /// Runs `work`, then answers `done` or an error for request `id`.
    private func perform(_ id: String, fallbackCode: String, _ work: () async throws -> Void) async {
        do {
            try await work()
            send(.done(id: id))
        } catch {
            sendError(id: id, error, fallbackCode: fallbackCode)
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
