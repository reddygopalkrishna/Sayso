# Changelog

What changed in Sayso, when, and what is still pending. Newest first. Times are IST (+05:30).
Each entry names the commit so you can see the exact code with `git show <commit>`.

## In progress

### Phase 0 step 4: pause rule ("… [pause] send" runs as a command), started 2026-11-14
Done so far (not committed yet):
- `packages/command-grammar/`: `commands.json` with the end commands `send`, `enter`, `new_line`, validated with zod (8 tests).
- Helper protocol: `keyPress` request (key + modifiers) on the TypeScript side.

Still to do for this step:
- Swift helper: handle `keyPress` (synthetic key events). `pnpm helper:test` fails until this is done.
- IntentRouter: the pause rule on the raw words (gap ≥ 600 ms before the last word or phrase), with tests that use the real WhisperKit transcripts in `apps/desktop/src/main/core/stt/fixtures/`.
- Remove the spoken command from the text, run `send` as Enter in chat apps and ⌘⏎ / ⌘⇧D in mail apps.
- Hook it into `UtterancePipeline` before cleanup.

## Pending (later)

Known gaps, in rough priority order. Add to this list whenever something is deferred.

- **Phase 0 steps 5–7:** preview chip with Esc to cancel and safety levels (never type into password fields, no actions while a meeting app is in front); instant commands without AI (undo, copy, click *label*, open *app*, new tab, scroll…); local SQLite history and dictionary, plus Microphone/Accessibility onboarding.
- **Configurable hotkey:** Sayso and Wispr Flow both use Fn, so running both pastes twice. Let Sayso use another key (for example, hold Right Option).
- **Mic pre-roll (300 ms):** the mic starts when Fn goes down, so a word said instantly can be clipped.
- **Smart spacing** between back-to-back dictations ("Hello.How are you"): needs the text before the cursor (Accessibility).
- **Non-QWERTY keyboards:** paste uses the ANSI V key code; other layouts are not handled yet.
- **Streaming cleanup:** Gemini is called without streaming; fine for paste, but streaming could cut latency.
- **Model load time:** the first load in a new helper process took 131 s (Neural Engine compile); later loads about 10 s. Show progress in the window.
- **Status window and pill polish:** waveform in the pill, a menu-bar icon, a real settings window.

## 2026-11-14

### 00:33 · Only one Sayso runs at a time
- Starting `pnpm dev` while another copy was running left both copies listening to Fn, so each dictation was pasted twice (up to five times tonight).
- Now a newly started dev copy makes the old one quit and takes over (it has your latest code). A packaged app instead brings its existing window forward.
- Quitting is one clean path (stop the helper, then exit). The first version hung half-quit because the new copy's lock retries made the old copy call quit repeatedly; fixed and tested live with two copies: one left running, then 0 after ⌘Q.
- Clicking the Dock icon reopens the status window after it was closed.

### 00:26 · Changelog, and a clear page for localhost:5173 in a browser
- Added this `CHANGELOG.md`; CLAUDE.md now requires updating it after every change.
- Opening `localhost:5173` in a browser showed a blank page (it only serves the Sayso window and has no app connection there). It now explains that and says how to reopen the window (Electron icon in the Dock).

### 00:21 · Fix: no error popups when the terminal closes (`8f227a1`)
- Closing the terminal that started Sayso made every log line fail with "write EIO" and Electron showed an error dialog each time. Log write errors are now ignored.

### 00:17 · Faster AI cleanup: Gemini Flash-Lite (`0fcbe17`)
- `gemini-flash-latest` returned 503 "high demand" or took 35–130 s, so every cleanup hit the 2.5 s limit and fell back to local cleanup.
- Default is now `gemini-flash-lite-latest` with minimal thinking: 0.9–1.3 s in repeated tests, correct output ("…5, no, 6…" → "6:00").
- Measured in real use: AI cleanup in 1.2 s for Claude.

### 00:04 · Fix: the app in front is detected again (`a1b2b9c`)
- Replies to "which app is in front?" were never matched to their request, so every dictation waited 500 ms and used the casual tone for an "unknown app". The message handling is now exhaustive, so a new message type cannot be dropped silently again.

## 2026-11-13

### 22:03 · Phase 0 step 3: AI text cleanup (`0bc053c`)
- `LLMProvider` interface + `GeminiProvider` (key in a request header, never in the URL).
- Tone per app: casual (Slack, WhatsApp, Claude…), professional (Mail, Outlook, Notes…), literal (Terminal, VS Code… never sent to AI).
- Cleanup levels Off / Light / Full; on any AI error, timeout or suspicious output, a local cleanup (remove "um", "uh", repeats) is used instead.
- API key read from `.env` into the main process only (not visible to the UI or the helper).

### 21:57 · Phase 0 step 2: hold Fn to dictate (`1685e3a`)
- Swift helper: Fn key listener, microphone at 16 kHz, on-device WhisperKit (`large-v3 turbo`, about 600 MB, downloaded once) with word timings, paste with clipboard restore.
- Electron: dictation state machine (short taps ignored, Fn + another key cancels, 5 min limit), floating "Listening…" pill, status window.
- Measured: 4–5 s of speech transcribed in 0.6–1.3 s.

### 21:27 · Phase 0 step 1: project setup (`5421239`)
- pnpm monorepo: Electron + React + Tailwind app, Swift helper talking over stdin/stdout, shared message definitions with tests on both sides.
