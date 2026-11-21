import Foundation

/// Mirrors packages/helper-protocol/src/messages.ts (protocol v1). Keep both in sync; the shared
/// fixtures in packages/helper-protocol/fixtures are decoded by tests on both sides.
public let protocolVersion = 1

public enum ProtocolError: Error, Equatable, Sendable {
    case invalidJSON
    case unsupportedVersion(Int)
    case unknownType(String)
}

private struct Envelope: Decodable {
    let v: Int
    let type: String
}

private func envelope(_ data: Data) throws -> Envelope {
    guard let envelope = try? JSONDecoder().decode(Envelope.self, from: data) else {
        throw ProtocolError.invalidJSON
    }
    guard envelope.v == protocolVersion else {
        throw ProtocolError.unsupportedVersion(envelope.v)
    }
    return envelope
}

private func field<T: Decodable>(_ type: T.Type, _ data: Data) throws -> T {
    do {
        return try JSONDecoder().decode(T.self, from: data)
    } catch {
        throw ProtocolError.invalidJSON
    }
}

private struct WithID: Decodable {
    let id: String
}

private func requestID(_ data: Data) throws -> String {
    let id = try field(WithID.self, data).id
    guard !id.isEmpty, id.count <= 64 else { throw ProtocolError.invalidJSON }
    return id
}

/// App → helper.
public enum AppMessage: Equatable, Sendable {
    case ping(id: String)
    case shutdown
    case recordStart(id: String)
    case recordStop(id: String)
    case recordCancel(id: String)
    case insertText(id: String, text: String)
    case getContext(id: String)
    case keyPress(id: String, key: String, modifiers: [Modifier])

    public static func decode(_ line: String) throws -> AppMessage {
        let data = Data(line.utf8)
        switch try envelope(data).type {
        case "ping": return .ping(id: try requestID(data))
        case "shutdown": return .shutdown
        case "recordStart": return .recordStart(id: try requestID(data))
        case "recordStop": return .recordStop(id: try requestID(data))
        case "recordCancel": return .recordCancel(id: try requestID(data))
        case "insertText":
            struct T: Decodable { let text: String }
            let text = try field(T.self, data).text
            guard !text.isEmpty else { throw ProtocolError.invalidJSON }
            return .insertText(id: try requestID(data), text: text)
        case "getContext": return .getContext(id: try requestID(data))
        case "keyPress":
            struct K: Decodable { let key: String; let modifiers: [Modifier] }
            let k = try field(K.self, data)
            guard KeyMap.code(for: k.key) != nil, k.modifiers.count <= 4 else {
                throw ProtocolError.invalidJSON
            }
            return .keyPress(id: try requestID(data), key: k.key, modifiers: k.modifiers)
        case let other:
            throw ProtocolError.unknownType(other)
        }
    }
}

public enum Modifier: String, Codable, Sendable {
    case cmd, shift, option, ctrl
}

public enum LogLevel: String, Codable, Sendable {
    case debug, info, warn, error
}

public enum HotkeyPhase: String, Codable, Sendable {
    case down, up, chord
}

public enum FnListenerState: String, Codable, Sendable {
    case active, unavailable
}

public enum STTState: String, Codable, Sendable {
    case loading, ready, error
}

public struct Word: Codable, Equatable, Sendable {
    public var text: String
    public var startMs: Double
    public var endMs: Double
    public var p: Double

    public init(text: String, startMs: Double, endMs: Double, p: Double) {
        self.text = text
        self.startMs = startMs
        self.endMs = endMs
        self.p = p
    }
}

/// The app the user is working in (and, from step 5, the focused element).
public struct AppContext: Equatable, Sendable {
    public var bundleId: String?
    public var appName: String?

    public init(bundleId: String?, appName: String?) {
        self.bundleId = bundleId
        self.appName = appName
    }
}

public struct Transcription: Equatable, Sendable {
    public var text: String
    public var words: [Word]

    public init(text: String, words: [Word]) {
        self.text = text
        self.words = words
    }
}

/// Helper → app.
public enum HelperMessage: Equatable, Sendable {
    case ready(helperVersion: String, os: String)
    case pong(id: String)
    case done(id: String)
    case transcript(id: String, transcription: Transcription, audioMs: Double, sttMs: Double, model: String)
    case context(id: String, context: AppContext)
    case hotkey(phase: HotkeyPhase)
    case fnListener(state: FnListenerState)
    case sttStatus(state: STTState, model: String, msg: String?)
    case log(level: LogLevel, msg: String)
    case error(id: String?, code: String, msg: String)

