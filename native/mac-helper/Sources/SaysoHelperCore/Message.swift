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

/// App → helper.
public enum AppMessage: Equatable, Sendable {
    case ping(id: String)
    case shutdown

    public static func decode(_ line: String) throws -> AppMessage {
        let data = Data(line.utf8)
        let decoder = JSONDecoder()
        let envelope: Envelope
        do {
            envelope = try decoder.decode(Envelope.self, from: data)
        } catch {
            throw ProtocolError.invalidJSON
        }
        guard envelope.v == protocolVersion else {
            throw ProtocolError.unsupportedVersion(envelope.v)
        }
        switch envelope.type {
        case "ping":
            struct Ping: Decodable { let id: String }
            guard let ping = try? decoder.decode(Ping.self, from: data), !ping.id.isEmpty else {
                throw ProtocolError.invalidJSON
            }
            return .ping(id: ping.id)
        case "shutdown":
            return .shutdown
        default:
            throw ProtocolError.unknownType(envelope.type)
        }
    }
}

public enum LogLevel: String, Codable, Sendable {
    case debug, info, warn, error
}

/// Helper → app.
public enum HelperMessage: Equatable, Sendable {
    case ready(helperVersion: String, os: String)
    case pong(id: String)
    case log(level: LogLevel, msg: String)
    case error(code: String, msg: String)

    /// One NDJSON line, including the trailing newline.
    public func encodedLine() -> String {
        var fields: [String: JSONValue] = ["v": .int(protocolVersion)]
        switch self {
        case let .ready(helperVersion, os):
            fields["type"] = .string("ready")
            fields["helperVersion"] = .string(helperVersion)
            fields["protocol"] = .int(protocolVersion)
            fields["os"] = .string(os)
        case let .pong(id):
            fields["type"] = .string("pong")
            fields["id"] = .string(id)
        case let .log(level, msg):
            fields["type"] = .string("log")
            fields["level"] = .string(level.rawValue)
            fields["msg"] = .string(msg)
        case let .error(code, msg):
            fields["type"] = .string("error")
            fields["code"] = .string(code)
            fields["msg"] = .string(msg)
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        // Encoding a dictionary of strings and ints cannot fail.
        let data = (try? encoder.encode(fields)) ?? Data("{}".utf8)
        return String(decoding: data, as: UTF8.self) + "\n"
    }

    /// Decodes a helper message (used by tests against the shared fixtures).
    public static func decode(_ line: String) throws -> HelperMessage {
        let data = Data(line.utf8)
        let decoder = JSONDecoder()
        guard let envelope = try? decoder.decode(Envelope.self, from: data) else {
            throw ProtocolError.invalidJSON
        }
        guard envelope.v == protocolVersion else {
            throw ProtocolError.unsupportedVersion(envelope.v)
        }
        do {
            switch envelope.type {
            case "ready":
                struct R: Decodable { let helperVersion: String; let `protocol`: Int; let os: String }
                let r = try decoder.decode(R.self, from: data)
                return .ready(helperVersion: r.helperVersion, os: r.os)
            case "pong":
                struct P: Decodable { let id: String }
                return .pong(id: try decoder.decode(P.self, from: data).id)
            case "log":
                struct L: Decodable { let level: LogLevel; let msg: String }
                let l = try decoder.decode(L.self, from: data)
                return .log(level: l.level, msg: l.msg)
            case "error":
                struct E: Decodable { let code: String; let msg: String }
                let e = try decoder.decode(E.self, from: data)
                return .error(code: e.code, msg: e.msg)
            default:
                throw ProtocolError.unknownType(envelope.type)
            }
        } catch let error as ProtocolError {
            throw error
        } catch {
            throw ProtocolError.invalidJSON
        }
    }
}

enum JSONValue: Encodable {
    case string(String)
    case int(Int)

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value): try container.encode(value)
        case let .int(value): try container.encode(value)
        }
    }
}
