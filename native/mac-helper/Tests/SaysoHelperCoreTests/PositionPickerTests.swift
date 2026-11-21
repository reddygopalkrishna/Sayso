import Testing

@testable import SaysoHelperCore

private func row(_ y: Double, x: Double = 0, height: Double = 30) -> ScreenItem {
    ScreenItem(x: x, y: y, width: 600, height: height)
}

@Suite struct PositionPickerBehaviour {
    @Test func countsFromTheTopWhateverTheOrderFound() {
        // Found in tree order, which is not always screen order.
        let items = [row(300), row(100), row(200)]
        #expect(PositionPicker.pick(items, index: 1) == 1)
        #expect(PositionPicker.pick(items, index: 2) == 2)
        #expect(PositionPicker.pick(items, index: 3) == 0)
    }

    @Test func lastIsTheBottomOne() {
        #expect(PositionPicker.pick([row(100), row(400), row(250)], index: -1) == 1)
    }

    @Test func tooFewItemsIsNil() {
        #expect(PositionPicker.pick([row(100), row(200)], index: 3) == nil)
        #expect(PositionPicker.pick([], index: 1) == nil)
        #expect(PositionPicker.pick([], index: -1) == nil)
        #expect(PositionPicker.pick([row(100)], index: 0) == nil)
    }

    @Test func itemsOnOneLineCountLeftToRight() {
        let items = [ScreenItem(x: 300, y: 103, width: 80, height: 20), ScreenItem(x: 10, y: 100, width: 80, height: 20)]
        #expect(PositionPicker.pick(items, index: 1) == 1)
    }

    @Test func nestedCopiesOfOneRowCountOnce() {
        let items = [row(100), row(100), row(200)]
        #expect(PositionPicker.pick(items, index: 2) == 2)
    }

    @Test func invisibleSliversAreIgnored() {
        let items = [ScreenItem(x: 0, y: 50, width: 600, height: 1), row(100)]
        #expect(PositionPicker.pick(items, index: 1) == 1)
    }

    @Test func itemsStackedOnOnePointAreOffScreenAndIgnored() {
        // Two results in view, three scrolled away (all reported at the window's bottom edge).
        let items = [
            ScreenItem(x: 280, y: 1176, width: 500, height: 20),
            ScreenItem(x: 280, y: 400, width: 600, height: 60),
            ScreenItem(x: 280, y: 1176, width: 420, height: 20),
            ScreenItem(x: 280, y: 520, width: 600, height: 60),
            ScreenItem(x: 280, y: 1176, width: 380, height: 20),
        ]
        #expect(PositionPicker.pick(items, index: 1) == 1)
        #expect(PositionPicker.pick(items, index: -1) == 3)
        #expect(PositionPicker.pick(items, index: 3) == nil)
    }
}

