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

struct FakeTranscriber: Transcribing {
    let modelName = "fake-model"
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

@MainActor
struct Harness {
    let out = BufferWriter()
    let recorder = FakeRecorder()
    let inserter = FakeInserter()
    let context = FakeContext()
    let keys = FakeKeys()
    let loop: MessageLoop

    init(transcriber: FakeTranscriber = FakeTranscriber()) {
        loop = MessageLoop(
            writer: out, recorder: recorder, transcriber: transcriber, inserter: inserter,
            contextProvider: context, keyPresser: keys, osDescription: "macOS 14.0")
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
