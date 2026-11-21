# Sayso: Product Requirements Document (PRD)

> **Sayso** (from "on your say-so", meaning "on your command") is a temporary working name. Check domain and trademark before public use.
> Tagline: **"Your say-so. Done."** Default wake word: "Hey Sayso".
> Version: 0.2 draft, 13 Nov 2026 (added Infina teardown changes). Status: pre-build.

Related docs: [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) · [ARCHITECTURE_FLOW.md](ARCHITECTURE_FLOW.md)

---

## 1. Summary

Sayso is a desktop app (Mac first, then Windows; built with Electron + native helpers) that lets people **talk to their computer and have it both type and act**. It does what voice dictation tools do (clean, polished text in any app), and it also performs the actions that normally pull your hands back to the keyboard and mouse: press Enter, click Send, open apps and websites, switch tabs, and run smart multi-step tasks ("In GitHub, create a new repo called instance").

It works with **every app and website without connecting to them**: it reads what is on screen and clicks and types like a human, inside the user's already logged-in apps and browser.

## 2. Problem

- Voice dictation tools (e.g. Wispr Flow) made typing by voice fast and clean, but **they stop at text**. After speaking, the user's hand still goes back to press Enter, click Send, open the next app, or switch windows. Every action breaks the flow.
- The built-in OS voice control (macOS Voice Control, Windows Voice Access) can press keys and click, but it is slow, rigid and hard to learn, so almost nobody uses it.
- General "computer-use" AI agents can do tasks, but they are slow (10-60 s), unpredictable and not built for the hundreds of small, instant actions people do every day.
- People who work on **two or more laptops side by side** have no way to keep working with their hands on one machine while getting work done on another.

**Insight:** the winning experience is *dictation + instant actions + safe smart tasks* in one smooth flow, so the user never needs to touch the keyboard.

## 3. Goals and non-goals

### Goals
1. Users can dictate, polish and **send** messages without touching the keyboard.
2. Instant commands (send, click, open, switch, scroll, undo) feel **instant (< 300 ms)** and are **reliable (> 98% correct)**.
3. Text and commands never get confused (low false-trigger rate).
4. Smart tasks turn natural sentences into correct actions, safely.
5. Works with any Mac app and any website, with no per-app integrations required.
6. Multiple laptops side by side can each be voice-controlled independently, without reacting to each other.

### Non-goals (for now)
- Windows support (V3).
- Translation from Indian languages (V4).
- Mobile apps.
- Executing trades, payments or terminal commands by voice (blocked by default).
- Replacing the OS or building our own AI models.

## 4. Target users

| Segment | Why they care | Phase |
|---|---|---|
| **Developers** (incl. people prompting Claude Code, Cursor, Codex) | Long prompts, constant app switching, terminals, GitHub | V1 launch |
| **Founders / operators** | Slack, email, docs, many small actions all day | V1 launch |
| **Sales, support, recruiters** | High-volume messaging and replies | V1 launch |
| **Multi-laptop workers** (developers, traders, editors) | Hands busy on one machine, voice on the other | V2 |
| **Accessibility users** (RSI, motor impairment, low vision) | Need hands-free control that is reliable | V2-V3 |
| **Indian-language speakers** | Speak Telugu/Hindi/Hinglish, get clean English | V4 |

### Personas
- **Ravi, developer (primary):** two laptops on his desk. Writes code by hand on one; on the other, he says "Hey Sayso, open Claude Code, pull Jira story 918 and do the work… send."
- **Priya, founder:** answers 150 Slack/WhatsApp/email messages a day. Wants to speak, have it cleaned up, and say "send".
- **Arjun, support lead:** replies to tickets all day; wants "reply, thank them, say we'll fix it by Friday… send".

## 5. Competitive landscape

