import ApplicationServices
import CoreGraphics
import SaysoHelperCore

/// Posts a synthetic key press (down + up) with modifiers. Needs Accessibility permission.
@MainActor
public final class KeyPresser: KeyPressing {
    public init() {}

    public func press(keyCode: UInt16, modifiers: [Modifier]) async throws {
        guard AXIsProcessTrusted() else {
            throw ServiceError(
                code: HelperErrorCode.accessibilityDenied,
                message: "Accessibility access is off, so Sayso cannot press keys.")
        }
        var flags: CGEventFlags = []
        for modifier in modifiers {
            switch modifier {
            case .cmd: flags.insert(.maskCommand)
            case .shift: flags.insert(.maskShift)
            case .option: flags.insert(.maskAlternate)
            case .ctrl: flags.insert(.maskControl)
            }
        }
        // A private source so modifiers the user is still holding (like Fn) do not leak in.
        let source = CGEventSource(stateID: .privateState)
        let down = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true)
        let up = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false)
        down?.flags = flags
        up?.flags = flags
        down?.post(tap: .cghidEventTap)
        up?.post(tap: .cghidEventTap)
    }
}
