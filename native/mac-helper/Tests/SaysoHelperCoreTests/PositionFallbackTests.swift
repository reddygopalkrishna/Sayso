import Testing

@testable import SaysoHelperCore

@Suite struct PositionFallbackBehaviour {
    @Test func aRowFallsBackToLinksThenHeadingsThenGroups() {
        #expect(PositionFallback.sources(for: .row) == [.row, .link, .heading, .group])
    }

    @Test func otherKindsKeepTheirOwnSearch() {
        #expect(PositionFallback.sources(for: .link) == [.link])
        #expect(PositionFallback.sources(for: .result) == [.heading])
        #expect(PositionFallback.sources(for: .button) == [.button])
        #expect(PositionFallback.sources(for: .any) == [.heading, .row, .link])
    }

    @Test func onlyTheFallbackSourcesOfARowAreLimitedToTheContent() {
        #expect(!PositionFallback.needsContentArea(kind: .row, source: .row))
        for source in [PositionSource.link, .heading, .group] {
            #expect(PositionFallback.needsContentArea(kind: .row, source: source))
        }
        // "the second link" and "the first result" are not limited.
        #expect(!PositionFallback.needsContentArea(kind: .link, source: .link))
        #expect(!PositionFallback.needsContentArea(kind: .any, source: .link))
    }

    @Test func contentStartsAtTheTopOfThePage() {
        #expect(PositionFallback.isInContent(y: 200, top: 120))
        #expect(PositionFallback.isInContent(y: 120, top: 120))
        #expect(!PositionFallback.isInContent(y: 60, top: 120))
        #expect(PositionFallback.isInContent(y: 5, top: nil))
    }
}

@Suite struct ScreenElementsTabStrip {
    private func raw(_ label: String, _ role: String = "button", y: Double) -> RawScreenElement {
        RawScreenElement(label: label, role: role, y: y, x: 0)
    }

    @Test func dropsTabTitlesAndToolbarButtonsAboveThePage() {
        let out = ScreenElements.clean(
            [
                raw("Inbox (3) - private@example.com - Gmail", "checkbox", y: 20),
                raw("Bank statement - Memory usage - 120 MB", "checkbox", y: 20),
                raw("New Tab", y: 22),
                raw("Back", y: 70),
                raw("Sign in", y: 400),
                raw("Help", "link", y: 900),
            ], contentTop: 110)
        #expect(out.map(\.label) == ["Sign in", "Help"])
    }

    @Test func withNoContentTopEverythingIsListed() {
        let out = ScreenElements.clean([raw("Back", y: 70), raw("Sign in", y: 400)])
        #expect(out.map(\.label) == ["Back", "Sign in"])
    }
}

@Suite struct PositionColumns {
    @Test func theListColumnIsTheOneMostItemsShare() {
        // Filter links at x=16, issue titles at x=489 (a few pixels apart).
        let xs: [Double] = [16, 16, 489, 490, 489, 488, 489, 16]
        #expect(PositionFallback.dominantColumn(of: xs) == 488)
        #expect(PositionFallback.isInColumn(x: 489, column: 488))
        #expect(!PositionFallback.isInColumn(x: 16, column: 488))
    }

    @Test func aShortListHasNoColumnAndIsLeftAlone() {
        #expect(PositionFallback.dominantColumn(of: [16, 489]) == nil)
        #expect(PositionFallback.dominantColumn(of: [16, 16, 489]) == nil)
        #expect(PositionFallback.isInColumn(x: 5, column: nil))
    }
}
