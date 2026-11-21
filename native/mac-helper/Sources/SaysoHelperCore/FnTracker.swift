/// Turns raw keyboard events into Fn hold phases. Pure logic, so it is unit-tested; the event tap
/// in SaysoHelperMac only feeds it.
public struct FnTracker: Sendable {
    public private(set) var isDown = false
    private var chorded = false
    private var commandSent = false

    public init() {}

    /// A modifier-flags change: whether Fn (globe) and Shift are now down. Returns the phases to
    /// report: `.down` / `.up` for the hold, and `.command` once per hold when Shift is held with Fn
    /// (in either order), which turns the utterance into a command.
    public mutating func flagsChanged(fnDown: Bool, shiftDown: Bool = false) -> [HotkeyPhase] {
        var phases: [HotkeyPhase] = []
        if fnDown, !isDown {
            isDown = true
            chorded = false
            commandSent = false
            phases.append(.down)
        } else if !fnDown, isDown {
            isDown = false
            return [.up]
        }
        if isDown, shiftDown, !commandSent {
            commandSent = true
            phases.append(.command)
        }
        return phases
    }

    /// Any non-modifier key went down. While Fn is held this means a shortcut such as Fn+Delete,
    /// reported once so the app can cancel the dictation.
    public mutating func keyDown() -> HotkeyPhase? {
        guard isDown, !chorded else { return nil }
        chorded = true
        return .chord
    }
}
