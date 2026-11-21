import Foundation
import Testing
@testable import SaysoHelperCore

final class BufferWriter: LineWriter, @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String] = []
    var messages: [HelperMessage] { lock.withLock { storage.compactMap { try? HelperMessage.decode($0) } } }
    func write(_ line: String) { lock.withLock { storage.append(line) } }
}

@MainActor final class FakeRecorder: AudioRecording {
    var startError: ServiceError?
    var samples: [Float] = []
    private(set) var isRecording = false
    private(set) var cancels = 0

    func start() async throws {
        if let startError { throw startError }
        isRecording = true
    }
    func stop() -> [Float] {
        isRecording = false
        return samples
    }
    func cancel() {
        isRecording = false
        cancels += 1
    }
}

/// Records the language the loop asked for (the real transcriber passes it to WhisperKit).
actor LanguageLog {
    private(set) var codes: [String?] = []
    func add(_ code: String?) { codes.append(code) }
}

struct FakeTranscriber: Transcribing {
    let modelName = "fake-model"
    var languages = LanguageLog()
    func setLanguage(_ code: String?) async { await languages.add(code) }
    var result = Transcription(text: "hello world", words: [
        Word(text: "hello", startMs: 0, endMs: 400, p: 0.9),
        Word(text: "world", startMs: 450, endMs: 900, p: 0.8),
    ])
    var error: ServiceError?
    func transcribe(_ samples: [Float]) async throws -> Transcription {
        if let error { throw error }
        return result
    }
}

@MainActor final class FakeInserter: TextInserting {
    var error: ServiceError?
    private(set) var inserted: [String] = []
    func insert(_ text: String) async throws {
        if let error { throw error }
        inserted.append(text)
    }
}

@MainActor final class FakeContext: ContextProviding {
    var value = AppContext(bundleId: "com.tinyspeck.slackmacgap", appName: "Slack")
    func current() -> AppContext { value }
}

@MainActor final class FakeKeys: KeyPressing {
    var error: ServiceError?
    private(set) var pressed: [(UInt16, [Modifier])] = []
    func press(keyCode: UInt16, modifiers: [Modifier]) async throws {
        if let error { throw error }
        pressed.append((keyCode, modifiers))
    }
}

@MainActor final class FakeApps: AppControlling {
    var apps = [
        AppInfo(name: "Slack", bundleId: "com.tinyspeck.slackmacgap", running: true),
        AppInfo(name: "Calculator", bundleId: "com.apple.calculator", running: false),
    ]
    var error: ServiceError?
    private(set) var calls: [String] = []
    func listApps() -> [AppInfo] { apps }
    func open(bundleId: String) async throws {
        calls.append("open \(bundleId)")
        if let error { throw error }
    }
    func activate(bundleId: String) async throws {
        calls.append("activate \(bundleId)")
        if let error { throw error }
    }
    func openURL(_ url: String) throws {
        calls.append("url \(url)")
        if let error { throw error }
    }
}

@MainActor final class FakeScroller: Scrolling {
    var error: ServiceError?
    private(set) var scrolls: [(ScrollDirection, Int)] = []
    func scroll(direction: ScrollDirection, amount: Int) throws {
        if let error { throw error }
        scrolls.append((direction, amount))
    }
}

@MainActor final class FakePresser: ElementPressing {
    var error: ServiceError?
    private(set) var pressed: [String] = []
    func press(label: String) async throws {
        if let error { throw error }
        pressed.append(label)
    }
    private(set) var positions: [String] = []
    func pressPosition(kind: PositionKind, index: Int) async throws {
        if let error { throw error }
        positions.append("\(kind.rawValue) \(index)")
    }
}

@MainActor final class FakePermissions: PermissionControlling {
    var state = PermissionState(microphone: .undetermined, accessibility: false)
    /// What the user answers when asked.
    var answers = PermissionState(microphone: .granted, accessibility: false)
    private(set) var requested: [PermissionKind] = []
    func status() -> PermissionState { state }
    func request(_ kind: PermissionKind) async -> PermissionState {
        requested.append(kind)
        if kind == .microphone { state.microphone = answers.microphone }
        return state
    }
}

@MainActor final class FakeListener: ContinuousListening {
    var startError: ServiceError?
    private(set) var running = false
    private(set) var starts = 0
    private var handler: (@Sendable ([Float]) -> Void)?
    func start(onSamples: @escaping @Sendable ([Float]) -> Void) async throws {
        if let startError { throw startError }
        starts += 1
        running = true
        handler = onSamples
    }
    func stop() { running = false }
    /// What the microphone would deliver.
    func emit(_ samples: [Float]) { handler?(samples) }
}

