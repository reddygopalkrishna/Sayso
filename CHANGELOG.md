# Changelog

What changed in Sayso, when, and what is still pending. Newest first. Times are IST (+05:30).
Each entry names the commit so you can see the exact code with `git show <commit>`.

## In progress

Nothing in progress. Next: Phase 0 step 6 (instant commands without AI: undo, copy, paste, new tab, open app, click label, scroll).

## Pending (later)

Known gaps, in rough priority order. Add to this list whenever something is deferred.

- **Adaptive pause:** the pause before "send" is fixed at 600 ms (`SAYSO_PAUSE_MS` to change it). The plan is to learn it per user from cancellations (`adaptive_stats`, step 7).
- **Gmail and other web mail:** "send" presses Enter in browsers, which only adds a new line in a Gmail draft (Gmail sends with ⌘⏎). Needs the page URL or the focused element to tell web mail from web chat.
- **Phase 0 steps 6–7:** instant commands without AI (undo, copy, click *label*, open *app*, new tab, scroll…); local SQLite history and dictionary, plus Microphone/Accessibility onboarding.
- **Verify password-field detection by hand in browsers:** Sayso reads the focused field through Accessibility (`AXSecureTextField`). Native apps expose it; Chrome and Safari may only do so when accessibility is on for the page. Test: focus a password box in each browser, dictate, expect the pill to say "Sayso does not type into password fields."
- **Confirm dialog for Risky actions:** the SafetyGate returns "confirm" for Risky commands, but there is no dialog yet, so they never run. No Risky command exists yet; build the dialog with the first one (delete, git push…).
- **Meeting apps:** actions are off whenever Zoom, Teams, Webex or FaceTime is in front (the PRD says "with the mic active", which the helper cannot see yet). Google Meet in a browser tab is not detected.
- **Preview chip polish:** it sits above the listening pill, which still says "Typing…" while the chip shows; hide the pill during the chip. "No" by voice does not cancel yet (only Esc).
- **Configurable hotkey:** Sayso and Wispr Flow both use Fn, so running both pastes twice. Let Sayso use another key (for example, hold Right Option).
- **Mic pre-roll (300 ms):** the mic starts when Fn goes down, so a word said instantly can be clipped.
- **Smart spacing** between back-to-back dictations ("Hello.How are you"): needs the text before the cursor (Accessibility).
- **Non-QWERTY keyboards:** paste uses the ANSI V key code; other layouts are not handled yet.
- **Streaming cleanup:** Gemini is called without streaming; fine for paste, but streaming could cut latency.
- **Model load time:** the first load in a new helper process took 131 s (Neural Engine compile); later loads about 10 s. Show progress in the window.
- **Status window and pill polish:** waveform in the pill, a menu-bar icon, a real settings window.

## 2026-11-14

### 12:29 · Phase 0 step 5: safety gate, preview chip, no typing into password fields
- **Preview chip:** before "send" or "enter" runs, a small chip above the pill shows "Send · Esc to cancel" with a bar that fills for 1 second (`SAYSO_PREVIEW_MS`). Press **Esc** and the command is cancelled and the word you said is typed instead. "New line" (Safe) runs at once without the chip.
- **Esc is swallowed only while the chip shows**, so it does not also hit the app underneath (Esc clears drafts in some apps). The helper switches this off by itself after 3 seconds, so a crashed app can never leave Esc disabled.
- **Password fields:** Sayso never types into one, and never presses keys there. The check uses the focused element from Accessibility, is done again right before typing (the focus can move while the AI is cleaning up), and happens before any text is sent to the AI. The pill says why.
- **Safety levels (`SafetyGate`):** Blocked refuses; Safe runs; Normal shows the chip; Risky asks to confirm (no dialog yet, so it never runs). Context rules: Terminal/iTerm never get Enter, send or new line; no actions while a meeting app is in front (dictation still works); refused commands stay as typed text.
- **If you switch app during the chip,** the command is skipped instead of being sent to the wrong app. Commands also re-check the app and field just before running.
- App names no longer carry the invisible mark WhatsApp adds.
- Tested: every command × context (Slack, Mail, Terminal, iTerm, Zoom, Teams, unknown, password in two apps) = 27 cases, chip timing and Esc, and the pipeline's change-of-focus cases.

### 10:01 · Docs and skills: smaller start for every session, no app code changed (`9c077dd`)
- CLAUDE.md cut from about 15 KB to about 2.5 KB. It is now a short index and the rules; the repo detail moved to `docs/REPO_MAP.md`, and the status to `docs/STATUS.md`. Every session reads these first, so the start costs far fewer tokens.
- Added the `sayso-testing` skill (test commands, fixtures, the required cases for the pause rule, commands and SafetyGate). `build-step` now points to STATUS and REPO_MAP.
- Moved the superseded `EARLY_PLAN.md`, the Buildathon submission and its deck out of the repo (kept in `../Sayso-archive/`).

### 09:53 · Phase 0 step 4: say "send" after a pause to send (`60e87a4`)
- Say your message, pause, then say **"send"** (or "send it"): the text is typed, then the message is sent. Also **"enter"** / "press enter" and **"new line"** (Shift+Enter, a line break that does not send).
- It only counts as a command when it is the last thing you say, after a pause of at least 600 ms. "Send me a flower" and "reply send" (no pause) stay text. Saying just "send" on its own presses send.
- Send is Enter in chat apps (Slack, WhatsApp, Claude…), ⌘⇧D in Apple Mail and ⌘⏎ in Outlook/Spark/Superhuman.
- Terminals never get Enter, send or new line: the word is typed as text instead.
- The command is detected on the raw transcript, before AI cleanup, so the AI never sees or rewrites it.
- Commands are data in `packages/command-grammar/commands.json`; the helper can now press keys (`keyPress`). Tested with 27 pause-rule cases, including a real recording ("…tomorrow? [pause] Send." → text + send).

### 00:35 · No AI attribution in commits from now on
- New rule in CLAUDE.md: commits, PRs and repo files carry no Claude/Anthropic attribution or co-author line. Earlier commits are unchanged.

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
