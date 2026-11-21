---
name: sayso-testing
description: Test conventions for Sayso (Vitest in TypeScript, SwiftPM tests for the helper, fixtures, required cases for the pause rule, commands and SafetyGate). Use when writing or changing any test.
---

# Sayso testing

## Commands
- All TS: `pnpm test`. One file: `pnpm --filter desktop exec vitest run <path> -t "<name>"`.
- Helper: `pnpm helper:test` (not bare `swift test`).
- Always also: `pnpm typecheck`, `pnpm lint`.

## Conventions
- Tests sit next to the code: `Foo.ts` → `Foo.test.ts`.
- Table-driven: `it.each([...])` with a name per row.
- Word timings are synthetic: `{text, start, end}` in ms. Build them with a helper, do not hand-write long arrays.
- Shared messages: add a fixture under `packages/helper-protocol/fixtures/`. Both Vitest and Swift decode it.
- Fakes, not real OS calls: the helper core takes service protocols; test with fakes.

## Required cases
- **Pause rule (IntentRouter):** "send me a flower" → all text; "reply send" with no pause → text; "… [700 ms] send" → command; "new line" uses the gap before "new"; punctuation ignored.
- **Commands (CommandEngine):** each phrase matches with the right args; near-misses do not match; position args ("third email").
- **SafetyGate:** each command × context: chat app, Mail, Terminal (Enter never runs), password field (never typed), meeting app in front (actions off).
- **Helper protocol:** every message has a fixture; schema is regenerated (a test fails if stale).

## Rules
- Never weaken or delete a failing test to get green. Fix the code, or say why the test is wrong.
- Report only failures in full; summarise passes as a count.
