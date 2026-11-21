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
public protocol AppControlling: AnyObject {
    /// Installed and running apps (running ones flagged).
    func listApps() -> [AppInfo]
    /// Launches the app, or brings it to the front if it is running. Throws `ServiceError`.
    func open(bundleId: String) async throws
    /// Brings a running app to the front. Throws `ServiceError` (app_not_found) if it is not running.
    func activate(bundleId: String) async throws
    /// Opens an http(s) URL in the default browser. Throws `ServiceError` (bad_url).
    func openURL(_ url: String) throws
}

@MainActor
public protocol PermissionControlling: AnyObject {
    func status() -> PermissionState
    /// Asks macOS for the permission and returns the status afterwards. Microphone waits for the
    /// user's answer to the system prompt; Accessibility shows the system dialog and returns at once.
    func request(_ kind: PermissionKind) async -> PermissionState
}

@MainActor
public protocol Scrolling: AnyObject {
    /// Scrolls the view under the pointer. Throws `ServiceError` (accessibility_denied).
    func scroll(direction: ScrollDirection, amount: Int) throws
}

@MainActor
public protocol ElementPressing: AnyObject {
    /// Presses the button, link or menu item called `label` in the frontmost app.
    /// Throws `ServiceError` (element_not_found / accessibility_denied).
    func press(label: String) async throws
}

@MainActor
public protocol EscapeCapturing: AnyObject {
    /// While on, the Escape key is swallowed and reported; implementations must switch themselves
    /// off after a few seconds so a crashed app cannot leave Escape disabled.
    func setCapture(_ enabled: Bool)
}

@MainActor
public protocol HoldKeyConfiguring: AnyObject {
    /// Changes the key that is held to dictate. Takes effect for the next hold.
    func setHoldKey(_ key: HoldKey)
}

@MainActor
public protocol KeyPressing: AnyObject {
    /// Presses one key with modifiers in the frontmost app. Throws `ServiceError`
    /// (accessibility_denied) when synthetic input is not allowed.
    func press(keyCode: UInt16, modifiers: [Modifier]) async throws
}
