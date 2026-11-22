# Sayso: how to explain it (demo and Q&A)

Say it like a person, in this order: problem → idea → demo → how it works → why it is different → what is next. About 4 minutes plus questions.

## 1. The problem (30 seconds)

"We spend our day typing and clicking: messages, emails, prompts to AI tools, forms. Voice dictation exists, but it has two gaps. It types what you said, word for word, with 'um' and no punctuation. And it can only type: it cannot open an app, click a button, or send the message. So you still go back to the keyboard and mouse. For people who think in Indian English, mix names and tech words, or just want their hands free, it is worse: tools mishear 'Priya', 'Claude Code', 'AWS'."

## 2. The idea (30 seconds)

"Sayso is a voice layer for the Mac. You speak and the computer does two things: it **writes clean text** where your cursor is, and it **does actions**: open apps, new tab, click Sign in, send the message, start a draft. No keyboard needed."

One line: **Speak, and the computer types clean text and does things.**

## 3. The demo (2 minutes). Two flows

**Flow A: voice does things (hands-free; double-tap Fn)**
1. "Open Chrome" → "New tab" → "type AWS hit enter" (types it and presses Enter).
2. "Open the first result" → "click Sign in" → "fill in my details" (name, email, phone; passwords are never touched).
3. "Open WhatsApp" → "send hi to <name> on WhatsApp" (shows a short chip you can cancel, then sends).
4. "New email to <name> at gmail dot com" → a Gmail draft opens; "type …", "next field". It never sends by itself.

**Flow B: voice writes (hold Fn)**
1. Hold Fn: "um tell Priya to meet me in Hyderabad at five" → `Tell Priya to meet me in Hyderabad at 5.`
2. In ChatGPT or Claude: "start typing" and speak a whole story in several sentences (pill shows Typing mode), then "send it".
3. "New chat" starts a fresh conversation.

Keep demo lines to rows that passed 3 times in `docs/STABILITY_CHECK.md`. Leave out anything that did not.

## 4. How it works (the human version)

1. **You speak.** A small native Mac helper (Swift) records the mic and cuts speech from silence.
2. **It is turned into text on your Mac.** A speech model (WhisperKit, large-v3 turbo) runs on the device, so audio stays on the machine by default. An optional setting sends audio to OpenAI Whisper for better accuracy.
3. **It decides: is this a command or dictation?** Short fixed phrases ("new tab", "click Sign in", "send it") are matched by a rule table with no AI call, so they run fast. Anything else is dictation.
4. **Dictation is cleaned up.** An AI model removes fillers, adds punctuation, fixes your names and tech words from your own dictionary (Claude Code, Codex, ChatGPT, Priya).
5. **It acts.** The helper types the text or presses keys and clicks buttons using the macOS accessibility system.
6. **Safety first.** A safety gate checks every action against the app in front: it refuses password fields and meeting apps (Zoom, Teams), shows a short cancel chip before risky or sending actions, and asks before things like Delete or Pay. Gmail drafts are never sent.

## 5. Tech stack (say this if asked)

| Part | What |
|---|---|
| App | Electron + TypeScript (main process logic, React renderer with a locked-down preload bridge) |
| Mac helper | Swift: microphone, speech cutting, keyboard, accessibility clicks; talks to the app over JSON lines |
| Speech to text | WhisperKit (large-v3 turbo) on device; optional OpenAI whisper-1 |
| Cleanup AI | Cloud model (Gemini, with Groq and OpenAI options), only for dictation, never for instant commands |
| Commands | One file, `commands.json`, a grammar with phrases, safety level and blocked apps |
| Tests | Vitest (about 1800 tests, including every command × every context) and Swift Testing |
| Keys | Kept in git-ignored `.env` or the OS keychain; never reach the screen layer |

## 6. Why it is different (3 points)

- **Writes and acts**, not only types.
- **Fast and private where it counts:** instant commands never call an AI model; speech runs on the device by default.
- **Built for how Indians actually speak:** Indian names, mixed English and tech words, a personal dictionary.

## 7. Likely questions and honest answers

- **"Did you train a model?"** No. We use open-source and hosted speech models and add our own layer on top: command rules, safety, a personal dictionary, app-specific actions. The product is the layer, not a new model.
- **"Is it accurate?"** Tested end to end with a computer voice on real apps (Chrome, WhatsApp, ChatGPT, Claude). Accuracy with real voices and Indian-English speakers is not measured yet. It is our next step.
- **"What breaks?"** Very short phrases ("send it") are sometimes missed (about 2 in 15 in our tests); the speech model takes a while to load after an update; the mic must be reasonably close. Gmail by voice and "new chat" are unit-tested, still being tried by voice.
- **"What about Windows?"** Mac first; the product logic is TypeScript and only the helper is Mac-specific, so Windows needs a new helper.
- **"Privacy?"** Audio stays on the Mac by default. Cloud is used only for text cleanup, and for speech only if the user turns it on.
- **"What is next?"** Real-voice accuracy testing, wake word and more apps (email, calendar), a Windows helper, learning the user's pause time.

## 8. Closing line

"Sayso is what voice on a computer should have been: you talk, it writes it properly and gets things done. Today it works on Mac with Chrome, WhatsApp, Slack, ChatGPT, Claude and Gmail drafts, and everything it does is something you can cancel."
