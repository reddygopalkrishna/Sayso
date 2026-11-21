import Testing

@testable import SaysoHelperCore

private func raw(_ label: String, _ role: String = "button", y: Double = 0, x: Double = 0) -> RawScreenElement {
    RawScreenElement(label: label, role: role, y: y, x: x)
}

@Suite struct ScreenElementsBehaviour {
    @Test func listsTopToBottomThenLeftToRight() {
        let out = ScreenElements.clean([
            raw("Send", y: 300), raw("Reply", y: 100, x: 200), raw("Compose", y: 103, x: 10),
        ])
        #expect(out.map(\.label) == ["Compose", "Reply", "Send"])
    }

    @Test func dropsEmptyNamesAndTidiesWhitespace() {
        let out = ScreenElements.clean([raw("   "), raw(""), raw("  Sign \n  in  ")])
        #expect(out == [ScreenElement(label: "Sign in", role: "button")])
    }

    @Test func listsTheSameNameAndKindOnce() {
        let out = ScreenElements.clean([raw("Reply", y: 1), raw("reply", y: 2), raw("Reply", "link", y: 3)])
        #expect(out.map(\.role) == ["button", "link"])
    }

    @Test func shortensLongNamesAtAWord() {
        let long = String(repeating: "word ", count: 40)
        let label = ScreenElements.clean([raw(long)])[0].label
        #expect(label.count <= ScreenElements.maxLabel + 1)
        #expect(label.hasSuffix("…"))
    }

    @Test func keepsAtMostMaxItems() {
        let many = (0..<200).map { raw("Item \($0)", y: Double($0) * 20) }
        let out = ScreenElements.clean(many)
        #expect(out.count == ScreenElements.maxItems)
        #expect(out.first?.label == "Item 0")
    }
}