| Product | What it does | Gap we exploit |
|---|---|---|
| **Infina** (infina.so, closest competitor, v1.45 Nov 2026) | Hands-free voice typing for Mac and Windows; types, presses Enter, opens apps; "Infina Remote" presses buttons by name; English only; on-device STT | Does not do smart or multi-step tasks, does not answer or read back, English only, no phone/Linux, no Intel Macs, no multi-laptop, no prompt help. Full teardown: [COMPETITOR_INFINA.md](COMPETITOR_INFINA.md) |
| Wispr Flow ($2B valuation, Aug 2026) | Best-in-class dictation; Command Mode edits text | Does not act (no send, click, open, tasks) |
| Superwhisper, Aqua Voice, Willow | Dictation | Same as above |
| macOS Voice Control / Windows Voice Access | Free voice commands | Slow, rigid, hard to learn, no AI polish |
| Talon Voice, Dragon | Power voice control / accessibility | Steep learning curve or stagnant |
| Claude / ChatGPT / Copilot computer use | AI agents controlling the desktop | Slow, not built for instant everyday actions, no dictation flow |
| Simular, Highlight, Raycast | Desktop AI / launchers | Not voice-first; no dictation + action flow |

**Positioning:** "Wispr Flow, but it also does the work." Win on **speed, smoothness, safety, works everywhere, and multi-laptop use**.

**Main risk:** Wispr or the OS vendors add actions. **Answer:** ship fast, own the "never touch the keyboard" experience, and build trust through safety design.

## 6. Core concepts

| Concept | Meaning |
|---|---|
| **Dictation** | Speech → cleaned text typed into the focused field |
| **Instant command** | A short command (send, click X, open Y) handled by a rule engine without AI, < 300 ms |
| **Smart task** | A natural sentence turned into one or more actions by an AI planner ("create a repo called instance") |
| **Multi-step task** | A smart task with many steps across apps (Overleaf resume example), with a progress panel |
| **Trigger** | How a device knows the user is talking to it: hotkey (push-to-talk), command key, or wake word |
| **Preview chip** | A small on-screen chip ("⏎ Send") shown ~1 s before an action; cancellable |
| **Safety level** | Safe / Normal / Risky / Blocked: decides whether an action runs, previews, confirms, or is refused |

## 7. User experience

### 7.1 Triggers
- **Push-to-talk (default, free and unlimited):** hold **Fn** → speak → release. Everything is dictation, plus end-of-utterance commands like "send" (pause rule).
- **Hands-free, no key (V1):** on-device listener is always on in this mode and waits for a spoken trigger: "type …" (types the rest of the sentence), "send it" / "enter" (presses Enter), "open …" (opens an app or site), or the wake word "Sayso" for any other command. Turned on by double-tapping Fn (Mac) / Left Ctrl (Windows). Naps 1 minute after the user stops talking.
- **"type" prefix:** "type can we move the call to 3pm" types only what follows "type", without the pause rule. This is the clear, low-error path for hands-free dictation.
- **Command key:** hold **Fn + Shift** → everything spoken is treated as a command or smart task.
- **Wake word (on-device):** "Sayso" in V1 for hands-free control (default). In V2 it becomes renameable per device (e.g. "Hey Atlas", "Hey Nova") for multi-laptop setups.
- **Tap mode (hands-free dictation):** double-tap Fn to start, tap again to stop.

### 7.2 Telling text apart from commands
1. Listening only happens while a trigger is active. No always-on listening unless the wake word is enabled; wake-word detection runs entirely on device.
2. **Pause rule:** in dictation mode, a command word ("send", "enter", "new line") is executed only if it is (a) at the end of the utterance, (b) said alone, and (c) preceded by a pause ≥ 600 ms (per-user adaptive).
   - "Can we meet at 5 tomorrow? *[pause]* Send" → type + send.
   - "Can we meet at 5 tomorrow, send me a flower" → all text.
   - "Reply send" → all text.
3. **Preview chip** for Normal-level actions: shows for ~1 s. Esc / "no" cancels and types the word instead.
4. **Adaptive learning:** frequent cancellations raise that user's pause threshold.
5. Command detection runs on the **raw transcript before** AI cleanup.

