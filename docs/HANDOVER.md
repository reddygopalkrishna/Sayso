# Handover: where Sayso is, and what to do next

Written 21 Nov 2026 (about 16:45 IST) so another coding session can continue in this folder without asking what happened. Read this first, then `docs/STATUS.md`, `docs/REPO_MAP.md` and the newest entries of `CHANGELOG.md` (they say what was tested live and what only in code).

## Rules that apply to every change (from the founder)

- **One commit per piece of work, then its CHANGELOG entry as a second commit.** Commit messages say what and why in plain words.
- **Real commit times only.** Never re-date, rewrite, squash or force-push history. **Do not push.**
- **No AI attribution anywhere:** no "Co-Authored-By", no "Generated with", no AI tool or company name in commits, code, docs or metadata.
- **Keys** live in the git-ignored `.env` only. Never print, log, commit or paste one; never send one to the window (renderer).
- **Before every commit:** `pnpm -s typecheck`, `pnpm -s lint`, `cd apps/desktop && npx vitest run`, `cd packages/<each> && npx vitest run`, `pnpm -s helper:test`, and `npx prettier --write` on what you changed. Do not chain `git commit` after a check with `;` (a failed check must stop the commit; use `&&`).
- **Honest docs and messages:** say what was tested live and what only in code.
- **Only one Sayso copy may run.** After a main-process or helper change the founder's `pnpm dev` must be restarted (the window shows "Restart Sayso"). Rebuild the helper with `pnpm helper:build`.
- **macOS shell:** `sed -i ''` needs the empty quotes. Node 26 cannot strip TypeScript parameter properties, so scripts that import app code run through vitest (see `scripts/benchmark/bench.sh`).

## What exists (all committed; nothing pushed)

Tests at the last commit: 1,417 desktop, 58 command-grammar, 68 protocol, 79 helper. Typecheck and lint clean.

- **Base app (before 21 Nov):** hold-key dictation on device (WhisperKit), AI cleanup (Groq, Gemini fallback), pause rule for send/enter/new line, SafetyGate and preview chip, instant commands, chained commands, "yes?" for risky buttons, history, dictionary, remembered "open" choices.
- **Built on 21 Nov:** snippets, Settings, Default/Chill style, choose the hold key, hands-free (segmenter, continuous listening, wake word, switch), language setting, menu-bar icon, position commands ("open the first result"), screen reading + the interpreter ("log me in"), About me, fill forms, Indian names, sidebar and cards on every screen, voice test script (`docs/VOICE_TEST.md`), benchmark harness (`docs/BENCHMARK.md`, `pnpm benchmark`), README and `docs/DEMO_SCRIPT.md`, and, in the last hours:
  - wait 1.8 s for a page to load between chained steps (`SAYSO_PAGE_WAIT_MS`); wait until an opened app is in front (up to 3 s);
  - **messaging by voice** for Slack and WhatsApp (`core/messaging/recipes.ts`, `commands/messageSentence.ts`): "message Priya on Slack saying …"; the text after "saying" is typed **exactly as said**, never read as commands, never reworded by the AI; the chip `Send “…” to Name?` shows 3 s, Esc cancels;
  - OpenAI as a second AI for cleanup (Groq, then OpenAI, then Gemini; needs `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env`);
  - "open the second item/email" on web lists (row falls back to links, headings, groups, in the main content and the list's own column);
  - browser tab titles and toolbar names are never listed for the AI;
  - every way of saying "sign in" picks the sign-in button;
  - a one-page site in `site/` (not deployed).

## Do next, in this order

### 1. The WhatsApp live test (permission given, nothing sent yet)

The founder said **yes, in the chat, to at most 3 test messages**, to the WhatsApp contact **"Reddy Varshini" only**, each message **exactly** `Sayso test message, please ignore`. Re-confirm with the founder before sending anything if this is a new session: permission does not carry over by itself.

State: **no message has been sent.** A dry run (open WhatsApp, ⌘F, type the name into the search box, list what is on screen, press Escape) was interrupted by the founder partway; the name may still be sitting in WhatsApp's search box. Press Escape in WhatsApp to clear it, and do not use ⌘A and Delete there (focus may be a message box with someone's draft).

Procedure:
1. Dry run only: confirm the **first** search result for "Reddy Varshini" is that exact chat. If there is no such contact, or another chat comes first, **stop and report**; do not pick anyone else.
2. Run the **real pipeline** (`UtterancePipeline` with real `HelperActions` and a real helper process, through a vitest harness like `scripts/benchmark/run.benchmark.ts`), with the segment `message Reddy Varshini on WhatsApp saying Sayso test message, please ignore`. The chip must show `Send “Sayso test message, please ignore” to Reddy Varshini?`. A harness chip can log the label and proceed after a moment, but check the label matches exactly before it proceeds, and **check the chat header says "Reddy Varshini"** before the send Enter (cancel otherwise and clear the typed draft with Esc in the message box).
3. Send **one** message, look at the result (the chat on screen), and only send a second or third if something specific still needs checking. Record exactly what was sent and what was only typed.
4. Slack is **not installed** on this Mac: do not claim it works. If Slack is installed later, type into the compose box only, then clear it; no sends.

