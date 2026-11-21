import AppKit
import ApplicationServices
import SaysoHelperCore

/// Frontmost app from NSWorkspace (no permission needed) plus the focused element from the
/// Accessibility API (needs Accessibility permission; without it the focus is simply unknown).
@MainActor
public final class WorkspaceContext: ContextProviding {
    public init() {}

    public func current() -> AppContext {
        let app = NSWorkspace.shared.frontmostApplication
        let focus = Self.focusedElement()
        return AppContext(
            bundleId: app?.bundleIdentifier, appName: app?.localizedName,
            focusRole: focus.role, secureField: focus.secure)
    }

    private static func focusedElement() -> (role: String?, secure: Bool) {
        guard AXIsProcessTrusted() else { return (nil, false) }
        let system = AXUIElementCreateSystemWide()
        // A hung app must not stall dictation: give up on slow Accessibility replies quickly.
        AXUIElementSetMessagingTimeout(system, 0.25)
        var value: CFTypeRef?
        guard
            AXUIElementCopyAttributeValue(system, kAXFocusedUIElementAttribute as CFString, &value) == .success,
            let value, CFGetTypeID(value) == AXUIElementGetTypeID()
        else { return (nil, false) }
        let element = unsafeDowncast(value, to: AXUIElement.self)
        let role = stringAttribute(element, kAXRoleAttribute)
        let subrole = stringAttribute(element, kAXSubroleAttribute)
        return (role, subrole == (kAXSecureTextFieldSubrole as String))
    }

    private static func stringAttribute(_ element: AXUIElement, _ name: String) -> String? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
        return value as? String
    }
}
