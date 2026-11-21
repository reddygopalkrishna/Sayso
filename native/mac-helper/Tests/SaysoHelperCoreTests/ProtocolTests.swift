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
        #expect(names.count == 22)
        for name in names {
            #expect(throws: Never.self, "\(name)") { try AppMessage.decode(fixture(name)) }
        }
        #expect(try AppMessage.decode(fixture("app.pressPosition.json")) == .pressPosition(id: "n-1", kind: .row, index: 3))
        #expect(try AppMessage.decode(fixture("app.setLanguage.json")) == .setLanguage(id: "g-1", language: "te"))
        #expect(try AppMessage.decode(fixture("app.startListening.json")) == .startListening(id: "l-1"))
        #expect(try AppMessage.decode(fixture("app.stopListening.json")) == .stopListening(id: "l-2"))
        #expect(try AppMessage.decode(fixture("app.setHoldKey.json")) == .setHoldKey(id: "h-1", key: .rightOption))
        #expect(try AppMessage.decode(fixture("app.insertText.json")) == .insertText(id: "i-1", text: "Hello from Sayso"))
    }

    @Test func everyHelperFixtureRoundTrips() throws {
        let names = try fixtureNames(prefix: "helper.")
        #expect(names.count == 18)
        for name in names {
            let message = try HelperMessage.decode(fixture(name))
            let line = message.encodedLine()
            #expect(line.hasSuffix("\n"), "\(name)")
            #expect(!line.dropLast().contains("\n"), "\(name)")
            #expect(try HelperMessage.decode(line) == message, "\(name)")
        }
    }

    @Test(arguments: ["helper.ready.json", "helper.transcript.json", "helper.heard.json", "helper.errorReply.json", "helper.sttStatus.json", "helper.contextEmpty.json", "helper.contextSecure.json", "helper.context.json"])
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
        ("{\"v\":1,\"type\":\"captureEscape\",\"id\":\"e\"}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"setHoldKey\",\"id\":\"h\",\"key\":\"capsLock\"}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"setHoldKey\",\"id\":\"h\"}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"setLanguage\",\"id\":\"g\",\"language\":\"telugu\"}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"setLanguage\",\"id\":\"g\",\"language\":\"TE\"}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"pressPosition\",\"id\":\"n\",\"kind\":\"row\",\"index\":0}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"pressPosition\",\"id\":\"n\",\"kind\":\"tab\",\"index\":1}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"requestPermission\",\"id\":\"r\",\"kind\":\"screen\"}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"scroll\",\"id\":\"s\",\"direction\":\"down\",\"amount\":10}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"scroll\",\"id\":\"s\",\"direction\":\"left\",\"amount\":100}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"openApp\",\"id\":\"o\",\"bundleId\":\"\"}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"pressElement\",\"id\":\"p\",\"label\":\"\"}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"keyPress\",\"id\":\"k\",\"key\":\"F13\",\"modifiers\":[]}", ProtocolError.invalidJSON),
        ("{\"v\":1,\"type\":\"keyPress\",\"id\":\"k\",\"key\":\"a\",\"modifiers\":[\"hyper\"]}", ProtocolError.invalidJSON),
    ])
    func rejects(line: String, expected: ProtocolError) {
        #expect(throws: expected) { try AppMessage.decode(line) }
    }
}

@Suite struct FnTrackerBehaviour {
    enum Input { case fn(Bool), flags(fn: Bool, shift: Bool), key }

    @Test(arguments: [
        ([Input.fn(true), .fn(false)], [HotkeyPhase.down, .up]),
        ([.fn(true), .fn(true), .fn(false), .fn(false)], [.down, .up]),
        ([.key, .fn(false)], []),
        ([.fn(true), .key, .key, .fn(false)], [.down, .chord, .up]),
        ([.fn(true), .key, .fn(false), .fn(true), .key], [.down, .chord, .up, .down, .chord]),
        // Shift held with Fn turns the hold into a command, once per hold, in either order.
        ([.flags(fn: true, shift: false), .flags(fn: true, shift: true), .flags(fn: false, shift: true)],
         [.down, .command, .up]),
        ([.flags(fn: true, shift: true), .flags(fn: false, shift: false)], [.down, .command, .up]),
        ([.flags(fn: true, shift: true), .flags(fn: true, shift: false), .flags(fn: true, shift: true)],
         [.down, .command]),
        ([.flags(fn: false, shift: true), .flags(fn: false, shift: false)], []),
        ([.flags(fn: true, shift: true), .flags(fn: false, shift: false), .flags(fn: true, shift: false)],
         [.down, .command, .up, .down]),
    ])
    func phases(inputs: [Input], expected: [HotkeyPhase]) {
        var tracker = FnTracker()
        var out: [HotkeyPhase] = []
        for input in inputs {
            switch input {
            case let .fn(down): out += tracker.flagsChanged(fnDown: down)
            case let .flags(fn, shift): out += tracker.flagsChanged(fnDown: fn, shiftDown: shift)
            case .key:
                if let phase = tracker.keyDown() { out.append(phase) }
            }
        }
        #expect(out == expected)
    }
}

@Suite struct KeyMapCoverage {
    /// Every key the protocol allows (KeySchema in messages.ts) must have a key code.
    @Test func coversEveryProtocolKey() {
        let named = ["enter", "tab", "escape", "space", "delete", "forwardDelete", "up", "down",
                     "left", "right", "home", "end", "pageUp", "pageDown", "leftBracket", "rightBracket"]
        let characters = (Array("abcdefghijklmnopqrstuvwxyz") + Array("0123456789")).map(String.init)
        for key in named + characters {
            #expect(KeyMap.code(for: key) != nil, "\(key)")
        }
        #expect(KeyMap.code(for: "F13") == nil)
        #expect(KeyMap.code(for: "ab") == nil)
    }
}

@Suite struct LabelMatching {
    @Test(arguments: [
        ("submit", "Submit", 3),
        ("Submit", "submit!", 3),
        ("submit", "Submit form", 2),
        ("save", "Save and close", 2),
        ("close", "Save and close", 1),
        ("submit", "Resubmit", 0),
        ("sub", "Submit", 0),
        ("new tab", "New Tab", 3),
        ("", "Submit", 0),
        ("submit", "", 0),
        ("café", "Café", 3),
    ])
    func scores(query: String, text: String, expected: Int) {
        #expect(LabelMatch.score(query: query, text: text) == expected)
    }
}

@Suite struct HoldKeyDetection {
    @Test func fnUsesTheSecondaryFnFlag() {
        #expect(HoldKey.fn.isDown(flags: 0x0080_0000))
        #expect(!HoldKey.fn.isDown(flags: 0))
    }

    @Test(arguments: [
        (HoldKey.rightCommand, UInt64(0x10), UInt64(0x08)),
        (HoldKey.rightOption, UInt64(0x40), UInt64(0x20)),
        (HoldKey.rightControl, UInt64(0x2000), UInt64(0x01)),
    ])
    func rightKeysAreToldApartFromTheirLeftTwins(key: HoldKey, right: UInt64, left: UInt64) {
        #expect(key.isDown(flags: right))
        #expect(!key.isDown(flags: left))
        #expect(!key.isDown(flags: 0))
    }

    @Test func otherModifiersDoNotCount() {
        // Shift (0x02) is not a hold key; Fn held does not trigger the right-hand keys.
        for key in [HoldKey.rightCommand, .rightOption, .rightControl] {
            #expect(!key.isDown(flags: 0x0080_0000 | 0x02))
        }
    }
}