/// A loud signal for speech and silence for the quiet between sentences (16 samples per ms).
func loud(ms: Int) -> [Float] { (0..<(16 * ms)).map { $0 % 2 == 0 ? 0.3 : -0.3 } }
func still(ms: Int) -> [Float] { [Float](repeating: 0, count: 16 * ms) }

@MainActor final class FakeHoldKeys: HoldKeyConfiguring {
    private(set) var keys: [HoldKey] = []
    func setHoldKey(_ key: HoldKey) { keys.append(key) }
}

@MainActor final class FakeEscape: EscapeCapturing {
    private(set) var states: [Bool] = []
    func setCapture(_ enabled: Bool) { states.append(enabled) }
}

@MainActor
struct Harness {
    let out = BufferWriter()
    let recorder = FakeRecorder()
    let inserter = FakeInserter()
    let context = FakeContext()
    let keys = FakeKeys()
    let escape = FakeEscape()
    let holdKeys = FakeHoldKeys()
    let listener = FakeListener()
    let apps = FakeApps()
    let scroller = FakeScroller()
    let presser = FakePresser()
    let permissions = FakePermissions()
    let loop: MessageLoop

    init(transcriber: FakeTranscriber = FakeTranscriber()) {
        loop = MessageLoop(
            writer: out, recorder: recorder, transcriber: transcriber, inserter: inserter,
            contextProvider: context, keyPresser: keys, escapeCapture: escape,
            appControl: apps, scroller: scroller, elementPresser: presser, permissions: permissions,
            holdKeys: holdKeys, listener: listener, osDescription: "macOS 14.0")
    }

    @discardableResult
    func send(_ json: String) async -> LoopOutcome {
        let (outcome, task) = loop.handle(line: json)
        await task?.value
        return outcome
    }
}

