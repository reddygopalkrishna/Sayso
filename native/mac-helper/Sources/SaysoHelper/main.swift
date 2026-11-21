import Foundation
import SaysoHelperCore
import SaysoHelperMac

// Long-lived child of the Electron app. stdout carries protocol messages only; diagnostics go to
// stderr. Stdin is read on a background thread so the main run loop is free for the Fn event tap
// and the audio engine.

func logToStderr(_ text: String) {
    FileHandle.standardError.write(Data("[SaysoHelper] \(text)\n".utf8))
}

let env = ProcessInfo.processInfo.environment
let modelName = env["SAYSO_WHISPER_MODEL"] ?? "openai_whisper-large-v3-v20240930_turbo_632MB"
let language: String? = {
    let value = env["SAYSO_STT_LANGUAGE"] ?? "en"
    return value == "auto" ? nil : value
}()
let modelsDir = env["SAYSO_MODELS_DIR"].map { URL(fileURLWithPath: $0) }
    ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("Sayso/models")

let transcriber = WhisperTranscriber(modelName: modelName, modelsDir: modelsDir, language: language)

// Dev tool: `SaysoHelper --transcribe <audio file>` prints one `transcript` line and exits.
// Lets STT quality and word timings be checked without the mic or the Fn key.
let arguments = CommandLine.arguments
if arguments.count == 3, arguments[1] == "--transcribe" {
    let path = arguments[2]
    let done = DispatchSemaphore(value: 0)
    // Detached: top-level code is on the main actor, which `done.wait()` blocks.
    Task.detached {
        do {
            let samples = try WhisperTranscriber.loadAudioFile(path)
            try await transcriber.load()
            let started = ContinuousClock.now
            let result = try await transcriber.transcribe(samples)
            let elapsed = ContinuousClock.now - started
            let sttMs = Double(elapsed.components.seconds) * 1000 + Double(elapsed.components.attoseconds) / 1e15
            FileHandle.standardOutput.write(Data(HelperMessage.transcript(
                id: "file", transcription: result, audioMs: Double(samples.count) / sampleRate * 1000,
                sttMs: sttMs, model: modelName).encodedLine().utf8))
        } catch {
            logToStderr("transcribe failed: \(error)")
        }
        done.signal()
    }
    done.wait()
    exit(0)
}

/// The tap reports events through the loop, and the loop drives the tap (Escape capture).
@MainActor final class LoopBox { var loop: MessageLoop? }

let (loop, fnTap) = MainActor.assumeIsolated {
    let box = LoopBox()
    let fnTap = FnEventTap(
        onPhase: { phase in box.loop?.send(.hotkey(phase: phase)) },
        onEscape: { box.loop?.send(.escape) })
    let loop = MessageLoop(
        writer: StandardOutputWriter(),
        recorder: MicRecorder(),
        transcriber: transcriber,
        inserter: PasteInserter(),
        contextProvider: WorkspaceContext(),
        keyPresser: KeyPresser(),
        escapeCapture: fnTap
    )
    box.loop = loop
    return (loop, fnTap)
}

MainActor.assumeIsolated {
    loop.start()

    // Load the speech model in the background; the app shows progress from sttStatus.
    loop.send(.sttStatus(state: .loading, model: modelName, msg: nil))
    Task {
        do {
            try await transcriber.load()
            loop.send(.sttStatus(state: .ready, model: modelName, msg: nil))
        } catch {
            loop.send(.sttStatus(state: .error, model: modelName, msg: String(describing: error)))
        }
    }

    // The Fn tap needs Accessibility. Until it is granted, report it and keep retrying.
    if fnTap.install() {
        loop.send(.fnListener(state: .active))
    } else {
        loop.send(.fnListener(state: .unavailable))
        Task { @MainActor in
            while !fnTap.install() {
                try? await Task.sleep(for: .seconds(2))
            }
            loop.send(.fnListener(state: .active))
        }
    }
}

let reader = Thread {
    while let line = readLine(strippingNewline: true) {
        DispatchQueue.main.async {
            let (outcome, _) = MainActor.assumeIsolated { loop.handle(line: line) }
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
