/// What an "open the Nth …" request looks for, in order. Pure, so the order is unit-tested.
public enum PositionSource: String, Sendable, Equatable {
    case row, link, heading, group, button
}

public enum PositionFallback {
    /// The kinds of element to try, first to last, for a requested kind.
    /// A "row" (email, message, item) falls back to links, then headings, then pressable text
    /// groups when the page has no real rows, which is how most web lists are built.
    public static func sources(for kind: PositionKind) -> [PositionSource] {
        switch kind {
        case .row: [.row, .link, .heading, .group]
        case .link: [.link]
        case .result: [.heading]
        case .button: [.button]
        case .any: [.heading, .row, .link]
        }
    }

    /// True for the sources tried only because no real row was found: they are limited to the
    /// main content, so toolbar and navigation links are never counted as items.
    public static func needsContentArea(kind: PositionKind, source: PositionSource) -> Bool {
        kind == .row && source != .row
    }

    /// True when an item at `y` is in the page content (at or below `top`), not in a browser's
    /// toolbar or tab strip above it. With no known content area everything counts.
    public static func isInContent(y: Double, top: Double?) -> Bool {
        guard let top else { return true }
        return y >= top - 1
    }

    /// A list on a page has its items in one column: the left edge (to the nearest 8 points) that
    /// most candidates share, when at least three do. Filter links, nav links and badges sit in
    /// other columns. Nil when no column has three, so short lists are left alone.
    public static func dominantColumn(of xs: [Double]) -> Double? {
        var counts: [Int: Int] = [:]
        for x in xs { counts[Int((x / 8).rounded()), default: 0] += 1 }
        guard let best = counts.max(by: { $0.value == $1.value ? $0.key > $1.key : $0.value < $1.value }),
              best.value >= 3
        else { return nil }
        return Double(best.key) * 8
    }

    /// True when `x` is in the dominant column (within 8 points), or when there is none.
    public static func isInColumn(x: Double, column: Double?) -> Bool {
        guard let column else { return true }
        return abs(x - column) <= 8
    }
}
