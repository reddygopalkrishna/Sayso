# Plan: match and then beat Infina (reliable first)

Written 15 Nov 2026. Source of the gaps: the Screen Recording of 15 Nov 11:49 (6.9 min, audio transcribed), the Infina app (v1.45.21) and our code. Status of each stage is kept here and in docs/STATUS.md.

## Why the current build fails in real use
1. **Clicks miss in Chrome and Electron apps (ChatGPT, Claude, Slack, WhatsApp).** Those apps build their accessibility tree only when asked. We never asked, so "click Profile" searched an almost empty tree. **Fixed in Stage B (uncommitted).**
2. **The click search looked at the whole app, in breadth-first order, within 300 ms.** A big page could be cut off before the right button. **Fixed in Stage B: the focused window is searched first.**
3. **One command per sentence.** "Open Chrome, new tab, search GCP" is chained now (Stage C, step 1, uncommitted).
4. **No feedback on a miss.** The user repeats the command ("go to search" said six times in the recording). Done in Stage B: the pill shows a short message and the first click retries once.
5. **Hands-free needs a wake word and an always-on listener.** Not built (Stage C).
6. **Messaging recipe (WhatsApp: open chat, type, send, close) is not built.** Stage C.

## Stages
- **Stage A: measure.** Test matrix below. Each run records pass, wrong target, not found, or slow (over 1 s), plus the app name.
- **Stage B: make single commands reliable.** Done: web accessibility on, focused window first, short not-found message in the pill, one retry on the first click in a new web app. Still to test by hand in Chrome.
- **Stage C: Phase 1 features in order.** Status: step 1 (chained commands) built 15 Nov, not yet committed or tried live. Multi-command sentences with a check after each step (stop at first failure); press by name with a "yes?" check for risky buttons; position navigation ("third email", "go back"); hands-free with wake word; the WhatsApp recipe; system commands.
- **Stage D: quick wins.** Snippets, per-app Default/Chill style, choice of hold key, Settings window.
- **Stage E: demos** of real tasks for posting.

## Stage A: command test matrix (run by hand; Kesava or the founder)
Mark each row: pass / wrong target / not found / slow. Use the same Mac and the same apps every time.

| App | Say | Expect |
|---|---|---|
| Chrome | open Chrome | Chrome opens or comes forward |
| Chrome | new tab | new tab |
| Chrome | close tab | tab closes |
| Chrome | click Sign in (on a page with it) | button pressed |
| Google Cloud console | click Profile | profile menu opens |
| ChatGPT app | open new chat | new chat |
| ChatGPT app | type how is the day today, send it | text typed and sent |
| Claude app | click Search | search opens |
| WhatsApp | open WhatsApp | app opens |
| System Settings | open settings, click Software Update | Software Update opens |
| Finder | go back | back |
| Any app | scroll down | scrolls |

Record the time from the end of the phrase to the result. Target: under 1 s for clicks.

## Automated tests to add with Stage B
- `LabelMatch` table tests for the new search order (focused window before root).
- A helper test for `pressElement` with the not-found error code (exists in the protocol fixtures).
- Live check: `printf` a `pressElement` line to the helper with Claude frontmost; expect `done`. (Done 15 Nov for "Search" in Claude.)

## Decisions still open
1. Stage order: A and B first (recommended), then C.
2. Always-on listening for hands-free: local only, with a visible indicator, wake word only.
3. Screen understanding: start with on-device text recognition (Apple OCR) for apps without accessibility; cloud vision only with approval.
4. Multi-step tasks in Phase 3 (a planner with a Stop button) stay out of Stage C.
