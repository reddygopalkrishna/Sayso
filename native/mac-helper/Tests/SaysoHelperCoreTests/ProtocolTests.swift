import Foundation
import Testing
@testable import SaysoHelperCore

/// packages/helper-protocol/fixtures, found relative to this file.
private let fixturesDir = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()  // SaysoHelperCoreTests
    .deletingLastPathComponent()  // Tests
    .deletingLastPathComponent()  // mac-helper
    .deletingLastPathComponent()  // native
    .deletingLastPathComponent()  // repo root
    .appendingPathComponent("packages/helper-protocol/fixtures")

private func fixture(_ name: String) throws -> String {
    try String(contentsOf: fixturesDir.appendingPathComponent(name), encoding: .utf8)
}

final class BufferWriter: LineWriter, @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String] = []
    var lines: [String] { lock.withLock { storage } }
    func write(_ line: String) { lock.withLock { storage.append(line) } }
}

@Suite struct SharedFixtures {
    @Test func appFixturesDecode() throws {
        #expect(try AppMessage.decode(fixture("app.ping.json")) == .ping(id: "p-1"))
        #expect(try AppMessage.decode(fixture("app.shutdown.json")) == .shutdown)
    }

    @Test(arguments: ["helper.ready.json", "helper.pong.json", "helper.log.json", "helper.error.json"])
    func helperFixturesRoundTrip(name: String) throws {
        let message = try HelperMessage.decode(fixture(name))
        let line = message.encodedLine()
        #expect(line.hasSuffix("\n"))
        #expect(!line.dropLast().contains("\n"))
        #expect(try HelperMessage.decode(line) == message)
    }

    @Test func encodedReadyMatchesFixtureFields() throws {
        let line = HelperMessage.ready(helperVersion: "0.1.0", os: "macOS 14.0").encodedLine()
        let encoded = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? NSDictionary
        let expected = try JSONSerialization.jsonObject(
            with: Data(fixture("helper.ready.json").utf8)) as? NSDictionary
        #expect(encoded == expected)
    }
}

@Suite struct AppMessageDecoding {
    @Test(arguments: [
        ("", ProtocolError.invalidJSON),
        ("{\"v\":1,", ProtocolError.invalidJSON),
        ("{\"v\":2,\"type\":\"ping\",\"id\":\"a\"}", ProtocolError.unsupportedVersion(2)),
        ("{\"v\":1,\"type\":\"explode\"}", ProtocolError.unknownType("explode")),
        ("{\"v\":1,\"type\":\"ping\"}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"ping\",\"id\":\"\"}", ProtocolError.invalidJSON),
    ])
    func rejects(line: String, expected: ProtocolError) {
        #expect(throws: expected) { try AppMessage.decode(line) }
    }
}

@MainActor @Suite struct MessageLoopBehaviour {
    @Test func sendsReadyThenAnswersPing() throws {
        let out = BufferWriter()
        let loop = MessageLoop(writer: out, osDescription: "macOS 14.0")
        loop.start()
        #expect(loop.handle(line: "{\"v\":1,\"type\":\"ping\",\"id\":\"x7\"}") == .keepRunning)
        #expect(out.lines.count == 2)
        #expect(try HelperMessage.decode(out.lines[0]) == .ready(helperVersion: MessageLoop.helperVersion, os: "macOS 14.0"))
        #expect(try HelperMessage.decode(out.lines[1]) == .pong(id: "x7"))
    }

    @Test func stopsOnShutdown() {
        let loop = MessageLoop(writer: BufferWriter())
        #expect(loop.handle(line: "{\"v\":1,\"type\":\"shutdown\"}") == .stop)
    }

    @Test func reportsBadLinesAndKeepsRunning() throws {
        let out = BufferWriter()
        let loop = MessageLoop(writer: out)
        #expect(loop.handle(line: "garbage") == .keepRunning)
        #expect(loop.handle(line: "   ") == .keepRunning)
        #expect(out.lines.count == 1)
        guard case let .error(code, _) = try HelperMessage.decode(out.lines[0]) else {
            Issue.record("expected an error message")
            return
        }
        #expect(code == "bad_message")
    }
}
