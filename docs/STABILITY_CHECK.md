# Stability check: every command, by voice

Goal: before the demo, know which lines work for you. Say each line 3 times. Mark it ✓ only if it works all 3. For every ✗, send the failure details (see the end).

## Setup (once)

1. Stop `pnpm dev` (Ctrl+C) and start it again: `pnpm dev`. Wait for `[stt] … ready`.
2. System Settings → Sound → Input: set the input volume to 100%. System Settings → Keyboard → Dictation: set "press Fn twice" to **Off**.
3. Close other dictation apps and other tabs. Quiet room, microphone close (arm's length at most).
4. Double-tap Fn quickly. The terminal must print `[hands-free] double tap: turning on`.
5. Open Chrome with Google in a tab. Keep the terminal visible.

Say each line, then wait for the action (about 1–2 seconds). If nothing happens, wait 3 seconds before saying it again.

## A. Hands-free commands (say the words as written)

| # | Say | Expected | Try 1 2 3 |
|---|---|---|---|
| 1 | "open Chrome" | Chrome comes to the front | |
| 2 | "open WhatsApp" | WhatsApp opens | |
| 3 | "open ChatGPT" | the ChatGPT app opens | |
| 4 | "new tab" | a new tab | |
| 5 | "go back" | the page goes back | |
| 6 | "go forward" | the page goes forward | |
| 7 | "close tab" | the tab closes | |
| 8 | "scroll down" | the page scrolls down | |
| 9 | "scroll up" | the page scrolls up | |
| 10 | "switch to Chrome" (from another app) | Chrome comes to the front | |
| 11 | "type hello world" (focus a text box first) | `hello world` typed | |
| 12 | "type AWS hit enter" (in the Chrome address bar, new tab) | AWS typed, Enter pressed, Google results | |
| 13 | "open the first result" (on a Google results page) | the first result opens | |
| 14 | "click Sign in" (on a page with a Sign in button) | the button is pressed | |
| 15 | "log me in" (on a login page) | the sign-in button is pressed; nothing is typed into password fields | |
| 16 | "next field" / "previous field" (on a form) | the cursor moves | |
| 17 | "start typing", then two sentences, then "stop typing" | both sentences typed with a space between; the pill shows Typing mode; it ends on "stop typing" | |
| 18 | "type" … pause … "hello there" | `hello there` typed | |
| 19 | "backspace" / "delete last word" (text in a field) | one character / one word removed | |
| 20 | "select all" then "delete that" | the field is cleared | |
| 21 | "undo" (after typing) | the last typing is undone | |
| 22 | "copy" (text selected), then "paste" | copied, pasted | |
| 23 | "new chat" (in the ChatGPT or Claude app) | a new chat starts | |
| 24 | "take a screenshot" | the macOS screenshot tool opens | |
| 25 | "fill in my details" (on a sign-up form; About me filled in) | name, email, phone filled; password never touched | |
| 26 | "stop listening" | hands-free turns off | |

## B. Held key (dictation and command mode)

| # | Do | Expected | Try 1 2 3 |
|---|---|---|---|
| 27 | Hold Fn, say "um tell Priya to meet me in Hyderabad at five" | `Tell Priya to meet me in Hyderabad at 5.` | |
| 28 | Hold Fn, say "hello how are you" | `Hello, how are you?` typed | |
| 29 | Hold Fn+Shift, say "new tab" | a new tab | |
| 30 | Hold Fn, say a sentence, pause one second, then say "send" (use a harmless chat or notes box) | the text, then Enter | |
| 31 | Double-tap Fn | hands-free turns on or off | |

## C. Things that must NOT happen (check once)

| # | Do | Expected |
|---|---|---|
| 32 | Click into a password field, say "type hello" | nothing is typed; the pill says why |
| 33 | In a Zoom or Teams window, say "new tab" | refused (meeting app) |
| 34 | On a page with a Delete or Pay button, say "click Delete" | it asks; say "cancel" and nothing happens |
| 35 | Say a normal sentence out loud ("what is the weather like today") | nothing happens, only an `ignored` line |

## What to send me for every ✗

Send these four things, in one message:

1. The row number and the words you said (and your distance from the microphone).
2. What you expected, and what actually happened (nothing / wrong action / wrong text).
3. The terminal lines for that attempt: copy from the last `[hands-free] heard …` (or `[dictation] utterance …`) line before the failure down to the end. Three to six lines is enough. The line that begins `heard "…"` is the most important: it shows what the speech model heard.
4. Which app was in front.

Do not paste more than about 40 lines at once. Do not paste any password or secret key; the terminal does not print them.

## Pass bar for the demo

- Every row you will use in the demo is ✓ three times.
- Rows 32–35 all behave as expected.
- Any row that is ✗ is left out of the demo, not tried on stage.
