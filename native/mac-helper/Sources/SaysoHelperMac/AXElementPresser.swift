import AppKit
import ApplicationServices
import SaysoHelperCore

/// "Click Submit": finds a button, link or menu item in the frontmost app by its visible label and
/// presses it through Accessibility (AXPress). A breadth-first search with node and time limits,
/// so a huge window can never stall a command.
@MainActor
public final class AXElementPresser: ElementPressing, ScreenReading {
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

    private static let fieldRoles: Set<String> = ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"]

    /// A password field is a text field with this subrole: never listed, never focused by Sayso.
    private static func isSecure(_ element: AXUIElement) -> Bool {
        string(element, kAXSubroleAttribute) == "AXSecureTextField"
    }

    private static func friendlyRole(_ role: String) -> String {
        switch role {
        case "AXLink": "link"
        case "AXMenuItem", "AXMenuBarItem", "AXMenuButton", "AXPopUpButton": "menu"
        case "AXCheckBox", "AXRadioButton": "checkbox"
        case "AXTextField", "AXTextArea", "AXComboBox", "AXSearchField": "field"
        default: "button"
        }
    }

    /// What the front window shows that you could name: buttons, links, menu items and fields. Names
    /// only: a field is listed by its label or placeholder, never by what is typed in it, and a
    /// password field is skipped. Bounded like every search here, so a huge page cannot stall it.
    public func listElements() async throws -> [ScreenElement] {
        guard AXIsProcessTrusted() else {
            throw ServiceError(
                code: HelperErrorCode.accessibilityDenied,
                message: "Accessibility access is off, so Sayso cannot read the screen.")
        }
        guard let app = NSWorkspace.shared.frontmostApplication else { return [] }
        let root = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 0.2)
        enableWebAccessibility(app.processIdentifier, root: root)
        let window = Self.element(root, kAXFocusedWindowAttribute) ?? root
        let bounds = Self.frame(window)

