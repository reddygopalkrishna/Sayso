import AppKit
import ApplicationServices
import SaysoHelperCore

/// "Click Submit": finds a button, link or menu item in the frontmost app by its visible label and
/// presses it through Accessibility (AXPress). A breadth-first search with node and time limits,
/// so a huge window can never stall a command.
@MainActor
public final class AXElementPresser: ElementPressing {
    private static let pressableRoles: Set<String> = [
        "AXButton", "AXLink", "AXMenuItem", "AXMenuBarItem", "AXCheckBox", "AXRadioButton",
        "AXPopUpButton", "AXMenuButton", "AXDisclosureTriangle",
    ]
    private static let maxNodes = 4000
    private static let timeBudget: Duration = .milliseconds(300)

    public init() {}

    public func press(label: String) async throws {
        guard AXIsProcessTrusted() else {
            throw ServiceError(
                code: HelperErrorCode.accessibilityDenied,
                message: "Accessibility access is off, so Sayso cannot click.")
        }
        guard let app = NSWorkspace.shared.frontmostApplication else {
            throw Self.notFound(label)
        }
        let root = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 0.2)
        // Chromium and Electron apps (Chrome, ChatGPT, Slack, WhatsApp desktop…) build their
        // accessibility tree only when asked. Without this, "click Profile" finds nothing there.
        enableWebAccessibility(app.processIdentifier, root: root)

        let started = ContinuousClock.now
        // Search the focused window first (what the user is looking at), then the whole app.
        var starts: [AXUIElement] = []
        if let window = Self.element(root, kAXFocusedWindowAttribute) { starts.append(window) }
        starts.append(root)

        var best: (score: Int, target: AXUIElement)?
        for start in starts where best == nil || (best?.score ?? 0) < 3 {
            best = Self.search(from: start, label: label, started: started, best: best)
        }

        guard let best else { throw Self.notFound(label) }
        let result = AXUIElementPerformAction(best.target, kAXPressAction as CFString)
        guard result == .success else {
            throw ServiceError(
                code: HelperErrorCode.elementNotFound,
                message: "Found “\(label)” but could not press it.")
        }
    }

    /// Asks a Chromium/Electron app to expose its web content to Accessibility. Done once per
    /// process id; native apps ignore the attribute.
    private func enableWebAccessibility(_ pid: pid_t, root: AXUIElement) {
        guard !Self.enabledPids.contains(pid) else { return }
        Self.enabledPids.insert(pid)
        AXUIElementSetAttributeValue(root, "AXManualAccessibility" as CFString, kCFBooleanTrue)
    }

    private nonisolated(unsafe) static var enabledPids: Set<pid_t> = []

    private static func element(_ parent: AXUIElement, _ attribute: String) -> AXUIElement? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(parent, attribute as CFString, &value) == .success,
              let value, CFGetTypeID(value) == AXUIElementGetTypeID()
        else { return nil }
        return (value as! AXUIElement)
    }

    /// Breadth-first search for the best pressable match under `start`. Stops at a perfect match,
    /// the node cap, or the shared time budget. Keeps the better of `best` and any new match.
    private static func search(
        from start: AXUIElement, label: String, started: ContinuousClock.Instant,
        best: (score: Int, target: AXUIElement)?
    ) -> (score: Int, target: AXUIElement)? {
        var best = best
        // Each entry carries the nearest pressable ancestor, so matching text inside a button
        // (web links, custom buttons) presses the button.
        var queue: [(element: AXUIElement, ancestor: AXUIElement?)] = [(start, nil)]
        var head = 0
        while head < queue.count, head < maxNodes, ContinuousClock.now - started < timeBudget {
            let (element, ancestor) = queue[head]
            head += 1
            let role = string(element, kAXRoleAttribute)
            let pressable = role.map(pressableRoles.contains) ?? false

            var score = 0
            for attribute in [kAXTitleAttribute, kAXDescriptionAttribute] {
                if let text = string(element, attribute) {
                    score = max(score, LabelMatch.score(query: label, text: text))
                }
            }
            if role == "AXStaticText", let text = string(element, kAXValueAttribute) {
                score = max(score, LabelMatch.score(query: label, text: text))
            }
            if score > 0, let target = pressable ? element : (role == "AXStaticText" ? ancestor : nil),
               score > (best?.score ?? 0)
            {
                best = (score, target)
                if score == 3 { break }
            }
            let nextAncestor = pressable ? element : ancestor
            for child in children(element) { queue.append((child, nextAncestor)) }
        }
        return best
    }

    private static func notFound(_ label: String) -> ServiceError {
        ServiceError(
            code: HelperErrorCode.elementNotFound,
            message: "Couldn't find a button, link or menu item called “\(label)”.")
    }

    private static func string(_ element: AXUIElement, _ attribute: String) -> String? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
        return value as? String
    }

    private static func children(_ element: AXUIElement) -> [AXUIElement] {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value) == .success else {
            return []
        }
        return (value as? [AXUIElement]) ?? []
    }
}