### 7.3 Text cleanup (Wispr-quality)
- Remove fillers and repeats; apply self-corrections ("at 5, no, 6" → "at 6").
- Fix grammar, punctuation, capitalization; format lists and paragraphs.
- **App-aware tone:** casual (WhatsApp, Slack), professional (Gmail, Outlook), literal (code editors, terminal: no rewriting).
- **Personal dictionary:** names, product terms, code identifiers.
- **Snippets:** "insert my address", "insert my calendar link".
- Settings: Off / Light (punctuation only) / Full polish. Target: ≤ 500 ms added latency.

### 7.4 Works with every app
- Reads the screen via macOS Accessibility (buttons, fields, labels) and via a Chrome extension for web pages.
- Uses the user's existing logged-in apps and browser. **No integrations required.**
- Optional API shortcuts for a few popular services (e.g. GitHub) in V2 for speed and reliability.

### 7.5 App / website resolver ("open GitHub")
1. Installed apps match → open the app.
2. Known websites, bookmarks, history → open in the default browser (or the browser named: "open GitHub in Chrome").
3. Both match → ask once with a chip ("GitHub Desktop or github.com?") and remember the choice.
4. No match → web search.

### 7.6 Smart and multi-step tasks (V2)
- The AI planner converts a sentence into structured steps with slots, e.g. `create_repository(name: "instance")`.
- If a slot is unclear ("new repo instance"), show a chip: *"Create repo named 'instance'?"*
- Multi-step tasks show a **progress panel** ("Step 4 of 8: waiting for ChatGPT…"), with Stop at any time.
- Example: "Open Overleaf, create LaTeX from my resume, paste it, recompile and download" → open Overleaf → generate LaTeX (Sayso's own AI, or via ChatGPT if asked) → paste into the editor → click Recompile → click Download.

### 7.7 Multiple laptops side by side (V2)
- Each laptop runs its **own independent install** with its own settings. Laptops are **not linked** and may be on different networks.
- Each device has its own trigger: e.g. Laptop A = hotkey only; Laptop B = wake word "Hey Atlas".
- A device reacts **only to its own trigger**, so devices side by side never react to each other's commands.
- Per-device feature toggles: Dictation on/off, Actions on/off, Smart tasks on/off, Wake word on/off + name.
- Example: hands typing code on Laptop A; voice: "Hey Atlas, open Claude Code. Pull Jira story 918 and do the work. *[pause]* Send." → Laptop B types the prompt into Claude Code and presses Enter.

### 7.8 Safety levels

| Level | Examples | Behaviour |
|---|---|---|
| **Safe** | new line, scroll, undo, copy, open app, switch tab, create (non-destructive) | Runs instantly |
| **Normal** | send chat message, send reply, submit a simple form field | Runs after the ~1 s preview chip |
| **Risky** | email to > 3 recipients, delete, close without saving, git push, merge, publish | Always asks "Confirm?" (voice "confirm" or click) |
| **Blocked by default** | placing/changing/cancelling trades, payments, transfers, running commands in Terminal, entering passwords | Voice can type text only; never executes. Power users can unlock selected items (never payments/trades). |

**Context rules**
- Meeting app in front (Zoom/Meet/Teams) with mic active → actions off, dictation only.
- Terminal / code editor → literal dictation; "enter" in Terminal does not execute by default.
- Password fields → Sayso never types into them.

### 7.9 UI surfaces
- **Menu-bar icon** with status (idle / listening / thinking / acting).
- **Listening pill** (small floating waveform near the bottom of the screen).
- **Preview chip** and **confirm dialog**.
- **Progress panel** for multi-step tasks.
- **Settings window:** General, Triggers, Cleanup, Commands, Safety, Dictionary & Snippets, Devices, Privacy, Account.
- **Onboarding:** permissions (Microphone, Accessibility, Screen Recording later) with clear explanations, a 2-minute interactive tutorial ("say 'send' after a pause").
- **History:** last 50 utterances with what Sayso did (stored locally).

## 8. Functional requirements

### V1: "Never touch the keyboard" (MVP: BUILD_PLAN Phases 0-1)
| ID | Requirement |
|---|---|
| F1 | Push-to-talk (Fn) and tap-to-toggle dictation; command key (Fn+Shift) |
| F2 | Streaming speech-to-text with word timings |
| F3 | AI text cleanup with Off / Light / Full levels, app-aware tone |
| F4 | Insert text into any focused text field in any app |
| F5 | Pause rule + preview chip for end-of-utterance commands |
| F6 | Instant command engine with the V1 command set (below) |
| F7 | "Click *[label]*" on any visible button/link via Accessibility (native apps) and Chrome extension (web) |
| F8 | "Open *[app or website]*" via resolver, with remembered choices |
| F9 | Safety levels and context rules |
| F10 | Personal dictionary and snippets |
| F11 | Local history of last 50 utterances |
| F12 | Account sign-in, free trial, subscription |
| F13 | Settings, onboarding, auto-update, crash reporting |
| F14 | Hands-free mode with no key: "type", "send it" / "enter", "open *X*", and wake word "Sayso" (see 7.1) |
| F15 | On-device speech-to-text (e.g. WhisperKit or Parakeet on Apple Neural Engine), so dictation works offline and costs nothing per user. Cloud STT only as a fallback |
| F16 | System commands: volume up/down/mute, lock screen, dark/light mode, screenshot, play/pause music |
| F17 | "Press *[name]*" for visible buttons, menus and list items, with a "yes?" check before Risky buttons (Send, Post, Delete, Pay, Buy, Sign out) |

**V1 command set:** send · enter / new line · undo · redo · select all · copy · paste · delete that · click *X* · press *X* · open *X* · new tab · close tab · switch to *X* · scroll up/down · volume · lock screen · dark/light mode · screenshot · stop / cancel

> **Scope note:** F14-F17 come from the Infina teardown. They are table stakes, so they are part of V1.

### V2: "Smart tasks" (BUILD_PLAN Phase 3)
| ID | Requirement |
|---|---|
| F20 | AI planner for smart tasks with slot extraction and clarification chips |
| F21 | Multi-step task runner with progress panel and Stop |
| F22 | Per-device wake word (on-device), renameable; per-device feature toggles |
| F23 | Optional API connectors for 3-5 popular services (GitHub first) |
| F24 | Task templates ("prompt Claude Code with…", "reply to the latest email from…") |
| F25 | Voice confirmation ("confirm" / "cancel") for Risky actions |
| F26 | Prompt expansion: a short spoken idea becomes a complete prompt for AI tools; user can preview and edit before it is sent |
| F27 | Agent manager by voice: "which agents are done?", "tell the second terminal to run the tests" (for Claude Code, Codex, Cursor and similar) |
| F28 | Voice read-back: short spoken summaries of what an agent or app replied (text-to-speech) |

### V3: "Anything"
- Screenshot + vision fallback for apps without accessible labels (also "click the blue button" when a button has no name).
- Learning user habits (frequent commands, preferred apps).
- Windows version.
- Phone as a remote mic for the laptop.

### V4: "Languages"
- **Only after English works end to end and is stable.** Decision (13 Nov 2026): English first.
- Speak Telugu, Hindi, Hinglish and other languages → clean English text; later, commands in those languages.

## 9. Non-functional requirements

| Area | Target |
|---|---|
| Instant command latency (end of speech → action) | p50 < 300 ms, p95 < 600 ms |
| Dictation latency (end of speech → text inserted) | p50 < 700 ms with cleanup |
| Command accuracy | > 98% correct on the V1 command set |
| False triggers (text treated as command) | < 1 per 500 utterances |
| Crash-free sessions | > 99.5% |
| Idle CPU / memory | < 2% CPU, < 300 MB RAM (Electron) |
| Privacy | Audio not stored by default; history stored locally; no screen content leaves the device except for smart tasks the user starts |
| Platform | macOS 14+ (Apple Silicon first) |

## 10. Privacy and trust
- Speech-to-text runs **on the device**: audio never leaves the Mac and is not stored.
- Wake-word detection is **on-device only**; nothing is sent until the wake word is heard.
- Screen content is read **locally**; it is sent to the AI only for smart tasks, and only the minimum needed (labels, not full screenshots, in V1-V2).
- History, dictionary and resolver choices live in a **local database**; settings sync is opt-in.
- Sayso **never types into password fields** and never executes Blocked actions.
- Clear privacy page and per-feature toggles.

## 11. Business model
- **Launch phase (free first):** everything is free for early users so we can grow users and daily usage fast. Paid plans start after the trigger below. Users are told the price plan up front, so no one is surprised later.
- **Paid-start trigger:** start charging when the beta shows Day-14 retention ≥ 40% (see section 13). TBD: confirm the trigger and date.
- **Free (long term):** dictation (push-to-talk) with a larger weekly word limit than before, plus V1 commands. Exact limit TBD (was 2,000 words/week).
- **Pro: $99/year overseas:** unlimited hands-free dictation, all commands, smart tasks, multiple devices.
- **India pricing:** ₹399/month (regional pricing).
- **Team (later):** shared dictionary/snippets, admin, billing.
- 14-day Pro trial on sign-up.

## 12. Go-to-market
1. **Founder-led beta:** 20-30 heavy typers (developers, founders) from personal network and X/LinkedIn.
2. **Demo videos:** "I didn't touch my keyboard for a day", "Two laptops, one voice", "Claude Code by voice".
3. **Developer communities:** Hacker News (Show HN), Reddit, Product Hunt launch.
4. **Referral:** give 1 month Pro for each friend who joins.
5. **Waitlist landing page** before launch to collect demand.

## 13. Success metrics
| Metric | Target for beta |
|---|---|
| **Day-14 retention (still using daily)** | ≥ 40% (main signal) |
| Actions per active user per day | ≥ 20 |
| Words dictated per active user per day | ≥ 1,000 |
| Preview-chip cancel rate | < 5% |
| Trial → paid conversion | ≥ 10% |
| NPS | ≥ 40 |

## 14. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Wispr / Apple / Microsoft add actions | Speed of shipping; best-in-class smoothness; multi-laptop; safety design; community |
| Misheard command causes damage | Pause rule, preview chip, safety levels, confirmations, Blocked list, undo |
| Multi-step tasks unreliable | Keep in V2, progress panel, Stop, API connectors for top services |
| macOS permission friction | Guided onboarding explaining each permission |
| AI/transcription cost per user | Fast/small models, local command engine (no AI for instant commands), caching, usage limits on Free |
| Apps without accessibility labels | Chrome extension for web; vision fallback in V3 |

## 15. Roadmap and milestones
Phases and steps live in [BUILD_PLAN.md](BUILD_PLAN.md) §3:
| Phase | Goal |
|---|---|
| 0. Prototype | Dictate and send on our own Mac without the keyboard |
| 1. Match Infina | Hands-free "type / send it / open", press by name, position navigation, system commands |
| 2. First real users | Backend on Cloudflare, Google sign-in, signed app, website, 20-30 beta users |
| 3. Beyond Infina | Prompt expansion, smart multi-step tasks, agent manager, read-back |
| 4. Money and launch | Stripe, start charging at the retention target, public launch |

## 16. Open questions
- Final product name and wake-word default (shortlist: Vaani, Kairo).
- WhisperKit model size: benchmark latency, accuracy, battery and RAM in Phase 0. Cloud STT stays as a fallback only.
- Pricing: **decided (13 Nov 2026): overseas Pro at $99/year, India ₹399/month; free tier with a larger weekly word limit instead of unlimited push-to-talk.** This is a hybrid of Infina's model.
- Free tier word limit: **TBD**. Pick the number (current draft: higher than 2,000 words/week).
- Which 3-5 services get API connectors first (GitHub confirmed; others TBD by beta usage).
