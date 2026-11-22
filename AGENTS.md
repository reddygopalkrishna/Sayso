# Sayso: setup and run guide (for reviewers and agents)

Sayso is a voice layer for macOS. You speak and it (1) types clean text at the cursor and (2) does actions: open apps, new tab, click buttons, fill forms, send WhatsApp/Slack messages, start a Gmail draft. Speech runs on the Mac (WhisperKit); an AI model only cleans up dictated text.

**Important for a fresh server:** the full app needs a Mac with a microphone, the Fn key and macOS Accessibility permission, so it cannot run on a Linux server. Everything else, which is all the product logic (about 1,800 automated tests: command matching, the pause rule, the safety gate for every command × every app context, the full utterance pipeline with a fake Mac, messaging, Gmail, cleanup), runs on any OS with Node. **Section 2 is the path that works on a fresh server. Section 3 is the full app on a Mac.**

## 0. What is where

```
apps/desktop/        Electron + TypeScript app (main process logic, React UI)
native/mac-helper/   Swift helper (mic, speech model, keys, clicks, accessibility) - macOS only
packages/command-grammar/commands.json   every voice command (single source of truth)
packages/helper-protocol/                the app <-> helper message format
scripts/benchmark/   plain Whisper vs Sayso accuracy harness
site/                the landing page (static HTML)
docs/                PRD, architecture, demo script, checklist (docs/PITCH.md = the 4-minute explanation)
```

## 1. Prerequisites

| For | Need |
|---|---|
| Sections 2 (any OS) | Node.js 24 or newer (`node -v`), pnpm 12.16.1 (`corepack enable` then `corepack prepare pnpm@12.16.1 --activate`), network for `pnpm install` |
| Section 3 (full app) | macOS 14+ on Apple Silicon, Swift 6 toolchain (Xcode with Swift 6), a microphone, about 1 GB free (speech model about 600 MB, downloaded on first run) |

No account, login or test user exists: Sayso has no sign-in. The only secrets are optional API keys (below).

## 2. Verify the product on any machine (no microphone needed)

```bash
corepack enable
pnpm install --frozen-lockfile        # if the Electron download is blocked: ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile
pnpm typecheck                        # expect: no errors
pnpm lint                             # expect: no errors
pnpm test                             # expect: all tests pass (about 1,800, under a minute)
```

The tests *are* the end-to-end journeys for this environment: each one feeds a spoken sentence into the real pipeline (`UtterancePipeline`) with a fake Mac and checks what it would type or press. Run a journey on its own:

```bash
# Journey 1: voice does things (Chrome flow). "open GitHub", "new tab", "type AWS hit enter", "open the first result", "click Sign in"
pnpm --filter desktop exec vitest run src/main/core/UtterancePipeline.test.ts -t "command mode"

# Journey 2: Gmail draft by voice ("new email", "create a draft", "new email to priya at gmail dot com"). Never sends.
pnpm --filter desktop exec vitest run src/main/core/UtterancePipeline.test.ts -t "email"
pnpm --filter desktop exec vitest run src/main/core/commands/email.test.ts

# Journey 3: WhatsApp and Slack messages ("send hi to Priya on WhatsApp", with the 3 s cancel chip)
pnpm --filter desktop exec vitest run src/main/core/commands/whatsappFlow.test.ts src/main/core/commands/messageSentence.test.ts

# Journey 4: dictation clean-up and the "pause rule" ("... send" at the end presses Enter, "send" inside a sentence stays text)
pnpm --filter desktop exec vitest run src/main/core/router src/main/core/cleanup

# Journey 5: hands-free mode, typing mode ("start typing" ... "send it"), "stop listening"
pnpm --filter desktop exec vitest run src/main/core/handsfree

# Safety: every command in every app context (password fields, Zoom/Teams, terminals, risky buttons)
pnpm --filter desktop exec vitest run src/main/core/safety
```

The command list: `packages/command-grammar/commands.json`. The full checklist a person runs by voice: `docs/STABILITY_CHECK.md`.

## 3. Run the full app (macOS only)

### 3.1 Install and build

```bash
pnpm install --frozen-lockfile
pnpm helper:build                      # builds the Swift helper (first build takes a few minutes)
cp .env.example .env                   # then edit .env (see 3.2). Optional: the app works without keys.
```

