/// What "the third …" counts on screen.
public enum PositionKind: String, Sendable, Decodable, CaseIterable {
    /// Search results: links that carry a heading (Google, Bing, DuckDuckGo).
    case result
    case link
    /// Rows of a list or table: emails, messages, files.
    case row
    case button
    /// Results, then rows, then links: whichever the screen has.
    case any
}

/// An item found on screen, by its frame in screen points.
public struct ScreenItem: Sendable, Equatable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

/// Picks "the Nth from the top" among items found on screen. Pure, so it is unit-tested.
public enum PositionPicker {
    /// Items on the same line (within half a typical row height) count left to right.
    private static let sameLine = 8.0

    /// The index (into `items`) of the Nth item from the top, 1-based; -1 for the last. Nil when
    /// there are not that many. Tiny items (under 4 points), items stacked on one point (off
    /// screen) and duplicates of the same frame are ignored, so nested copies of a row count once.
    public static func pick(_ items: [ScreenItem], index: Int) -> Int? {
        // Items scrolled out of view are reported stacked at one point (same x and y, different
        // sizes): none of those is really on screen.
        let stacked = Set(items.indices.filter { i in
            items.indices.contains { j in
                j != i && abs(items[i].x - items[j].x) < 1 && abs(items[i].y - items[j].y) < 1
                    && abs(items[i].width - items[j].width) >= 1
            }
        })
        var seen: [ScreenItem] = []
        var order: [(item: ScreenItem, original: Int)] = []
        for (i, item) in items.enumerated() where item.width >= 4 && item.height >= 4 && !stacked.contains(i) {
            if seen.contains(where: { abs($0.x - item.x) < 1 && abs($0.y - item.y) < 1 && abs($0.width - item.width) < 1 }) {
                continue
            }
            seen.append(item)
            order.append((item, i))
        }
        order.sort { a, b in
            if abs(a.item.y - b.item.y) > sameLine { return a.item.y < b.item.y }
            return a.item.x < b.item.x
        }
        if index == -1 { return order.last?.original }
        guard index >= 1, index <= order.count else { return nil }
        return order[index - 1].original
    }
}
