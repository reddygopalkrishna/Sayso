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

private func bundleID(_ data: Data) throws -> String {
    struct B: Decodable { let bundleId: String }
    let id = try field(B.self, data).bundleId
    guard !id.isEmpty, id.count <= 200 else { throw ProtocolError.invalidJSON }
    return id
}

public enum PermissionKind: String, Codable, Sendable {
    case microphone, accessibility
}

public enum MicrophoneAccess: String, Codable, Sendable {
    case granted, denied, undetermined, restricted
}

/// What macOS lets Sayso do right now.
public struct PermissionState: Equatable, Sendable {
    public var microphone: MicrophoneAccess
    public var accessibility: Bool

    public init(microphone: MicrophoneAccess, accessibility: Bool) {
        self.microphone = microphone
        self.accessibility = accessibility
    }
}

public enum ScrollDirection: String, Codable, Sendable {
    case up, down
}

/// An installed or running app, for the app resolver in the Electron app.
public struct AppInfo: Codable, Equatable, Sendable {
    public var name: String
    public var bundleId: String
    public var running: Bool

    public init(name: String, bundleId: String, running: Bool) {
        self.name = name
        self.bundleId = bundleId
        self.running = running
    }
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
    case captureEscape(id: String, enabled: Bool)
    case setHoldKey(id: String, key: HoldKey)
    case startListening(id: String)
    case listElements(id: String)
    case setLanguage(id: String, language: String?)
    case stopListening(id: String)
    case scroll(id: String, direction: ScrollDirection, amount: Int)
    case pressElement(id: String, label: String)
    case pressPosition(id: String, kind: PositionKind, index: Int)
    case focusField(id: String, label: String)
    case listApps(id: String)
    case openApp(id: String, bundleId: String)
    case activateApp(id: String, bundleId: String)
    case openURL(id: String, url: String)
    case getPermissions(id: String)
    case requestPermission(id: String, kind: PermissionKind)

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
        case "scroll":
            struct S: Decodable { let direction: ScrollDirection; let amount: Int }
            let scroll = try field(S.self, data)
            guard (50...5000).contains(scroll.amount) else { throw ProtocolError.invalidJSON }
            return .scroll(id: try requestID(data), direction: scroll.direction, amount: scroll.amount)
        case "pressElement":
            struct P: Decodable { let label: String }
            let label = try field(P.self, data).label
            guard !label.isEmpty, label.count <= 200 else { throw ProtocolError.invalidJSON }
            return .pressElement(id: try requestID(data), label: label)
        case "listApps": return .listApps(id: try requestID(data))
        case "openApp": return .openApp(id: try requestID(data), bundleId: try bundleID(data))
        case "activateApp": return .activateApp(id: try requestID(data), bundleId: try bundleID(data))
        case "openURL":
            struct U: Decodable { let url: String }
            let url = try field(U.self, data).url
            guard !url.isEmpty, url.count <= 2048 else { throw ProtocolError.invalidJSON }
            return .openURL(id: try requestID(data), url: url)
        case "getPermissions": return .getPermissions(id: try requestID(data))
        case "requestPermission":
            struct R: Decodable { let kind: PermissionKind }
            return .requestPermission(id: try requestID(data), kind: try field(R.self, data).kind)
        case "captureEscape":
            struct E: Decodable { let enabled: Bool }
            return .captureEscape(id: try requestID(data), enabled: try field(E.self, data).enabled)
        case "focusField":
            struct F: Decodable { let label: String }
            let label = try field(F.self, data).label
            guard !label.isEmpty, label.count <= 200 else { throw ProtocolError.invalidJSON }
            return .focusField(id: try requestID(data), label: label)
        case "pressPosition":
            struct P: Decodable { let kind: PositionKind; let index: Int }
            let p = try field(P.self, data)
            guard p.index == -1 || (1...50).contains(p.index) else { throw ProtocolError.invalidJSON }
            return .pressPosition(id: try requestID(data), kind: p.kind, index: p.index)
        case "setLanguage":
            struct L: Decodable { let language: String? }
            let code = try field(L.self, data).language
            // Two lowercase letters (ISO 639-1), or null for "detect the language".
            if let code, code.count != 2 || !code.allSatisfy({ $0 >= "a" && $0 <= "z" }) {
                throw ProtocolError.invalidJSON
            }
            return .setLanguage(id: try requestID(data), language: code)
        case "listElements": return .listElements(id: try requestID(data))
        case "startListening": return .startListening(id: try requestID(data))
        case "stopListening": return .stopListening(id: try requestID(data))
        case "setHoldKey":
            struct H: Decodable { let key: HoldKey }
            return .setHoldKey(id: try requestID(data), key: try field(H.self, data).key)
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
    /// Shift was held together with Fn: this utterance is a command, not dictation.
    case command
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
    /// Accessibility role of the focused element, e.g. "AXTextField"; nil when unknown.
    public var focusRole: String?
    /// True when the focused element is a password field (AXSecureTextField).
    public var secureField: Bool

