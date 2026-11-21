# Sayso status

Update this file at the end of every step. Keep it under 80 lines.

## Done
- Phase 0, step 1: monorepo, Electron scaffold, Swift helper stdio protocol
- Phase 0, step 2: hold Fn to dictate with on-device WhisperKit
- Phase 0, step 3: AI text cleanup behind LLMProvider (Gemini)
- Phase 0, step 4: pause rule for send, enter and new line

## In progress
- Nothing.

## Next
- Phase 0, step 5: preview chip (~1 s, Esc cancels), SafetyGate (Safe / Normal / Risky / Blocked), never type into password fields.
  - Replace the `blockedIn` check in `UtterancePipeline.deliver` with the SafetyGate.

## Later steps (from BUILD_PLAN §3)
- Phase 0, step 6: instant commands without AI (send, undo, copy, paste, click label, open app or site, new tab, switch app, scroll).
- Phase 0, step 7: local SQLite history and dictionary; Mic + Accessibility onboarding.

## Open decisions
- Product name (shortlist: Vaani, Kairo). Code uses `sayso` until chosen.
- Free tier word limit.
- Git: the repo has commits, but CHANGELOG.md is only updated when we commit (see CLAUDE.md).

## Known issues
- Dev runs: macOS permissions go to the launching app (Terminal, iTerm or the editor), not to "Sayso".
- Deferred on purpose: 300 ms mic pre-roll, smart spacing between utterances, non-QWERTY ⌘V.
