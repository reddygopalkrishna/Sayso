import Foundation
import Testing
@testable import SaysoHelperCore

/// packages/helper-protocol/fixtures, found relative to this file.
let fixturesDir = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()  // SaysoHelperCoreTests
    .deletingLastPathComponent()  // Tests
    .deletingLastPathComponent()  // mac-helper
    .deletingLastPathComponent()  // native
    .deletingLastPathComponent()  // repo root
    .appendingPathComponent("packages/helper-protocol/fixtures")

func fixture(_ name: String) throws -> String {
    try String(contentsOf: fixturesDir.appendingPathComponent(name), encoding: .utf8)
}

func fixtureNames(prefix: String) throws -> [String] {
    try FileManager.default.contentsOfDirectory(atPath: fixturesDir.path)
        .filter { $0.hasPrefix(prefix) && $0.hasSuffix(".json") }
        .sorted()
}

@Suite struct SharedFixtures {
    @Test func everyAppFixtureDecodes() throws {
        let names = try fixtureNames(prefix: "app.")
        #expect(names.count == 6)
        for name in names {
            #expect(throws: Never.self, "\(name)") { try AppMessage.decode(fixture(name)) }
        }
        #expect(try AppMessage.decode(fixture("app.insertText.json")) == .insertText(id: "i-1", text: "Hello from Sayso"))
    }

    @Test func everyHelperFixtureRoundTrips() throws {
        let names = try fixtureNames(prefix: "helper.")
        #expect(names.count == 10)
        for name in names {
            let message = try HelperMessage.decode(fixture(name))
            let line = message.encodedLine()
            #expect(line.hasSuffix("\n"), "\(name)")
            #expect(!line.dropLast().contains("\n"), "\(name)")
            #expect(try HelperMessage.decode(line) == message, "\(name)")
        }
    }

    @Test(arguments: ["helper.ready.json", "helper.transcript.json", "helper.errorReply.json", "helper.sttStatus.json"])
    func encodingMatchesFixtureExactly(name: String) throws {
        let message = try HelperMessage.decode(fixture(name))
        let encoded = try JSONSerialization.jsonObject(with: Data(message.encodedLine().utf8)) as? NSDictionary
        let expected = try JSONSerialization.jsonObject(with: Data(fixture(name).utf8)) as? NSDictionary
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
        ("{\"v\":1,\"type\":\"insertText\",\"id\":\"a\",\"text\":\"\"}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"recordStop\"}", ProtocolError.invalidJSON),
    ])
    func rejects(line: String, expected: ProtocolError) {
        #expect(throws: expected) { try AppMessage.decode(line) }
    }
}

@Suite struct FnTrackerBehaviour {
    enum Input { case fn(Bool), key }

    @Test(arguments: [
        ([Input.fn(true), .fn(false)], [HotkeyPhase.down, .up]),
        ([.fn(true), .fn(true), .fn(false), .fn(false)], [.down, .up]),
        ([.key, .fn(false)], []),
        ([.fn(true), .key, .key, .fn(false)], [.down, .chord, .up]),
        ([.fn(true), .key, .fn(false), .fn(true), .key], [.down, .chord, .up, .down, .chord]),
    ])
    func phases(inputs: [Input], expected: [HotkeyPhase]) {
        var tracker = FnTracker()
        var out: [HotkeyPhase] = []
        for input in inputs {
            let phase: HotkeyPhase?
            switch input {
            case let .fn(down): phase = tracker.flagsChanged(fnDown: down)
            case .key: phase = tracker.keyDown()
            }
            if let phase { out.append(phase) }
        }
        #expect(out == expected)
    }
}
