# Sayso status

Update this file at the end of every step. Keep it under 80 lines.

## Done
- Phase 0, step 1: monorepo, Electron scaffold, Swift helper stdio protocol
- Phase 0, step 2: hold Fn to dictate with on-device WhisperKit
- Phase 0, step 3: AI text cleanup behind LLMProvider (Gemini)
- Phase 0, step 4: pause rule for send, enter and new line
- Phase 0, step 5: SafetyGate, preview chip (Esc cancels), never type into password fields
- Phase 0, step 6: instant commands (hold Fn+Shift): undo, redo, select all, copy, paste, delete that, click label, open app or site, new tab, close tab, switch app, scroll, cancel
- Phase 0, step 7: local SQLite (history, personal dictionary, remembered "open" choices); Home / History / Dictionary tabs; Microphone + Accessibility onboarding
- **Phase 0 is feature complete.** Remaining for its "done when": use it for real (a Slack message and a Claude prompt without the keyboard) and fix what that shows.

## In progress
- Nothing.

## Next
- Hand-test the open items in CHANGELOG "Pending" (password field in Chrome, scroll direction, onboarding buttons, Settings links), then daily use.
- Phase 1 (BUILD_PLAN §3): hands-free mode and wake word; press-by-name with a "yes?" check for risky buttons (needs the confirm dialog); position navigation ("open the third email", "go back"); system commands (volume, lock, dark mode, screenshot, music); a real settings window; demo videos.

## Later steps (from BUILD_PLAN §3)
- Phase 2: first real users (backend, accounts, signing). Do not start before Phase 1.

## Open decisions
- Product name (shortlist: Vaani, Kairo). Code uses `sayso` until chosen.
- Free tier word limit.
- **SQLite driver:** the plan says better-sqlite3; the code uses Node's built-in `node:sqlite` behind `core/storage/db.ts`. Reason: Electron 45 runs Node 24 (ABI 150) and the test runner Node 26 (ABI 147), so one compiled better-sqlite3 cannot serve both, and `node:sqlite` has nothing to compile. Switching back means rewriting that one file. Confirm or revert.
- Git: the repo has commits, but CHANGELOG.md is only updated when we commit (see CLAUDE.md).

## Known issues
- Dev runs: macOS permissions go to the launching app (Terminal, iTerm or the editor), not to "Sayso".
- Deferred on purpose: 300 ms mic pre-roll, smart spacing between utterances, non-QWERTY ⌘V.
- Password-field detection and "click X" are untested in Chrome and Electron apps, which hide their accessibility tree until asked (see CHANGELOG Pending); Risky actions have no confirm dialog yet.
