# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Sayso

Voice dictation + actions for the desktop: speak, and the computer types clean text and performs actions (send, click, open apps) without touching the keyboard. Mac first; Windows later from the same codebase.

## Docs (read only the section the current step needs; do not read whole docs up front)
- `docs/BUILD_PLAN.md`: **final stack and phases. Wins if anything disagrees.** Read §3 for the current phase's steps.
- `docs/TECHNICAL_ARCHITECTURE.md`: modules (§5), action model (§5.1), grammar (§5.2), pause rule (§5.3), API (§6), schemas (§8), security (§10), tests (§11).
- `docs/PRD.md`: product behaviour (triggers §7.1, safety §7.8, UI §7.9, requirements §8).
- `docs/ARCHITECTURE_FLOW.md`: flow diagrams, only when a flow is unclear.
- `docs/COMPETITOR_INFINA.md`: only for Phase 1 parity checks.
- Ignore `docs/EARLY_PLAN.md`, `docs/BUILDATHON_SUBMISSION.md` and PDFs.

## Working style (keeps token use low)
- One BUILD_PLAN step per session; use the `build-step` skill. Start a new session for the next step.
- Run tests and builds through the `test-runner` agent so only failures come back.
- Use the `add-voice-command` skill for any new or changed voice command.
- Prefer Grep and reading line ranges over reading whole files.

## Repo state
Phase 0 progress: **steps 1–2 done** (scaffold; Fn hold → mic → WhisperKit → paste with the listening pill). Next: step 3 (Gemini cleanup behind `LLMProvider`).

What exists and is non-obvious:
- `packages/helper-protocol` ships TS source (no build step). It holds zod schemas (`src/messages.ts`), the NDJSON codec, a generated `schema/messages.schema.json` (`pnpm --filter @sayso/helper-protocol gen:schema`; a test fails if it is stale) and `fixtures/*.json`. **Both** Vitest and the Swift tests decode those fixtures; when you add a message, add it in `messages.ts`, `native/mac-helper/Sources/SaysoHelperCore/Message.swift` and a fixture.
- Protocol shape: requests carry an `id` and get exactly one reply with that id (`pong` / `done` / `transcript` / `error`); events (`hotkey`, `fnListener`, `sttStatus`, `log`) are unsolicited. Recording start/stop/cancel reuse the **utterance id** (`u-N`). **Audio never crosses the pipe**: WhisperKit runs in the helper, which returns text plus word timings in ms.
- Main process: `HelperProcess` (spawn, `request()`, restart with backoff, stop) → `core/stt/HelperWhisperSTT` (the `STTProvider`; strips Whisper non-speech markers like `[BLANK_AUDIO]`) → `core/dictation/DictationController` (state machine: holds < 250 ms are taps, Fn+other key cancels, Fn released before the mic is up is handled, 5 min cap) → `deliver(segment)` in `main/index.ts`. **Steps 3–4 plug in at `deliver`**: router/pause rule on the raw segment, then cleanup, then insert.
- `StatusHub` holds `AppStatus` (`src/shared/status.ts`), pushed to every window over IPC. The renderer is one bundle; `#pill` selects the listening pill, a non-focusable `type: 'panel'` window, so the target app keeps focus and receives the paste.
- Swift helper targets: `SaysoHelperCore` (protocol, `MessageLoop`, `FnTracker`, service protocols; no OS frameworks, fully unit-tested with fakes) and `SaysoHelperMac` (thin adapters: `FnEventTap`, `MicRecorder`, `WhisperTranscriber`, `PasteInserter`). It reads stdin on a background thread and keeps `RunLoop.main` for the event tap.
- Helper env: `SAYSO_WHISPER_MODEL` (default `openai_whisper-large-v3-v20240930_turbo_632MB`), `SAYSO_STT_LANGUAGE` (default `en`, `auto` to detect), `SAYSO_MODELS_DIR` (set by the app to `~/Library/Application Support/Sayso/models`). The first run downloads the model (~600 MB), then compiles it for the Neural Engine.
- macOS permissions in dev are granted to whatever launched the app (Terminal, iTerm, or the editor), not to "Sayso": that app needs **Accessibility** (Fn listener + paste) and **Microphone**. Set System Settings → Keyboard → "Press 🌐 key to" → **Do Nothing**, or Fn also opens the emoji picker / dictation.
- Deferred on purpose: the 300 ms mic pre-roll (the engine starts on Fn down), smart spacing between consecutive utterances (needs the AX text before the caret), and ⌘V uses the ANSI V key code (non-QWERTY layouts are not handled yet).
- Versions: TypeScript is pinned to `~6.0` because typescript-eslint does not support TS 7 yet. `apps/desktop` is CommonJS (the sandboxed preload must be CJS), so its config files are `.mts`.

