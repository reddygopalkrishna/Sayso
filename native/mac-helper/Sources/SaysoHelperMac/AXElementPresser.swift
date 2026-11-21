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
        let newlyEnabled = enableWebAccessibility(app.processIdentifier, root: root)

        var best = Self.searchApp(root: root, label: label)
        // The first look at a web app can come before its tree is built. One short wait and one
        // more look, only for the first click in that app.
        if best == nil, newlyEnabled {
            try? await Task.sleep(for: .milliseconds(200))
            best = Self.searchApp(root: root, label: label)
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
    /// Returns true only the first time for this process, so the caller knows to allow a wait.
    @discardableResult
    private func enableWebAccessibility(_ pid: pid_t, root: AXUIElement) -> Bool {
        guard !Self.enabledPids.contains(pid) else { return false }
        Self.enabledPids.insert(pid)
        AXUIElementSetAttributeValue(root, "AXManualAccessibility" as CFString, kCFBooleanTrue)
        return true
    }

    /// Focused window first, then the whole app, sharing one time budget.
    private static func searchApp(root: AXUIElement, label: String) -> (score: Int, target: AXUIElement)? {
        let started = ContinuousClock.now
        var starts: [AXUIElement] = []
        if let window = element(root, kAXFocusedWindowAttribute) { starts.append(window) }
        starts.append(root)
        var best: (score: Int, target: AXUIElement)?
        for start in starts where best == nil || (best?.score ?? 0) < 3 {
            best = search(from: start, label: label, started: started, best: best)
        }
        return best
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

    /// "Open the third email": finds the items of that kind in the front window, counts them from
    /// the top, and presses the Nth (AXPress), or clicks its middle when it cannot be pressed (rows
    /// in web mail often cannot). Looks a little longer than a click by name, since lists are big.
    public func pressPosition(kind: PositionKind, index: Int) async throws {
        guard AXIsProcessTrusted() else {
            throw ServiceError(
                code: HelperErrorCode.accessibilityDenied,
                message: "Accessibility access is off, so Sayso cannot click.")
        }
        let missing = ServiceError(code: HelperErrorCode.elementNotFound, message: "No such item on screen.")
        guard let app = NSWorkspace.shared.frontmostApplication else { throw missing }
        let root = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 0.2)
        enableWebAccessibility(app.processIdentifier, root: root)
        let window = Self.element(root, kAXFocusedWindowAttribute) ?? root
        let bounds = Self.frame(window)

        for wanted in kind == .any ? [PositionKind.result, .row, .link] : [kind] {
            let found = Self.collect(wanted, from: window, within: bounds)
            if found.isEmpty { continue }
            guard let pick = PositionPicker.pick(found.map(\.item), index: index) else { throw missing }
            if ProcessInfo.processInfo.environment["SAYSO_DEBUG_POSITION"] == "1" {
                // Diagnostics for development only: what was found, in screen order, and which one.
                for (i, f) in found.enumerated() {
                    let text = Self.string(f.element, kAXTitleAttribute) ?? Self.string(f.element, kAXDescriptionAttribute) ?? ""
                    FileHandle.standardError.write(Data("[position] \(wanted.rawValue) #\(i) y=\(Int(f.item.y)) x=\(Int(f.item.x)) \(i == pick ? "PICK " : "")\(text.prefix(60))\n".utf8))
                }
            }
            // Web pages often ignore an accessibility press on links and rows (Google results do),
            // so those get a real click in their middle; buttons are pressed.
            try Self.activate(found[pick].element, at: found[pick].item, click: wanted != .button)
            return
        }
        throw missing
    }

    private static let positionNodes = 12_000
    private static let positionBudget: Duration = .milliseconds(700)

    /// The items of one kind under `start`, visible in `bounds`, in tree order.
    private static func collect(
        _ kind: PositionKind, from start: AXUIElement, within bounds: ScreenItem?
    ) -> [(element: AXUIElement, item: ScreenItem)] {
        let started = ContinuousClock.now
        var out: [(element: AXUIElement, item: ScreenItem)] = []
        // Each entry carries the nearest link above it: a search result is a link holding a heading.
        var queue: [(element: AXUIElement, link: AXUIElement?)] = [(start, nil)]
        var head = 0
        while head < queue.count, head < positionNodes, ContinuousClock.now - started < positionBudget {
            let (element, link) = queue[head]
            head += 1
            let role = string(element, kAXRoleAttribute)
            var candidate: AXUIElement?
            switch kind {
            case .link: if role == "AXLink" { candidate = element }
            case .row: if role == "AXRow" { candidate = element }
            case .button: if role == "AXButton" { candidate = element }
            case .result: if role == "AXHeading" { candidate = link ?? firstLink(under: element) }
            case .any: break
            }
            if let candidate, let item = frame(candidate), visible(item, in: bounds),
               !out.contains(where: { CFEqual($0.element, candidate) })
            {
                out.append((candidate, item))
            }
            let nextLink = role == "AXLink" ? element : link
            for child in children(element) { queue.append((child, nextLink)) }
        }
        return out
    }

    private static func firstLink(under heading: AXUIElement) -> AXUIElement? {
        var level = children(heading)
        for _ in 0..<2 {
            if let link = level.first(where: { string($0, kAXRoleAttribute) == "AXLink" }) { return link }
            level = level.flatMap(children)
        }
        return nil
    }

    private static func frame(_ element: AXUIElement) -> ScreenItem? {
        var positionRef: CFTypeRef?
        var sizeRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionRef) == .success,
              AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeRef) == .success,
              let positionRef, let sizeRef,
              CFGetTypeID(positionRef) == AXValueGetTypeID(), CFGetTypeID(sizeRef) == AXValueGetTypeID()
        else { return nil }
        var point = CGPoint.zero
        var size = CGSize.zero
        // swiftlint:disable:next force_cast
        AXValueGetValue(positionRef as! AXValue, .cgPoint, &point)
        // swiftlint:disable:next force_cast
        AXValueGetValue(sizeRef as! AXValue, .cgSize, &size)
        return ScreenItem(x: point.x, y: point.y, width: size.width, height: size.height)
    }

    /// Wholly inside the window: items scrolled out of view are reported at the window's edge.
    private static func visible(_ item: ScreenItem, in bounds: ScreenItem?) -> Bool {
        guard let bounds else { return true }
        return item.y >= bounds.y && item.y + item.height <= bounds.y + bounds.height
            && item.x >= bounds.x && item.x + item.width <= bounds.x + bounds.width
    }

    /// Presses the element; if it cannot be pressed, clicks the middle of it.
    private static func activate(_ element: AXUIElement, at item: ScreenItem, click: Bool) throws {
        if !click, AXUIElementPerformAction(element, kAXPressAction as CFString) == .success { return }
        // A link's text starts at its left; clicking near the left of the first line hits the text.
        let point = CGPoint(x: item.x + min(item.width / 2, 40), y: item.y + min(item.height / 2, 12))
        guard
            let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left),
            let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left),
            let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
        else {
            throw ServiceError(code: HelperErrorCode.elementNotFound, message: "Found it but could not click it.")
        }
        move.post(tap: .cghidEventTap)
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
    }

    private static func notFound(_ label: String) -> ServiceError {
        ServiceError(
            code: HelperErrorCode.elementNotFound,
            message: "Couldn't find “\(label)” on screen.")
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
