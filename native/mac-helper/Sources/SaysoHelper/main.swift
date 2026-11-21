import Foundation
import SaysoHelperCore

// Long-lived child of the Electron app. stdout carries protocol messages only; diagnostics go to
// stderr. Stdin is read on a background thread so the main run loop stays free for the OS event
// sources added in later steps (CGEventTap, AVAudioEngine).

func logToStderr(_ text: String) {
    FileHandle.standardError.write(Data("[SaysoHelper] \(text)\n".utf8))
}

let loop = MainActor.assumeIsolated { MessageLoop(writer: StandardOutputWriter()) }
MainActor.assumeIsolated { loop.start() }

let reader = Thread {
    while let line = readLine(strippingNewline: true) {
        DispatchQueue.main.async {
            let outcome = MainActor.assumeIsolated { loop.handle(line: line) }
            if outcome == .stop {
                logToStderr("shutdown requested")
                exit(0)
            }
        }
    }
    // stdin closed: the app is gone, so never outlive it.
    DispatchQueue.main.async {
        logToStderr("stdin closed, exiting")
        exit(0)
    }
}
reader.start()

RunLoop.main.run()
