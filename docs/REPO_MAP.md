# Sayso repo map

Read this instead of exploring the repo. Update it when folders or commands change.

## Layout
```
apps/desktop/                      Electron app (CommonJS; configs are .mts)
  src/main/
    index.ts                       app entry; quitting goes through shutdown() (stop helper, app.exit(0))
    singleInstance.ts              dev: new copy replaces old; packaged: old copy stays and shows its window
    StatusHub.ts                   holds AppStatus (src/shared/status.ts), pushed to windows over IPC
    config/env.ts                  reads GEMINI_API_KEY, GEMINI_MODEL, SAYSO_CLEANUP_LEVEL (off|light|full), SAYSO_PAUSE_MS, SAYSO_PREVIEW_MS
    helper/HelperProcess.ts        spawns native helper, request(), restart with backoff, stop
    core/UtterancePipeline.ts      deliver(segment): context → router → cleanup → insert → SafetyGate (+chip) → key
    core/dictation/DictationController.ts   Fn state machine (holds < 250 ms are taps, 5 min cap)
    core/stt/HelperWhisperSTT.ts   STTProvider; strips Whisper markers like [BLANK_AUDIO]
    core/router/IntentRouter.ts    pause rule on raw words (see TECHNICAL_ARCHITECTURE §5.3)
    core/cleanup/                  TextCleanup, tone.ts, gemini.ts, light.ts, prompt.ts, types.ts
    core/actions/                  HelperActions (insert, keys, Esc capture); sendStrategy.ts: Enter, ⌘⇧D (Mail), ⌘⏎ (Outlook)
    core/commands/                 CommandEngine (whole-utterance matching, args, fuzzy), errors for the pill
    core/resolver/                 AppResolver: "open X" → app, known site, domain, or web search; "switch to X"
    core/storage/                  SQLite on node:sqlite: db.ts (the only driver code), migrations.ts, History/Dictionary/ResolverMemory repos
    core/history/                  HistoryRecorder: outcomes and failures → history rows (no text for password-field refusals)
    core/permissions/              PermissionsMonitor: polls the helper for Microphone/Accessibility
    core/safety/                   SafetyGate (run / preview / confirm / refuse, meeting apps, password fields), PreviewChip
    core/context/HelperContext.ts  frontmost app from the helper
    windows/                       mainWindow.ts, overlay.ts (pill and chip: non-focusable panels), load.ts
    ipcHandlers.ts                 one handler per renderer request; zod-validated, answers {ok, value|error}; no Electron import (unit-tested)
  src/preload/                     IPC bridge (api.d.ts)
  src/renderer/src/                React UI; #pill and #chip select the overlays; main window tabs: Home (+ Onboarding), History, Dictionary
native/mac-helper/                 Swift package
  Sources/SaysoHelperCore/         protocol, MessageLoop, FnTracker, service protocols (no OS frameworks; unit-tested with fakes)
  Sources/SaysoHelperMac/          thin adapters: FnEventTap, MicRecorder, WhisperTranscriber, PasteInserter, WorkspaceContext, KeyPresser
  Tests/SaysoHelperCoreTests/
packages/helper-protocol/          TS zod schemas (src/messages.ts), NDJSON codec, schema/messages.schema.json (generated), fixtures/*.json
packages/command-grammar/          commands.json (single source of truth) + schema + grammar tests
docs/                              see CLAUDE.md for which doc to read when
CHANGELOG.md                       updated on every commit
```

## Commands (run from repo root)
- Setup: `pnpm install && pnpm helper:build`. If `apps/desktop/node_modules/electron/dist` is missing: `node apps/desktop/node_modules/electron/install.js`.
- Dev: `pnpm dev` (needs the helper built first).
- All TS tests: `pnpm test`. One file: `pnpm --filter desktop exec vitest run <path> -t "<name>"`.
- Typecheck, lint, format: `pnpm typecheck`, `pnpm lint`, `pnpm format`.
- Helper build: `pnpm helper:build`. Helper tests: `pnpm helper:test` (a script, because SwiftPM needs the Swift Testing plugin path; do not use a bare `swift test`).
- Helper smoke test: `echo '{"v":1,"type":"ping","id":"1"}' | native/mac-helper/.build/debug/SaysoHelper`.

