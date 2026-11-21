---
name: build-step
description: Implement one step of docs/BUILD_PLAN.md (code, tests, STATUS update, CHANGELOG on commit). Use for "start Phase N", "next step", or "build step X".
---

# Build one plan step

1. **Find the step:** `docs/STATUS.md` "Next". State it in one line.
2. **Load only what it needs:** `docs/REPO_MAP.md`, then the BUILD_PLAN §3 step and the matching TECHNICAL_ARCHITECTURE/PRD section. Grep before reading files.
3. **Plan in 5-10 lines:** files to change, tests to add. Ask only if scope is unclear.
4. **Implement:** strict TypeScript, no `any`, zod at external boundaries, product logic in TS, helper stays thin, no features beyond the step.
5. **Test:** unit tests per the `sayso-testing` skill; run via the `test-runner` agent until green.
6. **Finish:** update `docs/STATUS.md` (move the step to Done, set Next) and `docs/REPO_MAP.md` if layout or commands changed. Commit only when asked; then add the CHANGELOG entry (CLAUDE.md rules).
7. **Report in 3-5 lines:** what changed, test result, what the user should try on the Mac, and the next step. Suggest a new session for the next step.
