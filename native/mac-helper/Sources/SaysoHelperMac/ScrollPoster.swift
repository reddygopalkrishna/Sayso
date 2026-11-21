import ApplicationServices
import CoreGraphics
import SaysoHelperCore

/// Scrolls the view under the pointer with a synthetic scroll-wheel event. Needs Accessibility.
@MainActor
public final class ScrollPoster: Scrolling {
    public init() {}

    public func scroll(direction: ScrollDirection, amount: Int) throws {
        guard AXIsProcessTrusted() else {
            throw ServiceError(
                code: HelperErrorCode.accessibilityDenied,
                message: "Accessibility access is off, so Sayso cannot scroll.")
        }
        // Positive wheel values move the view up (content down), negative move it down.
        let delta = Int32(direction == .up ? amount : -amount)
        let event = CGEvent(
            scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: delta, wheel2: 0, wheel3: 0)
        event?.post(tap: .cghidEventTap)
    }
}
