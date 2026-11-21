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

/// Handles app → helper messages. OS features (Fn tap, mic, AX) plug in here in later steps.
@MainActor
public final class MessageLoop {
    public static let helperVersion = "0.1.0"

    private let writer: LineWriter
    private let osDescription: String

    public init(writer: LineWriter, osDescription: String = MessageLoop.currentOS()) {
        self.writer = writer
        self.osDescription = osDescription
    }

    /// Must be called once before handling any line: the app waits for `ready`.
    public func start() {
        send(.ready(helperVersion: Self.helperVersion, os: osDescription))
    }

    public func handle(line: String) -> LoopOutcome {
        if line.trimmingCharacters(in: .whitespaces).isEmpty { return .keepRunning }
        do {
            switch try AppMessage.decode(line) {
            case let .ping(id):
                send(.pong(id: id))
                return .keepRunning
            case .shutdown:
                return .stop
            }
        } catch {
            send(.error(code: "bad_message", msg: "could not decode line: \(error)"))
            return .keepRunning
        }
    }

    private func send(_ message: HelperMessage) {
        writer.write(message.encodedLine())
    }

    public nonisolated static func currentOS() -> String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "macOS \(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }
}