@MainActor @Suite struct MessageLoopBehaviour {
    @Test func sendsReadyThenAnswersPing() async throws {
        let h = Harness()
        h.loop.start()
        await h.send(#"{"v":1,"type":"ping","id":"x7"}"#)
        #expect(h.out.messages == [
            .ready(helperVersion: MessageLoop.helperVersion, os: "macOS 14.0"),
            .pong(id: "x7"),
        ])
    }

    @Test func recordsAndTranscribes() async {
        let h = Harness()
        h.recorder.samples = Array(repeating: 0, count: 16_000)  // 1 s
        await h.send(#"{"v":1,"type":"recordStart","id":"u-1"}"#)
        #expect(h.recorder.isRecording)
        await h.send(#"{"v":1,"type":"recordStop","id":"u-1"}"#)
        #expect(!h.recorder.isRecording)
        #expect(h.out.messages.count == 2)
        #expect(h.out.messages[0] == .done(id: "u-1"))
        guard case let .transcript(id, transcription, audioMs, _, model) = h.out.messages[1] else {
            Issue.record("expected transcript, got \(h.out.messages)")
            return
        }
        #expect(id == "u-1")
        #expect(transcription == FakeTranscriber().result)
        #expect(audioMs == 1000)
        #expect(model == "fake-model")
    }

    @Test func rejectsSecondRecordStartAndUnknownStop() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"recordStart","id":"u-1"}"#)
        await h.send(#"{"v":1,"type":"recordStart","id":"u-2"}"#)
        await h.send(#"{"v":1,"type":"recordStop","id":"u-9"}"#)
        let codes = h.out.messages.compactMap { m -> String? in
            if case let .error(_, code, _) = m { return code }
            return nil
        }
        #expect(codes == [HelperErrorCode.alreadyRecording, HelperErrorCode.notRecording])
        #expect(h.recorder.isRecording)
    }

    @Test func cancelDropsAudio() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"recordStart","id":"u-1"}"#)
        await h.send(#"{"v":1,"type":"recordCancel","id":"u-1"}"#)
        #expect(h.recorder.cancels == 1)
        #expect(h.out.messages.last == .done(id: "u-1"))
        await h.send(#"{"v":1,"type":"recordStop","id":"u-1"}"#)
        guard case .error(id: "u-1", code: HelperErrorCode.notRecording, _) = h.out.messages.last else {
            Issue.record("stop after cancel should fail")
            return
        }
    }

    @Test func reportsMicDenied() async {
        let h = Harness()
        h.recorder.startError = ServiceError(code: HelperErrorCode.micDenied, message: "off")
        await h.send(#"{"v":1,"type":"recordStart","id":"u-1"}"#)
        #expect(h.out.messages == [.error(id: "u-1", code: HelperErrorCode.micDenied, msg: "off")])
        // The failed start must not leave the loop thinking it is recording.
        h.recorder.startError = nil
        await h.send(#"{"v":1,"type":"recordStart","id":"u-2"}"#)
        #expect(h.out.messages.last == .done(id: "u-2"))
    }

    @Test func reportsTranscriptionFailure() async {
        var transcriber = FakeTranscriber()
        transcriber.error = ServiceError(code: HelperErrorCode.sttFailed, message: "boom")
        let h = Harness(transcriber: transcriber)
        await h.send(#"{"v":1,"type":"recordStart","id":"u-1"}"#)
        await h.send(#"{"v":1,"type":"recordStop","id":"u-1"}"#)
        #expect(h.out.messages.last == .error(id: "u-1", code: HelperErrorCode.sttFailed, msg: "boom"))
    }

    @Test func insertsText() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"insertText","id":"i-1","text":"Hi there"}"#)
        #expect(h.inserter.inserted == ["Hi there"])
        #expect(h.out.messages == [.done(id: "i-1")])

        h.inserter.error = ServiceError(code: HelperErrorCode.accessibilityDenied, message: "no AX")
        await h.send(#"{"v":1,"type":"insertText","id":"i-2","text":"x"}"#)
        #expect(h.out.messages.last == .error(id: "i-2", code: HelperErrorCode.accessibilityDenied, msg: "no AX"))
    }

    @Test func answersGetContext() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"getContext","id":"c-1"}"#)
        h.context.value = AppContext(bundleId: nil, appName: nil)
        await h.send(#"{"v":1,"type":"getContext","id":"c-2"}"#)
        #expect(h.out.messages == [
            .context(id: "c-1", context: AppContext(bundleId: "com.tinyspeck.slackmacgap", appName: "Slack")),
            .context(id: "c-2", context: AppContext(bundleId: nil, appName: nil)),
        ])
    }

    @Test func pressesKeys() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"keyPress","id":"k-1","key":"enter","modifiers":["shift"]}"#)
        await h.send(#"{"v":1,"type":"keyPress","id":"k-2","key":"z","modifiers":["cmd"]}"#)
        #expect(h.keys.pressed.map(\.0) == [36, 6])
        #expect(h.keys.pressed.map(\.1) == [[.shift], [.cmd]])
        #expect(h.out.messages == [.done(id: "k-1"), .done(id: "k-2")])

        h.keys.error = ServiceError(code: HelperErrorCode.accessibilityDenied, message: "no AX")
        await h.send(#"{"v":1,"type":"keyPress","id":"k-3","key":"enter","modifiers":[]}"#)
        #expect(h.out.messages.last == .error(id: "k-3", code: HelperErrorCode.accessibilityDenied, msg: "no AX"))
    }

    @Test func reportsAndRequestsPermissions() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"getPermissions","id":"g-1"}"#)
        await h.send(#"{"v":1,"type":"requestPermission","id":"r-1","kind":"microphone"}"#)
        #expect(h.permissions.requested == [.microphone])
        #expect(h.out.messages == [
            .permissions(id: "g-1", state: PermissionState(microphone: .undetermined, accessibility: false)),
            .permissions(id: "r-1", state: PermissionState(microphone: .granted, accessibility: false)),
        ])
    }

    @Test func listsApps() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"listApps","id":"l-1"}"#)
        #expect(h.out.messages == [.apps(id: "l-1", apps: h.apps.apps)])
    }

    @Test func opensSwitchesAndBrowses() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"openApp","id":"o-1","bundleId":"com.apple.calculator"}"#)
        await h.send(#"{"v":1,"type":"activateApp","id":"a-1","bundleId":"com.apple.Safari"}"#)
        await h.send(#"{"v":1,"type":"openURL","id":"u-1","url":"https://github.com"}"#)
        #expect(h.apps.calls == ["open com.apple.calculator", "activate com.apple.Safari", "url https://github.com"])
        #expect(h.out.messages == [.done(id: "o-1"), .done(id: "a-1"), .done(id: "u-1")])
    }

    @Test func reportsAppAndUrlErrors() async {
        let h = Harness()
        h.apps.error = ServiceError(code: HelperErrorCode.appNotFound, message: "not running")
        await h.send(#"{"v":1,"type":"activateApp","id":"a-1","bundleId":"x.y"}"#)
        #expect(h.out.messages.last == .error(id: "a-1", code: HelperErrorCode.appNotFound, msg: "not running"))
        h.apps.error = ServiceError(code: HelperErrorCode.badUrl, message: "bad")
        await h.send(#"{"v":1,"type":"openURL","id":"u-1","url":"https://x.test"}"#)
        #expect(h.out.messages.last == .error(id: "u-1", code: HelperErrorCode.badUrl, msg: "bad"))
    }

    @Test func scrolls() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"scroll","id":"s-1","direction":"down","amount":600}"#)
        #expect(h.scroller.scrolls.map(\.0) == [.down])
        #expect(h.scroller.scrolls.map(\.1) == [600])
        h.scroller.error = ServiceError(code: HelperErrorCode.accessibilityDenied, message: "no AX")
        await h.send(#"{"v":1,"type":"scroll","id":"s-2","direction":"up","amount":100}"#)
        #expect(h.out.messages.last == .error(id: "s-2", code: HelperErrorCode.accessibilityDenied, msg: "no AX"))
    }

    @Test func pressesElements() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"pressElement","id":"p-1","label":"Submit"}"#)
        #expect(h.presser.pressed == ["Submit"])
        h.presser.error = ServiceError(code: HelperErrorCode.elementNotFound, message: "nope")
        await h.send(#"{"v":1,"type":"pressElement","id":"p-2","label":"Nope"}"#)
        #expect(h.out.messages.last == .error(id: "p-2", code: HelperErrorCode.elementNotFound, msg: "nope"))
    }

    @Test func capturesEscapeOnRequestAndReleasesItOnShutdown() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"captureEscape","id":"e-1","enabled":true}"#)
        await h.send(#"{"v":1,"type":"captureEscape","id":"e-2","enabled":false}"#)
        #expect(h.escape.states == [true, false])
        #expect(h.out.messages == [.done(id: "e-1"), .done(id: "e-2")])
        await h.send(#"{"v":1,"type":"shutdown"}"#)
        #expect(h.escape.states.last == false)
    }

    @Test func pressesTheNthItemOnRequest() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"pressPosition","id":"n-1","kind":"row","index":3}"#)
        await h.send(#"{"v":1,"type":"pressPosition","id":"n-2","kind":"result","index":-1}"#)
        #expect(h.presser.positions == ["row 3", "result -1"])
        #expect(h.out.messages == [.done(id: "n-1"), .done(id: "n-2")])
        h.presser.error = ServiceError(code: HelperErrorCode.elementNotFound, message: "No such item on screen.")
        await h.send(#"{"v":1,"type":"pressPosition","id":"n-3","kind":"link","index":9}"#)
        #expect(h.out.messages.last == .error(id: "n-3", code: HelperErrorCode.elementNotFound, msg: "No such item on screen."))
    }

    @Test func changesTheSpokenLanguageOnRequest() async {
        let transcriber = FakeTranscriber()
        let h = Harness(transcriber: transcriber)
        await h.send(#"{"v":1,"type":"setLanguage","id":"g-1","language":"te"}"#)
        await h.send(#"{"v":1,"type":"setLanguage","id":"g-2","language":null}"#)
        #expect(await transcriber.languages.codes == ["te", nil])
        #expect(h.out.messages == [.done(id: "g-1"), .done(id: "g-2")])
    }

    @Test func changesTheHoldKeyOnRequest() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"setHoldKey","id":"h-1","key":"rightOption"}"#)
        await h.send(#"{"v":1,"type":"setHoldKey","id":"h-2","key":"fn"}"#)
        #expect(h.holdKeys.keys == [.rightOption, .fn])
        #expect(h.out.messages == [.done(id: "h-1"), .done(id: "h-2")])
    }

    @Test func refusesAnUnknownHoldKey() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"setHoldKey","id":"h-3","key":"capsLock"}"#)
        #expect(h.holdKeys.keys.isEmpty)
    }

    private func heardCount(_ h: Harness) -> Int {
        h.out.messages.filter { if case .heard = $0 { return true } else { return false } }.count
    }

    @Test func listensAndReportsEachUtteranceItHears() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"startListening","id":"l-1"}"#)
        #expect(h.listener.running)
        h.listener.emit(still(ms: 500) + loud(ms: 1_000) + still(ms: 1_500))
        await h.send(#"{"v":1,"type":"stopListening","id":"l-2"}"#)
        #expect(!h.listener.running)
        let messages = h.out.messages
        #expect(messages.first == .done(id: "l-1"))
        #expect(messages.last == .done(id: "l-2"))
        guard case let .heard(transcription, audioMs, _, model) = messages[1] else {
            Issue.record("expected a heard event, got \(messages)")
            return
        }
        #expect(transcription.text == "hello world")
        #expect(model == "fake-model")
        #expect(audioMs > 1_000 && audioMs < 2_100)
    }

    @Test func twoSentencesAreTwoEventsInOrder() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"startListening","id":"l-1"}"#)
        h.listener.emit(loud(ms: 900) + still(ms: 1_600) + loud(ms: 1_100) + still(ms: 1_500))
        await h.send(#"{"v":1,"type":"stopListening","id":"l-2"}"#)
        #expect(heardCount(h) == 2)
    }

    @Test func stoppingWhileSomeoneIsSpeakingStillReportsWhatWasSaid() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"startListening","id":"l-1"}"#)
        h.listener.emit(still(ms: 400) + loud(ms: 1_200))
        await h.send(#"{"v":1,"type":"stopListening","id":"l-2"}"#)
        #expect(heardCount(h) == 1)
    }

    @Test func silenceIsNeverReported() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"startListening","id":"l-1"}"#)
        h.listener.emit(still(ms: 5_000))
        await h.send(#"{"v":1,"type":"stopListening","id":"l-2"}"#)
        #expect(heardCount(h) == 0)
    }

    @Test func anEmptyTranscriptIsNotReported() async {
        var transcriber = FakeTranscriber()
        transcriber.result = Transcription(text: "   ", words: [])
        let h = Harness(transcriber: transcriber)
        await h.send(#"{"v":1,"type":"startListening","id":"l-1"}"#)
        h.listener.emit(loud(ms: 1_000) + still(ms: 1_500))
        await h.send(#"{"v":1,"type":"stopListening","id":"l-2"}"#)
        #expect(heardCount(h) == 0)
    }

    @Test func startingTwiceKeepsOneMicrophoneSession() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"startListening","id":"l-1"}"#)
        await h.send(#"{"v":1,"type":"startListening","id":"l-2"}"#)
        #expect(h.listener.starts == 1)
        #expect(h.out.messages == [.done(id: "l-1"), .done(id: "l-2")])
    }

    @Test func aMicrophoneProblemIsReportedAndNothingIsListening() async {
        let h = Harness()
        h.listener.startError = ServiceError(code: HelperErrorCode.micDenied, message: "off")
        await h.send(#"{"v":1,"type":"startListening","id":"l-1"}"#)
        #expect(h.out.messages == [.error(id: "l-1", code: HelperErrorCode.micDenied, msg: "off")])
        #expect(!h.listener.running)
    }

    @Test func stoppingWhenNotListeningIsFine() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"stopListening","id":"l-1"}"#)
        #expect(h.out.messages == [.done(id: "l-1")])
    }

    @Test func shuttingDownSwitchesTheMicrophoneOff() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"startListening","id":"l-1"}"#)
        await h.send(#"{"v":1,"type":"shutdown"}"#)
        #expect(!h.listener.running)
    }

    @Test func reportsWhenListeningIsNotAvailable() async {
        let out = BufferWriter()
        let loop = MessageLoop(
            writer: out, recorder: FakeRecorder(), transcriber: FakeTranscriber(), inserter: FakeInserter(),
            contextProvider: FakeContext(), keyPresser: FakeKeys(), escapeCapture: FakeEscape(),
            appControl: FakeApps(), scroller: FakeScroller(), elementPresser: FakePresser(),
            permissions: FakePermissions(), osDescription: "macOS 14.0")
        let (_, task) = loop.handle(line: #"{"v":1,"type":"startListening","id":"l-1"}"#)
        await task?.value
        #expect(out.messages == [.error(id: "l-1", code: HelperErrorCode.micFailed, msg: "listening is not available")])
    }

    @Test func reportsTheFocusedFieldInContext() async {
        let h = Harness()
        h.context.value = AppContext(
            bundleId: "com.apple.Safari", appName: "Safari", focusRole: "AXTextField", secureField: true)
        await h.send(#"{"v":1,"type":"getContext","id":"c-1"}"#)
        guard case let .context(_, context) = h.out.messages.last else {
            Issue.record("expected context")
            return
        }
        #expect(context.secureField)
        #expect(context.focusRole == "AXTextField")
    }

    @Test func stopsOnShutdownAndCancelsRecording() async {
        let h = Harness()
        await h.send(#"{"v":1,"type":"recordStart","id":"u-1"}"#)
        #expect(await h.send(#"{"v":1,"type":"shutdown"}"#) == .stop)
        #expect(h.recorder.cancels == 1)
    }

    @Test func reportsBadLinesAndKeepsRunning() async {
        let h = Harness()
        #expect(await h.send("garbage") == .keepRunning)
        #expect(await h.send("   ") == .keepRunning)
        #expect(h.out.messages.count == 1)
        guard case .error(id: nil, code: HelperErrorCode.badMessage, _) = h.out.messages.first else {
            Issue.record("expected a bad_message error")
            return
        }
    }
}
