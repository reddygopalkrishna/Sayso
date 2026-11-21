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

        let started = ContinuousClock.now
        // Each entry carries the nearest pressable ancestor, so matching text inside a button
        // (web links, custom buttons) presses the button.
        var queue: [(element: AXUIElement, ancestor: AXUIElement?)] = [(root, nil)]
        var head = 0
        var best: (score: Int, target: AXUIElement)?
        while head < queue.count, head < Self.maxNodes, ContinuousClock.now - started < Self.timeBudget {
            let (element, ancestor) = queue[head]
            head += 1
            let role = Self.string(element, kAXRoleAttribute)
            let pressable = role.map(Self.pressableRoles.contains) ?? false

            var score = 0
            for attribute in [kAXTitleAttribute, kAXDescriptionAttribute] {
                if let text = Self.string(element, attribute) {
                    score = max(score, LabelMatch.score(query: label, text: text))
                }
            }
            if role == "AXStaticText", let text = Self.string(element, kAXValueAttribute) {
                score = max(score, LabelMatch.score(query: label, text: text))
            }
            if score > 0, let target = pressable ? element : (role == "AXStaticText" ? ancestor : nil),
               score > (best?.score ?? 0)
            {
                best = (score, target)
                if score == 3 { break }
            }
            let nextAncestor = pressable ? element : ancestor
            for child in Self.children(element) { queue.append((child, nextAncestor)) }
        }

        guard let best else { throw Self.notFound(label) }
        let result = AXUIElementPerformAction(best.target, kAXPressAction as CFString)
        guard result == .success else {
            throw ServiceError(
                code: HelperErrorCode.elementNotFound,
                message: "Found “\(label)” but could not press it.")
        }
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
