import CoreGraphics
import Foundation
import SaysoHelperCore

/// Listens for the Fn (globe) key with a CGEventTap on the main run loop. Events always pass
/// through unchanged. Needs Accessibility permission; `install()` returns false without it.
@MainActor
public final class FnEventTap {
    private var tap: CFMachPort?
    private var source: CFRunLoopSource?
    private var tracker = FnTracker()
    private let onPhase: (HotkeyPhase) -> Void

    public init(onPhase: @escaping (HotkeyPhase) -> Void) {
        self.onPhase = onPhase
    }

    public var isInstalled: Bool { tap != nil }

    public func install() -> Bool {
        if tap != nil { return true }
        let mask = (CGEventMask(1) << CGEventType.flagsChanged.rawValue)
            | (CGEventMask(1) << CGEventType.keyDown.rawValue)
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: mask,
            callback: fnTapCallback,
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        ) else {
            return false
        }
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        self.tap = tap
        self.source = source
        return true
    }

    fileprivate func handle(type: CGEventType, fnDown: Bool) {
        switch type {
        case .tapDisabledByTimeout, .tapDisabledByUserInput:
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
        case .flagsChanged:
            if let phase = tracker.flagsChanged(fnDown: fnDown) {
                onPhase(phase)
            }
        case .keyDown:
            if let phase = tracker.keyDown() { onPhase(phase) }
        default:
            break
        }
    }
}

private func fnTapCallback(
    proxy: CGEventTapProxy,
    type: CGEventType,
    event: CGEvent,
    refcon: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    if let refcon {
        // The tap's run loop source is on the main run loop, so this runs on the main thread.
        let owner = Unmanaged<FnEventTap>.fromOpaque(refcon).takeUnretainedValue()
        let fnDown = event.flags.contains(.maskSecondaryFn)
        MainActor.assumeIsolated { owner.handle(type: type, fnDown: fnDown) }
    }
    return Unmanaged.passUnretained(event)
}
