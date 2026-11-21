# Sayso status

Update this file at the end of every step. Keep it under 80 lines.

## Done
- Phase 0, step 1: monorepo, Electron scaffold, Swift helper stdio protocol
- Phase 0, step 2: hold Fn to dictate with on-device WhisperKit
- Phase 0, step 3: AI text cleanup behind LLMProvider (Gemini)
- Phase 0, step 4: pause rule for send, enter and new line
- Phase 0, step 5: SafetyGate, preview chip (Esc cancels), never type into password fields
- Phase 0, step 6: instant commands (hold Fn+Shift): undo, redo, select all, copy, paste, delete that, click label, open app or site, new tab, close tab, switch app, scroll, cancel

## In progress
- Nothing.

## Next
- Phase 0, step 7: local SQLite (better-sqlite3) for history, dictionary and resolver memory (schema in TECHNICAL_ARCHITECTURE §8.1); Microphone + Accessibility onboarding. Then the Phase 0 "done when": write and send a Slack message and a Claude prompt without touching the keyboard.

## Later steps (from BUILD_PLAN §3)
- Phase 0, step 7: local SQLite history and dictionary; Mic + Accessibility onboarding.

## Open decisions
- Product name (shortlist: Vaani, Kairo). Code uses `sayso` until chosen.
- Free tier word limit.
- Git: the repo has commits, but CHANGELOG.md is only updated when we commit (see CLAUDE.md).

## Known issues
- Dev runs: macOS permissions go to the launching app (Terminal, iTerm or the editor), not to "Sayso".
- Deferred on purpose: 300 ms mic pre-roll, smart spacing between utterances, non-QWERTY ⌘V.
- Password-field detection and "click X" are untested in Chrome and Electron apps, which hide their accessibility tree until asked (see CHANGELOG Pending); Risky actions have no confirm dialog yet.
