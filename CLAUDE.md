# Sayso

Voice dictation and actions for the desktop: speak, and the computer types clean text and does actions (send, click, open apps) without the keyboard. Mac first; Windows later. Electron + TypeScript app, Swift helper for macOS calls, WhisperKit speech on device, Gemini for cleanup.

## Start every session here (in this order, nothing else up front)
1. `docs/STATUS.md`: what is done, what is next.
2. `docs/REPO_MAP.md`: layout, commands, non-obvious facts.
3. Only the doc section the current step needs (see table). Do not read whole docs.

| Need | Read |
|---|---|
| Step list for the current phase | `docs/BUILD_PLAN.md` §3 (wins if anything disagrees) |
| Modules, action model, grammar, pause rule | `docs/TECHNICAL_ARCHITECTURE.md` §5, §5.1, §5.2, §5.3 |
| Behaviour: triggers, safety, UI | `docs/PRD.md` §7.1, §7.8, §7.9 |
| Test rules and fixtures | `sayso-testing` skill |
| Phase 1 parity with Infina | `docs/COMPETITOR_INFINA.md` (only then) |

## Rules
- **Scope:** one BUILD_PLAN step per session (`build-step` skill). Ask before adding anything out of scope.
- **Keys:** Gemini and any speech keys live in git-ignored `.env` or `safeStorage`. Never commit keys. Never expose keys to the renderer.
- **Instant commands** stay under 300 ms and never call an AI model.
- **Architecture:** product logic in TypeScript; the Swift helper only does OS calls. Renderer: `contextIsolation: true`, `nodeIntegration: false`, preload IPC only.
- **Tests:** table-driven unit tests for the pause rule, command matching and SafetyGate (every command × context). Run them through the `test-runner` agent.
- **Voice commands:** use the `add-voice-command` skill; commands live in `packages/command-grammar/commands.json`.
- **No AI attribution anywhere** (user's rule): no `Co-Authored-By: Claude`, no "Generated with Claude Code", no Claude or Anthropic name in commits, PRs, code, docs or package metadata. Commits are the user's only.
- **CHANGELOG:** after every commit, add an entry to `CHANGELOG.md` under today's date (IST): commit hash, what changed, why, in plain words. Deferred or broken items go under **Pending (later)**; unfinished work under **In progress**. Remove items once done.
- **Token economy:** prefer Grep and line ranges to whole-file reads; keep command output short (failures only); send broad searches to an Explore subagent.

## Commands
Full list in `docs/REPO_MAP.md`. Common: `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm helper:build`, `pnpm helper:test`.
