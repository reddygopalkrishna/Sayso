import AppKit
import SaysoHelperCore

/// Frontmost app from NSWorkspace (no permission needed).
@MainActor
public final class WorkspaceContext: ContextProviding {
    public init() {}

    public func current() -> AppContext {
        let app = NSWorkspace.shared.frontmostApplication
        return AppContext(bundleId: app?.bundleIdentifier, appName: app?.localizedName)
    }
}