    /// One NDJSON line, including the trailing newline.
    public func encodedLine() -> String {
        var f: [String: JSONValue] = ["v": .int(protocolVersion)]
        switch self {
        case let .ready(helperVersion, os):
            f["type"] = "ready"
            f["helperVersion"] = .string(helperVersion)
            f["protocol"] = .int(protocolVersion)
            f["os"] = .string(os)
        case let .pong(id):
            f["type"] = "pong"
            f["id"] = .string(id)
        case let .done(id):
            f["type"] = "done"
            f["id"] = .string(id)
        case let .transcript(id, transcription, audioMs, sttMs, model):
            f["type"] = "transcript"
            f["id"] = .string(id)
            f["text"] = .string(transcription.text)
            f["words"] = .array(transcription.words.map { w in
                .object([
                    "text": .string(w.text),
                    "startMs": .double(w.startMs),
                    "endMs": .double(w.endMs),
                    "p": .double(w.p),
                ])
            })
            f["audioMs"] = .double(audioMs)
            f["sttMs"] = .double(sttMs)
            f["model"] = .string(model)
        case let .context(id, context):
            f["type"] = "context"
            f["id"] = .string(id)
            f["bundleId"] = context.bundleId.map(JSONValue.string) ?? .null
            f["appName"] = context.appName.map(JSONValue.string) ?? .null
        case let .hotkey(phase):
            f["type"] = "hotkey"
            f["key"] = "fn"
            f["phase"] = .string(phase.rawValue)
        case let .fnListener(state):
            f["type"] = "fnListener"
            f["state"] = .string(state.rawValue)
        case let .sttStatus(state, model, msg):
            f["type"] = "sttStatus"
            f["state"] = .string(state.rawValue)
            f["model"] = .string(model)
            if let msg { f["msg"] = .string(msg) }
        case let .log(level, msg):
            f["type"] = "log"
            f["level"] = .string(level.rawValue)
            f["msg"] = .string(msg)
        case let .error(id, code, msg):
            f["type"] = "error"
            if let id { f["id"] = .string(id) }
            f["code"] = .string(code)
            f["msg"] = .string(msg)
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        // Encoding strings, numbers, arrays and objects cannot fail (no NaN reaches here).
        let data = (try? encoder.encode(JSONValue.object(f))) ?? Data("{}".utf8)
        return String(decoding: data, as: UTF8.self) + "\n"
    }

    /// Decodes a helper message (used by tests against the shared fixtures).
    public static func decode(_ line: String) throws -> HelperMessage {
        let data = Data(line.utf8)
        switch try envelope(data).type {
        case "ready":
            struct R: Decodable { let helperVersion: String; let `protocol`: Int; let os: String }
            let r = try field(R.self, data)
            return .ready(helperVersion: r.helperVersion, os: r.os)
        case "pong": return .pong(id: try requestID(data))
        case "done": return .done(id: try requestID(data))
        case "transcript":
            struct T: Decodable {
                let id: String; let text: String; let words: [Word]
                let audioMs: Double; let sttMs: Double; let model: String
            }
            let t = try field(T.self, data)
            return .transcript(
                id: t.id, transcription: Transcription(text: t.text, words: t.words),
                audioMs: t.audioMs, sttMs: t.sttMs, model: t.model)
        case "context":
            struct C: Decodable { let id: String; let bundleId: String?; let appName: String? }
            let c = try field(C.self, data)
            return .context(id: c.id, context: AppContext(bundleId: c.bundleId, appName: c.appName))
        case "hotkey":
            struct H: Decodable { let key: String; let phase: HotkeyPhase }
            let h = try field(H.self, data)
            guard h.key == "fn" else { throw ProtocolError.invalidJSON }
            return .hotkey(phase: h.phase)
        case "fnListener":
            struct F: Decodable { let state: FnListenerState }
            return .fnListener(state: try field(F.self, data).state)
        case "sttStatus":
            struct S: Decodable { let state: STTState; let model: String; let msg: String? }
            let s = try field(S.self, data)
            return .sttStatus(state: s.state, model: s.model, msg: s.msg)
        case "log":
            struct L: Decodable { let level: LogLevel; let msg: String }
            let l = try field(L.self, data)
            return .log(level: l.level, msg: l.msg)
        case "error":
            struct E: Decodable { let id: String?; let code: String; let msg: String }
            let e = try field(E.self, data)
            return .error(id: e.id, code: e.code, msg: e.msg)
        case let other:
            throw ProtocolError.unknownType(other)
        }
    }
}

/// Error codes; mirror HelperErrorCode in messages.ts.
public enum HelperErrorCode {
    public static let badMessage = "bad_message"
    public static let micDenied = "mic_denied"
    public static let micFailed = "mic_failed"
    public static let notRecording = "not_recording"
    public static let alreadyRecording = "already_recording"
    public static let sttFailed = "stt_failed"
    public static let accessibilityDenied = "accessibility_denied"
}

indirect enum JSONValue: Encodable, ExpressibleByStringLiteral {
    case string(String)
    case int(Int)
    case double(Double)
    case array([JSONValue])
    case object([String: JSONValue])
    case null

    init(stringLiteral value: String) {
        self = .string(value)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value): try container.encode(value)
        case let .int(value): try container.encode(value)
        case let .double(value): try container.encode(value.isFinite ? value : 0)
        case let .array(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}
