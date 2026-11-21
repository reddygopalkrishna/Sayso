import CoreGraphics
import Foundation
import SaysoHelperCore

/// Listens for the Fn (globe) key with a CGEventTap on the main run loop, and can swallow Escape
/// while the preview chip is showing. All other events pass through unchanged. Needs Accessibility
/// permission; `install()` returns false without it.
@MainActor
public final class FnEventTap: EscapeCapturing, HoldKeyConfiguring {
    private static let escapeKeyCode: Int64 = 53

    private var tap: CFMachPort?
    private var source: CFRunLoopSource?
    private var tracker = FnTracker()
    private var holdKey: HoldKey = .fn
    private let onPhase: (HotkeyPhase) -> Void
    private let onEscape: () -> Void
    private let maxCapture: Duration
    private var capturingEscape = false
    private var captureGeneration = 0
    private var swallowedEscapeDown = false

    public init(
        maxCapture: Duration = .seconds(3),
        onPhase: @escaping (HotkeyPhase) -> Void,
        onEscape: @escaping () -> Void
    ) {
        self.maxCapture = maxCapture
        self.onPhase = onPhase
        self.onEscape = onEscape
    }

    public var isInstalled: Bool { tap != nil }

    public func install() -> Bool {
        if tap != nil { return true }
        let mask = (CGEventMask(1) << CGEventType.flagsChanged.rawValue)
            | (CGEventMask(1) << CGEventType.keyDown.rawValue)
            | (CGEventMask(1) << CGEventType.keyUp.rawValue)
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

    public func setHoldKey(_ key: HoldKey) {
        guard key != holdKey else { return }
        holdKey = key
        tracker = FnTracker()
    }

    public func setCapture(_ enabled: Bool) {
        captureGeneration += 1
        capturingEscape = enabled
        guard enabled else { return }
        // Safety net: never leave Escape swallowed if the app forgets to switch this off.
        let generation = captureGeneration
        let limit = maxCapture
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: limit)
            if let self, self.captureGeneration == generation { self.capturingEscape = false }
        }
    }

    /// Returns true when the event must be swallowed.
    fileprivate func handle(type: CGEventType, flags: UInt64, shiftDown: Bool, keyCode: Int64) -> Bool {
        switch type {
        case .tapDisabledByTimeout, .tapDisabledByUserInput:
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return false
        case .flagsChanged:
            let holdDown = holdKey.isDown(flags: flags)
            for phase in tracker.flagsChanged(fnDown: holdDown, shiftDown: shiftDown) { onPhase(phase) }
            return false
        case .keyDown:
            if let phase = tracker.keyDown() { onPhase(phase) }
            if keyCode == Self.escapeKeyCode, capturingEscape {
                swallowedEscapeDown = true
                onEscape()
                return true
            }
            return false
        case .keyUp:
            // Swallow the matching key-up too, so the app never sees half a key press.
            if keyCode == Self.escapeKeyCode, swallowedEscapeDown {
                swallowedEscapeDown = false
                return true
            }
            return false
        default:
            return false
        }
    }
}

private func fnTapCallback(
    proxy: CGEventTapProxy,
    type: CGEventType,
    event: CGEvent,
    refcon: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    guard let refcon else { return Unmanaged.passUnretained(event) }
    // The tap's run loop source is on the main run loop, so this runs on the main thread.
    let owner = Unmanaged<FnEventTap>.fromOpaque(refcon).takeUnretainedValue()
    let flags = event.flags.rawValue
    let shiftDown = event.flags.contains(.maskShift)
    let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
    let swallow = MainActor.assumeIsolated { owner.handle(type: type, flags: flags, shiftDown: shiftDown, keyCode: keyCode) }
    return swallow ? nil : Unmanaged.passUnretained(event)
}
