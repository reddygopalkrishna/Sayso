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
- **Stage C: Phase 1 features in order.** Done and committed: chained commands (bb883f9), go back / go forward (b497890), "yes?" before risky buttons (9f08c8b), take a screenshot and lock screen (4d6c97f). Still to do: volume and dark mode (media keys or AppleScript in the helper), position commands ("open the third email"), the WhatsApp recipe, hands-free with the wake word. None of these is tried live yet.
- **Stage D: quick wins.** Built (committed 21 Nov): snippets and a Settings tab (pause, preview time, cleanup level, skip-AI, history size). Built, not committed or tried live: Style (Default or Chill) everywhere and per app, in the Settings tab. Still to do: choice of hold key (needs a helper change).
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

## Design: "yes?" before risky buttons (built 16 Nov, not committed or tried live)
Today a risky button ("Pay", "Delete", "Sign out", "Publish") is refused. Infina asks first. Proposed:
1. Say "click Pay" in command mode. Sayso does not press it. It shows a prompt in the pill: "Say yes to press “Pay” (8 s), or Esc".
2. Say "yes" (or "yes do it") within 8 seconds. Sayso presses it. Esc, any other command, or the timeout cancels. Nothing runs by silence.
3. Before pressing, Sayso reads the app and window again. If the app changed, it cancels and says why.
4. Nothing is remembered between sessions. Each risky press needs its own "yes".

Needs: a pending-action state in the pipeline (not just one utterance), a new "yes" command, a prompt the pill can show (a new dictation phase), and tests for timeout, Esc, app change and a second command in between.

## Dropped for now: Chrome extension
The original build plan (Phase 3, item 5) listed a Chrome extension for reliable clicks in web pages. Decided 15 Nov 2026: not needed. Infina does not use one; Chrome and Electron apps now expose their pages to Accessibility (Stage B); extensions add a second code path, store review and page-reading permission. Revisit only if Stage A still shows web clicks failing after the fix.

Multi-step tasks use fixed recipes with a check after each step (as Infina does), not an AI planner. An AI planner stays a Phase 3 idea, to be considered only if recipes cannot cover the common cases.

## Decisions still open
1. Stage order: A and B first (recommended), then C.
2. Always-on listening for hands-free: local only, with a visible indicator, wake word only.
3. Screen understanding: start with on-device text recognition (Apple OCR) for apps without accessibility; cloud vision only with approval.
4. Multi-step tasks in Phase 3 (a planner with a Stop button) stay out of Stage C.
