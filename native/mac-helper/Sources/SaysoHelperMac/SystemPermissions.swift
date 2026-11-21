import AVFoundation
import ApplicationServices
import SaysoHelperCore

/// Reads and requests the two macOS permissions Sayso needs. In development they belong to the
/// app that launched Sayso (Terminal, for example); in a packaged build, to Sayso itself.
@MainActor
public final class SystemPermissions: PermissionControlling {
    public init() {}

    public func status() -> PermissionState {
        PermissionState(microphone: Self.microphoneStatus(), accessibility: AXIsProcessTrusted())
    }

    public func request(_ kind: PermissionKind) async -> PermissionState {
        switch kind {
        case .microphone:
            if AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
                _ = await AVCaptureDevice.requestAccess(for: .audio)
            }
        case .accessibility:
            // The documented key behind kAXTrustedCheckOptionPrompt. The system dialog points the
            // user to System Settings; macOS never grants this one automatically.
            _ = AXIsProcessTrustedWithOptions(["AXTrustedCheckOptionPrompt": true] as CFDictionary)
        }
        return status()
    }

    private static func microphoneStatus() -> MicrophoneAccess {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return .granted
        case .denied: return .denied
        case .restricted: return .restricted
        case .notDetermined: return .undetermined
        @unknown default: return .undetermined
        }
    }
}
