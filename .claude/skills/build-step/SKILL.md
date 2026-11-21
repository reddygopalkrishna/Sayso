---
name: build-step
description: Implement one step of docs/BUILD_PLAN.md end to end (code, tests, CLAUDE.md update) with production quality. Use when the user says "start Phase N", "next step", "build step X", or asks to continue the build plan.
---

# Build one plan step

Goal: finish exactly one step from `docs/BUILD_PLAN.md` §3, production quality, then stop.

## 1. Pick the step
- Read only `docs/BUILD_PLAN.md` §3 and the **Repo state** section of `CLAUDE.md`.
- The step is the one the user named, or the first step of the current phase not marked done in CLAUDE.md.
- State the step in one line before starting.

## 2. Load only what this step needs
- Use the doc index in `CLAUDE.md` to read just the relevant sections (for example §5.3 for the pause rule).
- Grep the code for existing types before creating new ones; reuse `packages/shared`, `packages/helper-protocol`, `packages/command-grammar`.

## 3. Plan briefly
List the files to create or change and the tests to add (5-10 lines). Ask the user only if the step's scope is genuinely unclear or something is out of scope per CLAUDE.md.

## 4. Implement
- TypeScript strict, no `any`; validate external data with zod.
- Product logic in TypeScript; the Swift helper only does OS calls.
- Keys never in the renderer or in git.
- Instant commands never call AI.
- Small, focused files; no speculative features beyond this step.

## 5. Test
- Write unit tests for the logic in this step (table-driven where possible).
- Run typecheck, lint and tests through the `test-runner` agent. Fix until green.
- If the step changes something a human must check on a real Mac (mic, Accessibility, pasting into an app), say exactly what to try.

## 6. Finish
- Update `CLAUDE.md`: **Repo state** (mark the step done), **Commands** (real commands once they exist).
- If git is set up, commit with a clear message for this one step.
- Report in 3-5 lines: what was built, test results, what the user should try by hand, and the next step. Suggest starting a new session for the next step.
