# Sayso

Voice dictation and voice actions for the Mac. Hold a key and speak, and Sayso types clean text. Say a command, and it opens apps and sites, moves between tabs, scrolls, clicks buttons by name, opens "the first result", and fills in forms from your saved details, without touching the keyboard.

Speech is recognised **on your Mac** (WhisperKit). An AI model (Groq, with Gemini as the fallback) is used only to tidy dictated text and, if you allow it, to work out sentences that are not exact commands. English is the focus today; Telugu and Hindi are next.

Status: a working prototype for macOS, run from source. There is no installer, no account and no backend yet.

## What it can do

Everything here is built. "By hand" means someone has tried it on a real Mac; "in code" means automated tests only. The full list of what has and has not been tried live is in [CHANGELOG.md](CHANGELOG.md).

**Type**
- Hold the dictation key (Fn by default; Right Option, Command or Control also work), speak, let go: clean text appears in the focused field of any app. Fillers ("um", "uh") and stutters are removed; spoken lists, new lines, web addresses ("chatgpt dot com" becomes chatgpt.com) and emails are formatted. Default or Chill style, everywhere or per app. By hand.
- "type my email", "type my address": your saved facts, typed without any AI (see About me). In code; the live voice run is pending.
- Snippets: say a short trigger and a saved block of text is typed as written. In code.
- Say "send" or "enter" after a short pause and it presses Enter (said without a pause, it is typed as a word). By hand.

**Act** (hold the key plus Shift, or use hands-free)
- "open Slack", "switch to Chrome", "new tab", "close tab", "go back", "scroll down", "undo", "select all", "take a screenshot". Opening an app, new tab, close tab, scroll down and click by label were confirmed by hand on the base app; the rest are in code.
- "click Sign in": presses a button or link by its name, through the macOS Accessibility tree. By hand in Chrome.
- "open the first result", "open the third email": opens the Nth item in the front window. By hand in Chrome on a Google results page; web mail is not tried.
- Chains: "open Chrome, new tab". A step that loads a page makes the next one wait (1.8 s by default). Live check through the helper, one run; not tried by voice.
- Risky buttons (delete, pay, send…) ask "yes?" first. In code.

**Understand your own words**
- When no exact command matches, Sayso reads the names of the buttons and links on screen and asks an AI for a short plan made only of its own commands: "log me in", "open a fresh tab and search for AWS". Every step goes through the same safety checks as words said exactly. Checked live against Groq on sample sentences; not measured on real voice yet. It can be switched off in Settings.

**Fill forms**
- "fill in my details" fills name, email, phone and more on the page, from About me. The AI only chooses which saved fact belongs in which field, by name; it never sees a value. Filled live through the helper in Chrome on a web form; the password field was refused. Not tried by voice.

**Hands-free**
- A switch in the app (or the menu-bar icon) keeps the microphone listening. It acts on "type …", "send it" and "open …" by itself, and on any other command after the wake word ("Sayso, new tab"). Everything else it hears is ignored, never typed. The listening and the utterance cutting were checked live; a person speaking to it end to end has not been confirmed.

**Also**
- Built-in spellings for names that speech recognition gets wrong for Indian speakers (Hyderabad, Aadhaar, UPI, PhonePe, Zomato, common first names) plus your own dictionary.
- Choose the language you speak (about fifteen Indian and European languages, or detect it each time). Voice commands stay in English. Not tried by voice in Telugu yet.
- A menu-bar icon with status and the hands-free switch.
- A window with Home, Activity (what you said and what happened), About me, Words and Settings.

## Privacy

- **Audio stays on your Mac by default.** Speech-to-text runs on-device, and hands-free audio is not saved. The one exception is an optional **Cloud speech** setting (off by default, needs an OpenAI key): when you turn it on, each held-key recording is sent to OpenAI for transcription, which is faster and more accurate on short phrases and names. Hands-free listening always stays on the Mac.
- **Text to an AI, only when needed.** Short, clean dictation is fixed locally with no AI call. Longer text goes to Groq (or Gemini) for cleanup, with only the names from your dictionary that were actually said.
- **"Understand my own words"** sends the sentence you said, the app's name and up to 40 button and link names (browser tab titles removed). Never page text or what you typed. Only when no exact command matched, never in password fields or meeting apps (Zoom, Teams, FaceTime). Turn it off in Settings.
- **About me** values stay on this Mac. The AI is told which kinds of fact are saved, never their values.
- **Password fields:** Sayso does not type into them, does not list them to the AI, and does not save what was said there.
- **Keys** live in a git-ignored `.env` read only by the app's main process, never the window. History and your dictionary are in a local SQLite file (mode 600); you choose how many dictations to keep (0 turns history off).

## Run it

Needs a Mac, Xcode command-line tools with Swift, Node 24 or newer and pnpm.

```bash
pnpm install
pnpm helper:build          # the Swift helper (microphone, keys, Accessibility)
cp .env.example .env       # then add GROQ_API_KEY and/or GEMINI_API_KEY
pnpm dev
```

- The first run downloads the speech model (about 600 MB) and loads it, which can take minutes. Home shows when it is ready.
- Grant Microphone and Accessibility when asked. When run from source, macOS gives these to the program that launched Sayso (Terminal, iTerm or your editor), not to "Sayso".
- Hold Fn and speak. In System Settings → Keyboard, set "Press 🌐 key to" → Do Nothing so Fn does not also open the emoji picker.
- Without any key, Sayso still dictates with local cleanup. The "understand my own words" feature needs a Groq key (OpenAI is an optional second).
- Design preview without the app, with sample data: `http://localhost:5173/?preview` while `pnpm dev` runs.

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm helper:test`. The benchmark is in [docs/BENCHMARK.md](docs/BENCHMARK.md) and the by-voice test script in [docs/VOICE_TEST.md](docs/VOICE_TEST.md).

## How it is built

Electron and TypeScript for the app and its product logic (command grammar, safety checks, the interpreter, cleanup, local SQLite); a Swift helper for the macOS calls (microphone, keys, Accessibility, WhisperKit). They talk over a typed stdio protocol. See [docs/REPO_MAP.md](docs/REPO_MAP.md) and [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md).

## Limits

- Accuracy has not been measured on real recordings yet (the benchmark harness is built; see docs/BENCHMARK.md).
- Voice-action accuracy on real speech is unmeasured; [docs/VOICE_TEST.md](docs/VOICE_TEST.md) is the script to measure it.
- macOS only, run from source, English only. Telugu and Hindi dictation exist as a Settings choice but have not been tried; commands stay in English.
- Not built: Windows, accounts, a backend, a packaged and signed app.