    public init(bundleId: String?, appName: String?, focusRole: String? = nil, secureField: Bool = false) {
        self.bundleId = bundleId
        self.appName = appName
        self.focusRole = focusRole
        self.secureField = secureField
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
    /// One utterance heard while listening continuously (hands-free). Not an answer to a request.
    case heard(transcription: Transcription, audioMs: Double, sttMs: Double, model: String)
    case context(id: String, context: AppContext)
    case apps(id: String, apps: [AppInfo])
    case elements(id: String, items: [ScreenElement])
    case permissions(id: String, state: PermissionState)
    case hotkey(phase: HotkeyPhase)
    case escape
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
        case let .heard(transcription, audioMs, sttMs, model):
            f["type"] = "heard"
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
            f["focusRole"] = context.focusRole.map(JSONValue.string) ?? .null
            f["secureField"] = .bool(context.secureField)
        case let .apps(id, apps):
            f["type"] = "apps"
            f["id"] = .string(id)
            f["apps"] = .array(apps.map {
                .object([
                    "name": .string($0.name), "bundleId": .string($0.bundleId),
                    "running": .bool($0.running),
                ])
            })
        case let .elements(id, items):
            f["type"] = "elements"
            f["id"] = .string(id)
            f["items"] = .array(items.map { .object(["label": .string($0.label), "role": .string($0.role)]) })
        case let .permissions(id, state):
            f["type"] = "permissions"
            f["id"] = .string(id)
            f["microphone"] = .string(state.microphone.rawValue)
            f["accessibility"] = .bool(state.accessibility)
        case .escape:
            f["type"] = "escape"
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
        case "heard":
            struct T: Decodable {
                let text: String; let words: [Word]
                let audioMs: Double; let sttMs: Double; let model: String
            }
            let t = try field(T.self, data)
            return .heard(
                transcription: Transcription(text: t.text, words: t.words),
                audioMs: t.audioMs, sttMs: t.sttMs, model: t.model)
        case "context":
            struct C: Decodable {
                let id: String; let bundleId: String?; let appName: String?
                let focusRole: String?; let secureField: Bool
            }
            let c = try field(C.self, data)
            return .context(
                id: c.id,
                context: AppContext(
                    bundleId: c.bundleId, appName: c.appName, focusRole: c.focusRole,
                    secureField: c.secureField))
        case "apps":
            struct A: Decodable { let id: String; let apps: [AppInfo] }
            let a = try field(A.self, data)
            return .apps(id: a.id, apps: a.apps)
        case "elements":
            struct I: Decodable { let label: String; let role: String }
            struct E: Decodable { let id: String; let items: [I] }
            let e = try field(E.self, data)
            return .elements(id: e.id, items: e.items.map { ScreenElement(label: $0.label, role: $0.role) })
        case "permissions":
            struct P: Decodable { let id: String; let microphone: MicrophoneAccess; let accessibility: Bool }
            let p = try field(P.self, data)
            return .permissions(
                id: p.id, state: PermissionState(microphone: p.microphone, accessibility: p.accessibility))
        case "escape": return .escape
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
    public static let elementNotFound = "element_not_found"
    public static let appNotFound = "app_not_found"
    public static let badUrl = "bad_url"
}

indirect enum JSONValue: Encodable, ExpressibleByStringLiteral {
    case string(String)
    case int(Int)
    case bool(Bool)
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
        case let .bool(value): try container.encode(value)
        case let .double(value): try container.encode(value.isFinite ? value : 0)
        case let .array(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}
