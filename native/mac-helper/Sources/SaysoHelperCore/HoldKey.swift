/// The key that is held to dictate: Fn (the globe key) by default, or a modifier key on the right
/// of the keyboard. The right-hand keys are told apart from their left twins by the
/// device-dependent bits in the event flags, so holding the left ⌘ never starts a dictation.
public enum HoldKey: String, Sendable, CaseIterable, Decodable {
    case fn
    case rightOption
    case rightCommand
    case rightControl

    private var mask: UInt64 {
        switch self {
        case .fn: 0x0080_0000  // NX_SECONDARYFNMASK
        case .rightOption: 0x40  // NX_DEVICERALTKEYMASK
        case .rightCommand: 0x10  // NX_DEVICERCMDKEYMASK
        case .rightControl: 0x2000  // NX_DEVICERCTLKEYMASK
        }
    }

    /// Whether this key is down, from the raw flags of a modifier-flags-changed event.
    public func isDown(flags: UInt64) -> Bool { flags & mask != 0 }
}