If `apps/desktop/node_modules/electron/dist` is missing: `node apps/desktop/node_modules/electron/install.js`.

### 3.2 Environment variables (`.env` in the repo root, git-ignored; no quotes, no spaces around `=`)

| Variable | Needed? | What it does |
|---|---|---|
| `GROQ_API_KEY` | optional, recommended | fast AI text clean-up and "understand my own words" (tried first) |
| `GEMINI_API_KEY` | optional | clean-up fallback |
| `OPENAI_API_KEY` + `OPENAI_MODEL` | optional | a second AI for clean-up and understanding your own words; also enables optional cloud speech |
| `SAYSO_CLOUD_SPEECH=on` | optional, off by default | send speech to OpenAI Whisper instead of the on-device model (audio leaves the Mac) |
| `SAYSO_AI_PROVIDER` | optional | `auto` (default) or force `gemini` / `groq` / `openai` |
| `SAYSO_CLEANUP_LEVEL` | optional | `off`, `light` or `full` (default) |

**Without any key**, the app still dictates (local clean-up of fillers and punctuation) and runs every instant voice command; only the AI clean-up and the "understand my own words" interpreter are off. Keys are read only by the main process and never reach the UI.

### 3.3 Start

```bash
pnpm dev
```

1. Wait for `[stt] … ready` in the terminal (first run: the speech model downloads, about 600 MB, then compiles; allow several minutes).
2. macOS asks for **Microphone** and **Accessibility** permission for the app that launched it (Terminal, iTerm or Cursor). Grant both. (System Settings → Privacy & Security.)
3. System Settings → Keyboard: set "Press 🌐 key to" to **Do Nothing**, and Dictation "press Fn twice" to **Off**. Close other dictation apps.
4. Home shows the speech model ready. Click the **hands-free** switch on Home (it starts off at every launch), or **double-tap Fn**.

### 3.4 Journeys to try end to end (say each line, then wait about 2 seconds)

**A. Voice does things (hands-free on, Chrome open):**
"open Chrome" → "new tab" → "type AWS hit enter" → "open the first result" → "click Sign in" (or "log me in") → "fill in my details" (fill About me in the app first; passwords are never touched) → "scroll down" → "go back" → "close tab".

**B. Voice writes (hold Fn while speaking):** hold Fn and say "um tell Priya to meet me in Hyderabad at five" → typed: `Tell Priya to meet me in Hyderabad at 5.` Hold Fn+Shift and say "new tab" to run a command.

**C. Long text into ChatGPT or Claude:** hands-free, "start typing", speak several sentences (the pill shows Typing mode), then say "send it". "new chat" starts a fresh chat.

**D. Messaging:** "send hi to Priya on WhatsApp" (a 3-second cancel chip shows first; say or press Esc to cancel). Same for Slack.

**E. Gmail draft (never sends):** "new email", or "new email to priya at gmail dot com" → a Gmail draft opens in the browser; then "type hello Priya", "next field", "type Meeting tomorrow".

**F. Safety:** click a password field and say "type hello" → nothing is typed and the pill says why. In Zoom/Teams "new tab" is refused. "click Delete" on a page asks first.

### 3.5 Mac-side tests

```bash
pnpm helper:test                       # Swift tests (use this script, not a bare `swift test`)
```

## 4. Known limits (honest list)

- Very short phrases ("send it") are missed about 2 times in 15 in our tests; accuracy with real voices and Indian-English speakers is not yet measured (`docs/BENCHMARK.md` explains how it will be).
- The speech model takes minutes to load after the helper is rebuilt.
- Mac only for now; Windows needs a new helper.
- Gmail and WhatsApp by voice are driven through the screen (keyboard and accessibility), not their APIs, so a big page redesign can break a click.
- The microphone input volume should be 100% in System Settings → Sound, and the microphone within arm's length.

## 5. Notes for agents working in this repo

- Product logic is TypeScript; the Swift helper only does OS calls. The renderer has `contextIsolation: true`, `nodeIntegration: false`.
- Do not commit `.env`. No key is ever printed.
- More: `CLAUDE.md`, `docs/REPO_MAP.md`, `docs/STATUS.md`.
