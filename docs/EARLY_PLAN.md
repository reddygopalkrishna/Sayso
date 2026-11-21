> **Superseded.** Early draft kept for reference only. The current plan is [BUILD_PLAN.md](BUILD_PLAN.md) (stack and phases) and [PRD.md](PRD.md). Timelines and the Claude API choice below are out of date.

# Voice Actions: product and build plan

*Early draft, 9 Nov 2026. Superseded by PRD.md, TECHNICAL_ARCHITECTURE.md and ARCHITECTURE_FLOW.md; kept for reference.*

## 1. The problem

Voice dictation tools (like Wispr Flow) type what you say, but your hands still have to go back to the keyboard and mouse to press Enter, click Send, open apps, or switch windows. Every action breaks the flow.

**Our product:** speak, and the computer both **types and acts**. Dictation plus actions, smooth and instant, without touching the keyboard.

## 2. First users

- **Start with:** people who type and click all day on a Mac: developers (including people who prompt Claude Code / Cursor), founders, sales and support people, recruiters.
- **Later:** people who work on two or more laptops at once, Indian languages / Hinglish users, and accessibility users (wrist pain, motor impairment, low vision).

## 3. Key use cases

1. **Dictate and send:** "Hey, can we meet at 5 tomorrow? *[pause]* Send." Types the message and sends it.
2. **Instant commands:** "Click Recompile", "open GitHub", "new tab", "scroll down", "undo".
3. **Smart tasks:** "In GitHub, create a new repo called instance." "Open Claude Code and ask it to pull Jira story 918 and do the work. *[pause]* Send."
4. **Multi-step tasks:** "Open Overleaf, make LaTeX from my resume, paste it, recompile and download."
5. **Two or more laptops side by side:** each laptop runs its own install, with its own settings and its own trigger. Example: your hands work on Laptop A while you speak to Laptop B ("Hey Atlas, create a repo…"), and Laptop B does the work on its own. The laptops are not linked and can be on different networks.

## 4. How it works for the user

### Works with every app, no connections needed
The tool sees and clicks like a human. It reads the buttons and fields on screen (macOS Accessibility, plus a Chrome extension for websites) and uses the user's already logged-in apps and browser. APIs for a few popular services (e.g. GitHub) are an optional speed-up later, never required.

### Clean, polished text (like Wispr)
After speech-to-text, a fast AI cleanup step:
- Removes filler words ("um", "like", repeats) and handles self-corrections ("at 5, no, 6" → "at 6").
- Fixes grammar, punctuation and capitals; formats lists, emails and paragraphs.
- Matches the app's tone: casual in WhatsApp/Slack, professional in Gmail, exact in code editors.
- Translates: speak Telugu, Hindi or Hinglish, get clean English text (V4, later).
- Personal dictionary for names, product terms and code words.
- User setting: Off / Light (punctuation only) / Full polish.
- Command detection runs on the raw transcript *before* cleanup, so polishing never changes or hides a command.
- Target: under 500 ms added, using a small fast model with streaming.

### Telling text apart from commands
1. **Push-to-talk:** it listens only while the hotkey (Fn) is held. Nothing is heard otherwise.
2. **Pause rule:** a command word like "Send" counts only if it is said alone after a pause (about 0.6 s) at the end. "Send me a flower" and "Reply send" stay as text.
3. **Command key:** a second hotkey (e.g. Fn + Shift) where everything said is a command.
4. **Preview chip:** a small chip such as "⏎ Send" shows for about 1 second before the action. Esc or "no" cancels it and types the word instead.
5. **Learns per user:** if someone often cancels, their pause threshold goes up.

### Multiple laptops: each one knows "this is for me"
- Each install has its own settings: dictation on/off, actions on/off, wake word on/off.
- Each laptop has its own trigger: hotkey on one, a unique wake word on another ("Hey Atlas", "Hey Nova").
- A laptop only reacts to its own trigger, so laptops side by side never react to each other.
- The wake word is detected on the laptop itself, and nothing is processed until it is heard.

### Safety levels

