---
name: add-voice-command
description: Add or change a voice command (phrases, action, safety level, blocked apps) in packages/command-grammar/commands.json with matching tests. Use whenever a new command is requested, e.g. "add 'go back'", "support 'open the third email'", "make 'delete' risky".
---

# Add or change a voice command

Commands are data, not code. `packages/command-grammar/commands.json` is the single source of truth.

## Steps
1. Read the entry format in `docs/TECHNICAL_ARCHITECTURE.md` §5.2 and the safety table in `docs/PRD.md` §7.8. Do not read other docs.
2. Grep `commands.json` for an existing command with similar phrases; extend it rather than duplicating.
3. Add or edit the entry:
   - `id`: kebab or snake case, unique.
   - `phrases`: the natural ways people say it (3-6), plus position forms if relevant ("open the {ordinal} email").
   - `endOfUtteranceOnly`: true for commands that end dictation ("send", "enter").
   - `action`: an existing `Action` type from §5.1. Add a new action type only if none fits, and then also add it to the helper protocol.
   - `safety`: safe / normal / risky / blocked. When unsure, pick the stricter level.
   - `blockedIn`: bundle IDs where it must never run (Terminal for "enter", meeting apps for actions).
4. Tests (Vitest), all required:
   - The phrases match with the expected args.
   - Near-miss text does **not** match (e.g. "send me a flower" is text).
   - SafetyGate result in the relevant contexts (chat app, Mail, Terminal, password field, meeting app).
5. Run tests through the `test-runner` agent.
6. Report the command, its safety level and the test count in 2-3 lines.
