/// Turns raw keyboard events into Fn hold phases. Pure logic, so it is unit-tested; the event tap
/// in SaysoHelperMac only feeds it.
public struct FnTracker: Sendable {
    public private(set) var isDown = false
    private var chorded = false

    public init() {}

    /// A modifier-flags change; `fnDown` is whether the Fn (globe) flag is now set.
    public mutating func flagsChanged(fnDown: Bool) -> HotkeyPhase? {
        if fnDown, !isDown {
            isDown = true
            chorded = false
            return .down
        }
        if !fnDown, isDown {
            isDown = false
            return .up
        }
        return nil
    }

    /// Any non-modifier key went down. While Fn is held this means a shortcut such as Fn+Delete,
    /// reported once so the app can cancel the dictation.
    public mutating func keyDown() -> HotkeyPhase? {
        guard isDown, !chorded else { return nil }
        chorded = true
        return .chord
    }
}
