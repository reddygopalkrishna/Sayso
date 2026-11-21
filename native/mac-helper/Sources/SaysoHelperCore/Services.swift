import Foundation

/// OS services the message loop drives. Real implementations live in SaysoHelperMac; tests use
/// fakes. All product decisions (when to record, what to insert) are made by the Electron app.

/// A failure that maps to a protocol error code.
public struct ServiceError: Error, Equatable, Sendable {
    public let code: String
    public let message: String

    public init(code: String, message: String) {
        self.code = code
        self.message = message
    }
}

@MainActor
public protocol AudioRecording: AnyObject {
    /// Starts capturing 16 kHz mono samples. Throws `ServiceError` (mic_denied / mic_failed).
    func start() async throws
    /// Stops capturing and returns the samples since `start()`.
    func stop() -> [Float]
    /// Stops capturing and drops the samples.
    func cancel()
}

public protocol Transcribing: Sendable {
    var modelName: String { get }
    /// Transcribes 16 kHz mono samples with word timings. Throws `ServiceError` (stt_failed).
    func transcribe(_ samples: [Float]) async throws -> Transcription
}

@MainActor
public protocol TextInserting: AnyObject {
    /// Inserts text into the focused field. Throws `ServiceError` (accessibility_denied).
    func insert(_ text: String) async throws
}

public let sampleRate: Double = 16_000

@MainActor
public protocol ContextProviding: AnyObject {
    func current() -> AppContext
}

@MainActor
public protocol KeyPressing: AnyObject {
    /// Presses one key with modifiers in the frontmost app. Throws `ServiceError`
    /// (accessibility_denied) when synthetic input is not allowed.
    func press(keyCode: UInt16, modifiers: [Modifier]) async throws
}
