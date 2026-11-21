import AppKit
import SaysoHelperCore

/// Installed and running apps, launching, switching and opening URLs through NSWorkspace.
@MainActor
public final class WorkspaceApps: AppControlling {
    private struct Installed: Sendable {
        let name: String
        let bundleId: String
    }

    private var installed: [Installed]?

    public init() {}

    /// Scans the Applications folders in the background so the first "open …" is fast.
    public func warmUp() {
        Task.detached(priority: .utility) {
            let found = WorkspaceApps.scanInstalled()
            await self.store(found)
        }
    }

    private func store(_ found: [Installed]) {
        installed = found
    }

    public func listApps() -> [AppInfo] {
        if installed == nil { installed = Self.scanInstalled() }
        var byId: [String: AppInfo] = [:]
        for app in installed ?? [] {
            byId[app.bundleId] = AppInfo(name: app.name, bundleId: app.bundleId, running: false)
        }
        for app in NSWorkspace.shared.runningApplications where app.activationPolicy == .regular {
            guard let id = app.bundleIdentifier else { continue }
            let name = app.localizedName ?? byId[id]?.name ?? id
            byId[id] = AppInfo(name: name, bundleId: id, running: true)
        }
        return byId.values.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    public func open(bundleId: String) async throws {
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) else {
            throw ServiceError(code: HelperErrorCode.appNotFound, message: "No app with id \(bundleId) is installed.")
        }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        do {
            _ = try await NSWorkspace.shared.openApplication(at: url, configuration: configuration)
        } catch {
            throw ServiceError(
                code: HelperErrorCode.appNotFound,
                message: "Could not open \(url.deletingPathExtension().lastPathComponent): \(error.localizedDescription)")
        }
    }

    public func activate(bundleId: String) async throws {
        let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
        guard let app = running.first else {
            throw ServiceError(code: HelperErrorCode.appNotFound, message: "That app is not running.")
        }
        // Opening a running app's bundle brings it to the front; calling activate() from a
        // background helper is unreliable on recent macOS.
        guard let url = app.bundleURL else {
            throw ServiceError(code: HelperErrorCode.appNotFound, message: "That app cannot be switched to.")
        }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        _ = try? await NSWorkspace.shared.openApplication(at: url, configuration: configuration)
    }

    public func openURL(_ string: String) throws {
        guard
            let url = URL(string: string), let scheme = url.scheme?.lowercased(),
            scheme == "http" || scheme == "https", let host = url.host, !host.isEmpty
        else {
            throw ServiceError(code: HelperErrorCode.badUrl, message: "Only http and https links can be opened.")
        }
        guard NSWorkspace.shared.open(url) else {
            throw ServiceError(code: HelperErrorCode.badUrl, message: "Could not open \(host).")
        }
    }

    private nonisolated static func scanInstalled() -> [Installed] {
        let fileManager = FileManager.default
        let folders = [
            "/Applications", "/Applications/Utilities", "/System/Applications",
            "/System/Applications/Utilities", NSHomeDirectory() + "/Applications",
        ]
        var found: [Installed] = []
        for folder in folders {
            guard let files = try? fileManager.contentsOfDirectory(atPath: folder) else { continue }
            for file in files where file.hasSuffix(".app") {
                let path = folder + "/" + file
                guard let id = Bundle(path: path)?.bundleIdentifier else { continue }
                var name = fileManager.displayName(atPath: path)
                if name.hasSuffix(".app") { name.removeLast(4) }
                found.append(Installed(name: name, bundleId: id))
            }
        }
        return found
    }
}
