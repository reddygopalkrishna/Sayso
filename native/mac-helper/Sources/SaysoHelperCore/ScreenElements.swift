/// One thing you could name on screen: a button, link, menu item or field, by its visible name.
public struct ScreenElement: Equatable, Sendable {
    public var label: String
    /// "button", "link", "menu", "checkbox", "field", "tab".
    public var role: String

    public init(label: String, role: String) {
        self.label = label
        self.role = role
    }
}

/// What the accessibility tree gave for one element, before cleaning.
public struct RawScreenElement: Sendable {
    public var label: String
    public var role: String
    public var y: Double
    public var x: Double

    public init(label: String, role: String, y: Double, x: Double) {
        self.label = label
        self.role = role
        self.y = y
        self.x = x
    }
}

/// Turns the raw elements of a window into the short list the interpreter reads. Pure, so it is
/// unit-tested. The list holds names only: never what is typed into a field.
public enum ScreenElements {
    public static let maxItems = 60
    public static let maxLabel = 60

    /// Top to bottom (left to right on one line), names tidied and shortened, empty ones dropped,
    /// the same name and kind listed once, at most `maxItems`.
    ///
    /// `contentTop` is where the page content starts in a browser: anything above it is the tab
    /// strip or toolbar, whose names (open tab titles) are never listed. Nil keeps everything.
    public static func clean(_ raw: [RawScreenElement], contentTop: Double? = nil) -> [ScreenElement] {
        let sorted = raw.filter { PositionFallback.isInContent(y: $0.y, top: contentTop) }.sorted { a, b in
            abs(a.y - b.y) > 8 ? a.y < b.y : a.x < b.x
        }
        var seen = Set<String>()
        var out: [ScreenElement] = []
        for item in sorted {
            let label = tidy(item.label)
            guard !label.isEmpty else { continue }
            guard seen.insert("\(item.role)|\(label.lowercased())").inserted else { continue }
            out.append(ScreenElement(label: label, role: item.role))
            if out.count == maxItems { break }
        }
        return out
    }

    /// One line, single spaces, at most `maxLabel` characters (cut at a word where it can be).
    static func tidy(_ text: String) -> String {
        let oneLine = text.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).joined(separator: " ")
        guard oneLine.count > maxLabel else { return oneLine }
        let cut = String(oneLine.prefix(maxLabel))
        if let space = cut.lastIndex(of: " "), cut.distance(from: cut.startIndex, to: space) > maxLabel / 2 {
            return String(cut[..<space]) + "…"
        }
        return cut + "…"
    }
}
