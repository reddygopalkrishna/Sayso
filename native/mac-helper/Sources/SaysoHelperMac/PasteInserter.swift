import AppKit
import ApplicationServices
import Foundation
import SaysoHelperCore

/// Inserts text by pasting: save the clipboard, put the text on it, press ⌘V, then restore the
/// clipboard unless something else changed it meanwhile. Needs Accessibility permission.
@MainActor
public final class PasteInserter: TextInserting {
    /// Tells clipboard managers not to record our temporary contents (nspasteboard.org).
    private static let transientType = NSPasteboard.PasteboardType("org.nspasteboard.TransientType")
    private static let vKeyCode: CGKeyCode = 9  // ANSI V

    private let restoreDelay: Duration

    public init(restoreDelay: Duration = .milliseconds(400)) {
        self.restoreDelay = restoreDelay
    }

    public func insert(_ text: String) async throws {
        guard AXIsProcessTrusted() else {
            throw ServiceError(
                code: HelperErrorCode.accessibilityDenied,
                message: "Accessibility access is off. Turn it on in System Settings → Privacy & Security → Accessibility.")
        }
        let pasteboard = NSPasteboard.general
        let saved = Self.snapshot(pasteboard)
        pasteboard.clearContents()
        pasteboard.declareTypes([.string, Self.transientType], owner: nil)
        pasteboard.setString(text, forType: .string)
        pasteboard.setString("", forType: Self.transientType)
        let ourChange = pasteboard.changeCount

        Self.pressCommandV()
        // The target app reads the clipboard asynchronously; restoring too early pastes the old text.
        try? await Task.sleep(for: restoreDelay)
        if pasteboard.changeCount == ourChange {
            Self.restore(saved, to: pasteboard)
        }
    }

    private static func snapshot(_ pasteboard: NSPasteboard) -> [NSPasteboardItem] {
        (pasteboard.pasteboardItems ?? []).map { item in
            let copy = NSPasteboardItem()
            for type in item.types {
                if let data = item.data(forType: type) { copy.setData(data, forType: type) }
            }
            return copy
        }
    }

    private static func restore(_ items: [NSPasteboardItem], to pasteboard: NSPasteboard) {
        pasteboard.clearContents()
        if !items.isEmpty { pasteboard.writeObjects(items) }
    }

    private static func pressCommandV() {
        let source = CGEventSource(stateID: .combinedSessionState)
        let down = CGEvent(keyboardEventSource: source, virtualKey: vKeyCode, keyDown: true)
        let up = CGEvent(keyboardEventSource: source, virtualKey: vKeyCode, keyDown: false)
        down?.flags = .maskCommand
        up?.flags = .maskCommand
        down?.post(tap: .cghidEventTap)
        up?.post(tap: .cghidEventTap)
    }
}