Worth building first (small, makes this safe): before the send Enter, read the open chat's header and refuse if it does not match the name asked for. Today the chip names who was asked for, not who the app opened.

### 2. Voice-controlled "create an API key" flow (founder's request)

Goal: by voice only, in the browser: open OpenAI's platform, click **API keys**, click **Create new secret key**, type a name ("Demo Project"), press Enter or click **Create**, and so on, using the same click-by-name and type commands.

What already works: "open <site>", "new tab", "click <button name>", "type <words>", "send it" / "enter" after a pause, "open the first result", chains with the page wait, the interpreter for loose wording ("log me in", "get me in").

What to add or check:
- `KNOWN_SITES` in `core/resolver/AppResolver.ts` has no OpenAI platform entry, so "open OpenAI" will not go there. Add an entry (for example `openai platform` → the platform's API keys page) and tests; confirm the right address in a browser first.
- Walk the flow once through the helper on the real pages and write down the exact button names the page exposes (the accessibility names differ from what you see, for example "Create new secret key"). Add the working phrases to `docs/DEMO_SCRIPT.md` or a new voice-flow doc with "tried live" or "not tried".
- **Safety:** the secret key is shown **once** in a dialog. Sayso must never read it aloud, print it, log it or send it to an AI. The founder copies it by hand (or by "click Copy" and pastes it into `.env` themself). Sign-in pages, passwords and two-step codes stay the founder's job (Sayso never types into password fields). Add `revoke` (and `rotate`) to the risky-label list in `core/safety/SafetyGate.ts` so "click Revoke" asks "yes?" first, with tests; "create" is not risky.
- Typing a key name: after "click Create new secret key", the name box is usually focused; say "type Demo Project", then "press enter". If focus is not in the box, "click Name" first.

### 3. Things that were never tested by a person speaking

These are built and tested in code, and some through the helper, but never end to end by voice. Run `docs/VOICE_TEST.md` (44 commands, results table), paste the failing `[dictation]` log lines from the "Sayso dev" terminal, and fix exactly those in the interpreter prompt (`core/interpret/prompt.ts`), the phrases (`packages/command-grammar/commands.json`) or the fuzzy matching (`core/commands/CommandEngine.ts`):
hands-free end to end, messaging, fill in my details, the interpreter on real voice, Telugu or Hindi dictation, the demo flow in `docs/DEMO_SCRIPT.md` (rehearse it three times and cut what fails).

### 4. Other open items

- **Benchmark:** only run on synthetic `say` audio. The founder needs to record real sentences (`docs/BENCHMARK.md`); then run `pnpm benchmark <folder>` and `--ai`. No accuracy number may be quoted before that. The interpreter is measured without a screen.
- **OpenAI cleanup:** no real OpenAI request has been made. Add `OPENAI_API_KEY` and `OPENAI_MODEL` to `.env` (a fast chat model from the founder's account), restart, and watch the `[cleanup]` log lines and the History speed line.
- **"Open the second email" on Gmail:** not tried (private mail). The web-list fallback was tried on GitHub issues and Hacker News only; it is a guess about page structure.
- **Interpreter privacy:** tab titles are now filtered in known browsers, but in any other app the interpreter is sent up to 40 on-screen names. The helper reads whatever app is in front at that moment.
- **Messaging limits:** the person messaged is the first search match; a cancelled message leaves its text typed in the box; `messagePreviewMs` (3 s) has no setting; Slack's ⌘K and WhatsApp's ⌘F + Down + Enter are unconfirmed beyond ⌘F opening WhatsApp's search.
- **Site (`site/`):** not deployed (steps in `site/README.md` are untested), no demo video yet, no download or contact link; keep every claim tied to what was tested.
- **Pending list:** `CHANGELOG.md` → "Pending (later)" and "In progress" (adaptive pause, Gmail send, "delete that", the ask-once chip for "open X", more system commands, preview-chip polish, packaged-app permissions).
- **Phase 2 (backend, accounts, signing)** must not start before the above; AWS credits and OpenAI credits are noted in `docs/STATUS.md`.

## How to test against the real apps without the microphone

The helper is a child process speaking JSON lines on stdin and stdout (`packages/helper-protocol/src/messages.ts`). A script can spawn `native/mac-helper/.build/debug/SaysoHelper`, send `{"v":1,"id":"r1","type":"activateApp","bundleId":"com.google.Chrome"}`, `keyPress`, `insertText`, `listElements`, `pressElement`, `pressPosition`, `getContext`, and read the replies. Always check `getContext` right before acting (the front app can change), never type into a field you have not confirmed, and close any tab you opened. `SAYSO_DEBUG_POSITION=1` makes the helper print what a position request found and which kind it used. Groq's free tier allows about 7,000 input tokens a minute, so space interpreter tests a few seconds apart.

## Where things are

`docs/REPO_MAP.md` has the layout and commands. The ones used most: `pnpm dev`, `pnpm test`, `pnpm helper:build`, `pnpm helper:test`, `pnpm benchmark <folder>`, `pnpm benchmark:test`. The design preview without the app: `http://localhost:5173/?preview` while `pnpm dev` runs.