## Platform decision
**Electron + TypeScript app (one codebase for Mac and Windows) + a small native helper per OS.**
- **Electron app (TypeScript):** all product logic and UI: pause rule, command engine, safety gate, text cleanup, app resolver, STT client, local database, settings, onboarding.
- **Mac helper (Swift):** only what needs macOS APIs: Fn hotkey (`CGEventTap`), microphone capture (`AVAudioEngine`), on-device speech-to-text (WhisperKit), frontmost app / focused element context, Accessibility read + press (`AXUIElement`), synthetic keys (`CGEvent`), paste with clipboard restore, opening apps (`NSWorkspace`).
- **Windows helper (C#):** same job on Windows. V3, not now.
- Helper runs as a long-lived child process of Electron, talking over **stdio**: newline-delimited JSON messages for commands/events, plus length-prefixed binary frames for audio. Define the protocol once in `packages/helper-protocol` (TypeScript types + a JSON schema the Swift side mirrors).

## Current goal: Phase 0 local prototype (see docs/BUILD_PLAN.md)
Works on this one Mac.

**In scope**
1. Hold Fn → record → speech-to-text with word timings → insert text into the focused field of any app (paste via clipboard, then restore the clipboard).
2. AI text cleanup (fillers, self-corrections, grammar, app-aware tone) via an `LLMProvider` interface. Implement **GeminiProvider** first (free tier); keep the interface so a ClaudeProvider can be added later.
3. Pause rule: a trailing "send" / "enter" / "new line" said alone after a pause (default 600 ms) is a command, not text. Run command detection on the raw transcript before cleanup.
4. Preview chip (~1 s, Esc cancels) for Normal-level actions.
5. Instant commands with no AI: send, enter/new line, undo, redo, select all, copy, paste, delete that, click *label* (via Accessibility AXPress), open *app or website*, new tab, close tab, switch to *app*, scroll up/down, cancel.
6. Safety levels (Safe / Normal / Risky / Blocked) and context rules: never type into password fields; Terminal never gets Enter executed; actions off when a meeting app is in front.
7. Local SQLite (`better-sqlite3`) for history, dictionary and resolver memory.
8. Onboarding for Microphone and Accessibility permissions.

**Out of scope for now:** backend server, accounts, billing, Chrome extension, wake word, multi-laptop, smart/multi-step tasks, auto-updates, code signing/notarization, Windows helper, mobile apps, translation.

## Tech stack (prototype)
- Electron (latest stable) + **electron-vite**, TypeScript strict, React + Tailwind for UI (listening pill, preview chip, settings, onboarding).
- `better-sqlite3` for the local DB, `zod` for message/config validation.
- Swift 6 Swift Package for the Mac helper (macOS 14+).
- Tests: **Vitest** (TypeScript core), Swift Testing/XCTest (helper).
- Packaging later: electron-builder.

## Folder layout
```
apps/desktop/                 # Electron app
  src/main/
    core/
      router/                 # IntentRouter + pause rule
      commands/               # CommandEngine, loads commands.json
      safety/                 # SafetyGate, context rules
      cleanup/                # TextCleanup + LLMProvider (gemini.ts, later claude.ts)
      stt/                    # STTProvider adapters (word timings required)
      resolver/               # AppResolver ("open GitHub")
      storage/                # better-sqlite3 schema + repositories
    helper/                   # spawns and talks to the native helper
    windows/                  # pill, chip, settings BrowserWindows
  src/preload/
  src/renderer/               # React UI
native/mac-helper/            # Swift package: SaysoHelper executable
native/windows-helper/        # C#, V3 (do not create yet)
packages/command-grammar/     # commands.json (single source of truth)
packages/helper-protocol/     # message types shared by app and helpers
docs/
```

## Rules
- API keys (Gemini, speech-to-text) live in a local, git-ignored `.env` / config or the OS keychain (`safeStorage`). Never commit keys. Never expose keys to the renderer process.
- Speech-to-text: **WhisperKit on device, inside the Swift helper**, with word timestamps. Keep it behind an `STTProvider` adapter so a cloud fallback can be added later.
- Instant commands must stay under 300 ms and never call an AI model.
- Keep all product logic in TypeScript; the helper stays thin (OS calls only) so the Windows helper is small later.
- Renderer has `contextIsolation: true`, `nodeIntegration: false`; use preload IPC.
- Write unit tests for the pause rule, command matching and safety levels.
- Ask before adding anything out of scope.

## Commands
Run from the repo root.
- Setup: `pnpm install && pnpm helper:build`. If `apps/desktop/node_modules/electron/dist` is missing, run `node apps/desktop/node_modules/electron/install.js`.
- Dev: `pnpm dev` (builds with electron-vite and launches the app; needs the helper built first)
- Tests (all TS): `pnpm test`. Single: `pnpm --filter desktop exec vitest run src/main/helper/HelperProcess.test.ts -t "<name>"`
- Typecheck / lint / format: `pnpm typecheck`, `pnpm lint`, `pnpm format`
- Helper: `pnpm helper:build`, `pnpm helper:test` (a script, because with only the Command Line Tools SwiftPM needs the Swift Testing plugin path passed explicitly; use it instead of a bare `swift test`). Smoke test: `echo '{"v":1,"type":"ping","id":"1"}' | native/mac-helper/.build/debug/SaysoHelper`

## Architecture (big picture)
One utterance flows:

Helper: Fn hold → audio frames (16 kHz mono PCM, 300 ms pre-roll) → Electron main: STT adapter (`TranscriptSegment` with per-word start/end) → context from helper (`AppContext`: bundle ID, focused element role, password / terminal / meeting detection) → **IntentRouter** (pause rule on the *raw* transcript → `RoutingDecision`: dictation text + optional trailing command) → CommandEngine (`CommandMatch{id, args, confidence}`) and/or TextCleanup (`LLMProvider`) → **SafetyGate** (`SafetyDecision`: run / preview chip / confirm / refuse) → actions sent to the helper (insert text, key press, press element, open app/URL).

- `Action` and `SafetyLevel` types (TECHNICAL_ARCHITECTURE §5.1, written in TypeScript) are the shared vocabulary.
- Commands are data, not code: `commands.json` (§5.2) with `phrases`, `endOfUtteranceOnly`, `action`, `safety`, `blockedIn` (bundle IDs).
- Pause rule (§5.3): gap = `last.start - prev.end`; trailing word is a command only if it is an end command, gap ≥ threshold (default 600 ms, stored in `adaptive_stats`), and the SafetyGate allows it in this context. Multi-word end commands ("new line", "send it") use the gap before their first word.
- `contextual_send`: Enter in chat apps; in mail apps, the AX Send button or ⌘⏎ (per-app `send_strategy` in `app_profile`).
- Never insert into secure text fields (`AXSecureTextField`).
- Latency budget for an instant command is < 300 ms end to end (p95 < 600 ms), not counting the deliberate preview chip (§9).

### Prototype deviations from the docs
- No backend: speech-to-text runs in the helper (WhisperKit); cleanup calls Gemini directly from the Electron main process through `LLMProvider`.
- Local schema is TECHNICAL_ARCHITECTURE §8.1; ignore the `synced` columns for now.

## Test expectations (§11)
- IntentRouter: table-driven cases with synthetic word timings, e.g. "send me a flower" (text), "reply send" with no pause (text), "… [700 ms] send" (command).
- SafetyGate: every command × context matrix (Terminal, Zoom/meeting app, password field, Mail).
- CommandEngine: grammar coverage + fuzzy-match thresholds.