| Level | Examples | Behaviour |
|---|---|---|
| Safe | new line, scroll, undo, open app, switch tab | Runs instantly |
| Normal | send chat message, send reply | Runs after the 1 s preview chip |
| Risky | email to many people, delete, close without saving, git push | Always asks "Confirm?" |
| Blocked by default | placing trades or payments, running commands in Terminal | Voice can type text but never executes; power users can unlock some items |

Context rules: when a meeting app (Zoom/Meet/Teams) is in front with the mic on, actions are off. In Terminal it types only and never presses Enter by default.

## 5. Versions

| Version | Scope | Time (2-3 devs) |
|---|---|---|
| **V1: Never touch the keyboard** | Mac menu-bar app; dictation with AI grammar cleanup; pause rule; preview chip; about 15 instant commands; click any button by name; open apps and websites; safety levels | 3-4 weeks |
| **V2: Smart tasks** | AI turns sentences into actions ("create repo called instance"); multi-step tasks with a progress panel; wake word per device for multi-laptop use; optional APIs for 3-5 popular services | +4-6 weeks |
| **V3: Anything** | Screenshot + vision fallback for any app; learning habits; Windows | After V1-V2 are loved |
| **V4: Languages** | Speak Telugu, Hindi, Hinglish and other languages; get clean English text | Later |

## 6. Architecture (Mac first)

```
Mic ──► Audio capture ──► Speech-to-text (with word timings)
                               │
                               ▼
                       Intent router
          ┌───────────────┼────────────────┐
          ▼               ▼                ▼
     Dictation      Instant command     Smart task
     (type text)    (rule engine,       (LLM planner,
                     no AI, <300 ms)     tool calls)
          │               │                │
          └───────► Action layer ◄─────────┘
                 keys · clicks · apps · browser
                         │
                   Safety gate (levels, preview chip, confirm)
```

| Part | Technology |
|---|---|
| App | Native Swift menu-bar app (SwiftUI) |
| Audio capture | AVAudioEngine |
| Speech-to-text | Start with a fast cloud STT that returns word timings; add on-device (whisper.cpp / Apple speech APIs) as an option |
| Wake word (V2) | On-device wake-word engine (e.g. openWakeWord or Picovoice Porcupine) |
| Instant commands | Our own small rule/grammar engine: fast, no AI |
| Smart tasks | Claude API with tool use (claude-haiku-5-5 for speed, claude-sonnet-5-5 for harder plans) |
| Typing text | Paste via clipboard (restoring the old clipboard), or set the field value via Accessibility |
| Keys and clicks | CGEvent for keyboard and mouse; AXUIElement to find and press buttons by label |
| Opening apps | NSWorkspace; resolver = installed apps → known sites / bookmarks → ask once and remember → Google search |
| Websites | Chrome extension (native messaging) that reads the page and clicks elements |
| Vision fallback (V3) | Screenshot + a computer-use model |
| Mac permissions | Microphone, Accessibility, Screen Recording (for the fallback) |

## 7. V1 command list (first 15)

send · enter / new line · undo · redo · select all · copy · paste · delete that · click *[button name]* · open *[app or website]* · new tab · close tab · switch to *[app]* · scroll up / down · stop / cancel

## 8. V1 build plan

| Week | Work |
|---|---|
| 1 | Menu-bar app, permissions, hotkey, audio, speech-to-text, text insertion in any app |
| 2 | Pause rule, preview chip, instant command engine, the 15 commands, safety levels |
| 3 | "Click [button]" via Accessibility, app/website resolver, Chrome extension basics |
| 4 | Polish speed (<300 ms for commands), onboarding, settings, crash reporting; give to first 20-30 users |

## 9. How we know it works

Give V1 to 20-30 heavy typers and track for 2 weeks:
- **Main signal:** at least 40% still using it daily after 2 weeks.
- Commands per user per day, and how often the preview chip is cancelled (misheard commands).
- Would they pay $10-15/month? Ask for pre-payment.

## 10. Risks

- **Wispr Flow (or Apple/Microsoft) adds actions.** Answer: win on smoothness, multi-laptop use, safety and speed; move fast.
- **Misheard commands do damage.** Answer: pause rule, preview chip, safety levels, confirmations.
- **Multi-step tasks are slow or unreliable.** Answer: keep them in V2, show progress, and use APIs for top services where it helps.
- **Mac permissions scare users.** Answer: clear onboarding that explains each permission.