## Facts that are not obvious
- **Protocol:** requests carry an `id` and get exactly one reply with that id (`pong`, `done`, `transcript`, `error`). Events (`hotkey`, `fnListener`, `sttStatus`, `log`) are unsolicited. Recording start/stop/cancel use the utterance id (`u-N`).
- **Audio never crosses the pipe.** WhisperKit runs in the helper and returns text plus word timings in ms.
- **Protocol changes:** add the message in `messages.ts`, in `Message.swift`, and as a fixture. Both Vitest and Swift tests decode the fixtures. Regenerate the schema with `pnpm --filter @sayso/helper-protocol gen:schema` (a test fails if it is stale).
- **Cleanup:** tone comes from the bundle id (chat = casual, mail/docs = professional, terminals and editors = literal, which never goes to the LLM). `LLMProvider.cleanup` has a 2.5 s timeout; output is checked and falls back to `lightCleanup`. Gemini uses REST `generateContent`, key in the `x-goog-api-key` header (never in the URL), model `gemini-flash-lite-latest` with `thinkingLevel: minimal` unless `GEMINI_MODEL` is set.
- **Config:** `.env` in repo (dev), then `~/Library/Application Support/Sayso/.env`, then real env vars. Parsed into a config object, never copied to `process.env`, so the helper and renderer never see the key. No key means Light cleanup.
- **Helper env:** `SAYSO_WHISPER_MODEL` (default `openai_whisper-large-v3-v20240930_turbo_632MB`), `SAYSO_STT_LANGUAGE` (default `en`; `auto` detects), `SAYSO_MODELS_DIR` (set by the app). The first run downloads about 600 MB and compiles for the Neural Engine.
- **Dev permissions:** Accessibility and Microphone go to the launching app, not to Sayso. Set System Settings → Keyboard → "Press 🌐 key to" → **Do Nothing**.
- **Versions:** TypeScript pinned to `~6.0` (typescript-eslint does not support 7 yet).
- **Pause rule:** `SAYSO_PAUSE_MS` (600) gap before the first word of the end phrase; punctuation ignored; longest phrase wins; blocked apps keep it as text.
- **Safety:** `decideAction(command, context)` order: blocked level → `blockedIn` app → meeting app → password field → level (safe runs, normal shows the chip, risky = confirm, which is not executable until a dialog exists). The router only strips a command from the text if it is executable, so refused commands stay typed text. The pipeline reads the context again right before inserting and before pressing a key (focus can move during cleanup or the chip). Context carries `focusRole` and `secureField` from Accessibility (`AXSecureTextField`).
- **Command mode:** hold Fn+Shift (the helper reports a `command` hotkey phase, in either order). `DictationController` passes `mode` to `deliver`; in command mode `UtterancePipeline.deliverCommand` matches the whole utterance with `CommandEngine`, never types, and throws `CommandNotUnderstood` / `CommandRefused` / `CommandFailed` so the pill shows why nothing happened. Dictation mode only knows the end commands (pause rule).
- **Grammar:** a phrase may end in one `{label}`, `{target}` or `{app}` (validated against the action: `pressElement`, `openTarget`, `switchApp`). Label templates fill from the args. Exact literal phrases beat argument phrases ("press enter" over "press {label}").
- **Helper requests added in step 6:** `scroll`, `pressElement` (AXPress search, 300 ms / 4000-node budget), `listApps` (reply `apps`), `openApp`, `activateApp`, `openURL` (http/https only). Apps are scanned in the background at startup.
- **Local database** (`~/Library/Application Support/Sayso/sayso.sqlite`, mode 600): `PRAGMA user_version` migrations (never edit a shipped one; add the next), tables `utterance_history`, `dictionary_entry`, `resolver_memory`. `SAYSO_HISTORY_KEEP` (default 50, 0 = history off). Opened in `whenReady`; if it fails the app still dictates and Home shows why. Anything refused in a password field is stored with no text. The renderer only reaches it through `ipcHandlers.ts`.
- **Dictionary:** `applyDictionary` fixes spelling locally (whole words, case-insensitive, "sounds like" → your word) before cleanup, in Light and Full; the terms also go to the AI as exact spellings. **Remembered choices:** "open GitHub app" / "open GitHub website" picks that kind and remembers it for plain "open GitHub".
- **Onboarding:** the helper answers `getPermissions` and `requestPermission` (Microphone prompt, Accessibility dialog); `PermissionsMonitor` polls (2 s while something is missing, 15 s otherwise) into `AppStatus.permissions`; the Onboarding card hides itself when both are granted. System Settings links are a fixed list in `ipcHandlers.ts`.
- **Test copy:** `SAYSO_DATA_DIR=/some/dir pnpm dev` runs a second copy with its own database, models folder and single-instance lock (symlink `models` to reuse the speech model).
- **Esc capture:** `captureEscape` makes the helper swallow Esc and send an `escape` event; it switches itself off after 3 s. Only the preview chip uses it.