        let started = ContinuousClock.now
        var raw: [RawScreenElement] = []
        var queue: [AXUIElement] = [window]
        var head = 0
        while head < queue.count, head < 6_000, ContinuousClock.now - started < .milliseconds(500) {
            let element = queue[head]
            head += 1
            let role = Self.string(element, kAXRoleAttribute) ?? ""
            if Self.pressableRoles.contains(role) || Self.fieldRoles.contains(role),
               !Self.isSecure(element),
               let item = Self.frame(element), Self.visible(item, in: bounds)
            {
                var label = Self.string(element, kAXTitleAttribute) ?? Self.string(element, kAXDescriptionAttribute) ?? ""
                if label.isEmpty, Self.fieldRoles.contains(role) {
                    label = Self.string(element, "AXPlaceholderValue") ?? ""
                }
                if label.isEmpty, !Self.fieldRoles.contains(role) {
                    // Web buttons and links often carry their name as a text child.
                    label = Self.children(element).lazy.compactMap { child in
                        Self.string(child, kAXRoleAttribute) == "AXStaticText" ? Self.string(child, kAXValueAttribute) : nil
                    }.first ?? ""
                }
                raw.append(RawScreenElement(label: label, role: Self.friendlyRole(role), y: item.y, x: item.x))
            }
            queue.append(contentsOf: Self.children(element))
        }
        // In a browser, the names above the page (open tab titles, toolbar buttons) are private and
        // not what you would name: only the page itself is listed. If the page area cannot be
        // found, the top of the window is skipped instead, so tab titles are never listed.
        var contentTop: Double?
        if let id = app.bundleIdentifier, Self.browserBundleIds.contains(id) {
            contentTop = Self.contentArea(of: window).web?.y ?? ((bounds?.y ?? 0) + 120)
        }
        return ScreenElements.clean(raw, contentTop: contentTop)
    }

    private static let browserBundleIds: Set<String> = [
        "com.google.Chrome", "com.google.Chrome.canary", "com.apple.Safari", "org.mozilla.firefox",
        "company.thebrowser.Browser", "com.microsoft.edgemac", "com.brave.Browser",
        "com.operasoftware.Opera", "com.vivaldi.Vivaldi", "com.kagi.kagimacOS", "app.zen-browser.zen",
    ]

    /// The page content of a browser window: the largest web area, and the main landmark inside
    /// it when the page has one. Everything above the web area is the tab strip and toolbar.
    private static func contentArea(of window: AXUIElement) -> (web: ScreenItem?, main: ScreenItem?) {
        let started = ContinuousClock.now
        var web: ScreenItem?
        var main: ScreenItem?
        var queue: [AXUIElement] = [window]
        var head = 0
        while head < queue.count, head < 5_000, ContinuousClock.now - started < .milliseconds(400) {
            let element = queue[head]
            head += 1
            let role = string(element, kAXRoleAttribute)
            if role == "AXWebArea", let item = frame(element),
               item.width * item.height > (web.map { $0.width * $0.height } ?? 0)
            {
                web = item
            }
            if string(element, kAXSubroleAttribute) == "AXLandmarkMain", let item = frame(element),
               item.width * item.height > (main.map { $0.width * $0.height } ?? 0)
            {
                main = item
            }
            queue.append(contentsOf: children(element))
        }
        return (web, main)
    }

    /// "Fill in my email": puts the cursor in the text field called `label`, by clicking into it.
    /// The field is found by its label, title or placeholder (best match first, top to bottom).
    /// A password field is never chosen. Bounded like every search here.
    public func focusField(label: String) async throws {
        guard AXIsProcessTrusted() else {
            throw ServiceError(
                code: HelperErrorCode.accessibilityDenied,
                message: "Accessibility access is off, so Sayso cannot fill fields.")
        }
        let missing = ServiceError(code: HelperErrorCode.elementNotFound, message: "Couldn't find a field called “\(label)”.")
        guard let app = NSWorkspace.shared.frontmostApplication else { throw missing }
        let root = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 0.2)
        enableWebAccessibility(app.processIdentifier, root: root)
        let window = Self.element(root, kAXFocusedWindowAttribute) ?? root
        let bounds = Self.frame(window)

        let started = ContinuousClock.now
        var best: (score: Int, y: Double, element: AXUIElement, item: ScreenItem)?
        var queue: [AXUIElement] = [window]
        var head = 0
        while head < queue.count, head < 6_000, ContinuousClock.now - started < .milliseconds(500) {
            let element = queue[head]
            head += 1
            let role = Self.string(element, kAXRoleAttribute) ?? ""
            if Self.fieldRoles.contains(role), !Self.isSecure(element),
               let item = Self.frame(element), Self.visible(item, in: bounds)
            {
                var score = 0
                for attribute in [kAXTitleAttribute, kAXDescriptionAttribute, "AXPlaceholderValue"] {
                    if let text = Self.string(element, attribute) {
                        score = max(score, LabelMatch.score(query: label, text: text))
                    }
                }
                if score > 0, best == nil || score > best!.score || (score == best!.score && item.y < best!.y) {
                    best = (score, item.y, element, item)
                }
            }
            queue.append(contentsOf: Self.children(element))
        }
        guard let best else { throw missing }
        try Self.activate(best.element, at: best.item, click: true)
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

        let debug = ProcessInfo.processInfo.environment["SAYSO_DEBUG_POSITION"] == "1"
        // Links, headings and groups found only because there were no rows are limited to the
        // page's main content (the toolbar and tab strip are not items).
        var area: ScreenItem?
        if PositionFallback.sources(for: kind).contains(where: { PositionFallback.needsContentArea(kind: kind, source: $0) }) {
            let content = Self.contentArea(of: window)
            area = content.main ?? content.web
            if ProcessInfo.processInfo.environment["SAYSO_DEBUG_POSITION"] == "1" {
                func d(_ i: ScreenItem?) -> String { i.map { "x=\(Int($0.x)) y=\(Int($0.y)) w=\(Int($0.width)) h=\(Int($0.height))" } ?? "none" }
                FileHandle.standardError.write(Data("[position] window \(d(bounds)); web area \(d(content.web)); main \(d(content.main))\n".utf8))
            }
        }
        for source in PositionFallback.sources(for: kind) {
            let restricted = PositionFallback.needsContentArea(kind: kind, source: source)
            var titleChars = 12
            var found = Self.collect(source, from: window, within: bounds, area: restricted ? area : nil, restricted: restricted)
            if restricted {
                // Items of a list share a column; filter links and badges are in other columns.
                let column = PositionFallback.dominantColumn(of: found.map(\.item.x))
                found = found.filter { PositionFallback.isInColumn(x: $0.item.x, column: column) }
            }
            if source == .row {
                // A web page's rows often include spacers and header rows: prefer the rows that
                // hold a link with a real name, when any do.
                // Titles are long ("Show HN: …"); "42 comments" and "3 hours ago" are not, so rows
                // with a long link come first, then rows with any named link.
                for minChars in [25, 12] {
                    let withLinks = found.filter { Self.realLink(in: $0.element, minChars: minChars) != nil }
                    if !withLinks.isEmpty {
                        found = withLinks
                        titleChars = minChars
                        break
                    }
                }
            }
            if debug {
                FileHandle.standardError.write(Data("[position] \(source.rawValue): \(found.count) found\(restricted ? " (main content, one column)" : "")\n".utf8))
            }
            if found.isEmpty { continue }
            guard let pick = PositionPicker.pick(found.map(\.item), index: index) else { throw missing }
            if debug {
                // Diagnostics for development only: what was found, in screen order, and which one.
                for (i, f) in found.enumerated() {
                    let text = Self.string(f.element, kAXTitleAttribute) ?? Self.string(f.element, kAXDescriptionAttribute) ?? ""
                    FileHandle.standardError.write(Data("[position] \(source.rawValue) #\(i) y=\(Int(f.item.y)) x=\(Int(f.item.x)) \(i == pick ? "PICK " : "")\(text.prefix(60))\n".utf8))
                }
                FileHandle.standardError.write(Data("[position] used \(source.rawValue) for \(kind.rawValue)\n".utf8))
            }
            // Web pages often ignore an accessibility press on links and rows (Google results do),
            // so those get a real click in their middle; buttons are pressed.
            // A row that holds a named link is opened by clicking that link (the row's middle may be
            // empty space); other rows, links and headings are clicked in the middle.
            if source == .row, let link = Self.realLink(in: found[pick].element, minChars: titleChars), let linkItem = Self.frame(link) {
                try Self.activate(link, at: linkItem, click: true)
            } else {
                try Self.activate(found[pick].element, at: found[pick].item, click: source != .button)
            }
            return
        }
        throw missing
    }

    private static let positionNodes = 12_000
    private static let positionBudget: Duration = .milliseconds(700)

    /// The items of one source under `start`, visible in `bounds` (and inside `area` when given),
    /// in tree order. `restricted` also skips links with no real text (icons, "skip" links).
    private static func collect(
        _ source: PositionSource, from start: AXUIElement, within bounds: ScreenItem?,
        area: ScreenItem?, restricted: Bool
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
            switch source {
            case .link: if role == "AXLink" { candidate = element }
            case .row: if role == "AXRow" { candidate = element }
            case .button: if role == "AXButton" { candidate = element }
            case .heading: if role == "AXHeading" { candidate = link ?? firstLink(under: element) }
            case .group: if role == "AXGroup", isPressableTextGroup(element, bounds: bounds) { candidate = element }
            }
            if let candidate, let item = frame(candidate), visible(item, in: bounds),
               area.map({ visible(item, in: $0) }) ?? true,
               !restricted || source != .link || hasRealText(candidate),
               !out.contains(where: { CFEqual($0.element, candidate) })
            {
                out.append((candidate, item))
            }
            let nextLink = role == "AXLink" ? element : link
            for child in children(element) { queue.append((child, nextLink)) }
        }
        return out
    }

    /// The first link with a real name inside `row` (looking a few levels down), or nil.
    private static func realLink(in row: AXUIElement, minChars: Int = 12) -> AXUIElement? {
        var level = children(row)
        for _ in 0..<4 {
            if let link = level.first(where: { string($0, kAXRoleAttribute) == "AXLink" && hasRealText($0, minChars: minChars) }) {
                return link
            }
            level = level.flatMap(children)
            if level.isEmpty { return nil }
        }
        return nil
    }

    /// A link that has a name of its own (a title or text of at least 12 characters), not an icon
    /// or a short navigation word ("new", "past").
    private static func hasRealText(_ link: AXUIElement, minChars: Int = 12) -> Bool {
        var text = string(link, kAXTitleAttribute) ?? string(link, kAXDescriptionAttribute) ?? ""
        if text.isEmpty {
            text = children(link).lazy.compactMap { child in
                string(child, kAXRoleAttribute) == "AXStaticText" ? string(child, kAXValueAttribute) : nil
            }.first ?? ""
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines).count >= minChars
    }

    /// A group that can be pressed and holds text, and is not a page-sized wrapper.
    private static func isPressableTextGroup(_ element: AXUIElement, bounds: ScreenItem?) -> Bool {
        var names: CFArray?
        guard AXUIElementCopyActionNames(element, &names) == .success,
              (names as? [String])?.contains(kAXPressAction as String) == true,
              let item = frame(element)
        else { return false }
        if let bounds, item.height > bounds.height / 3 { return false }
        var level = children(element)
        for _ in 0..<2 {
            if level.contains(where: { string($0, kAXRoleAttribute) == "AXStaticText" }) { return true }
            level = level.flatMap(children)
        }
        return false
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
