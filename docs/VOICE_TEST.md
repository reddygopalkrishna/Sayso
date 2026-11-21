# Voice test: 40 spoken commands

A script you run by voice on the real app, to measure how accurate Sayso is at doing actions. Nothing here has been run yet: the "Expected" column is what the code is designed to do (from `packages/command-grammar/commands.json` and the interpreter), not a measured result. The "Result" column is yours to fill in.

## Before you start

1. `pnpm dev` is running (one copy only), Microphone and Accessibility are granted, and the Home screen shows the speech model ready and the Fn listener on.
2. Settings: "Understand my own words" on (tests 31 to 36 need it). Hold key as you use it (Fn by default).
3. Save a name, email and phone in **About me** (tests 29 to 30).
4. Keep the terminal tab "Sayso dev" visible. Every failure prints a line there, for example `[dictation] dictation error: Didn't catch a command`.
5. Say each phrase **as written, in a normal voice**, holding the key (Fn + Shift for commands; in hands-free mode say the wake word first). Do not repeat a phrase that failed: mark it and move on, so the table shows first-try accuracy.
6. Do not test "lock screen" in this run (it locks the Mac) or "send" in a real chat.

## Results key

Mark each row: **OK** (did what was expected), **Wrong** (did something else), **Nothing** (heard, did nothing), **Error** (the pill or log showed an error). For Wrong, Nothing and Error, copy the matching terminal line into the "Log line" column (or paste them all to the session that fixes things).

## A. Chrome (open a Chrome window on any page first)

| # | Say | Expected | Result | Log line |
|---|---|---|---|---|
| 1 | "open Chrome" | Chrome comes to the front | | |
| 2 | "new tab" | a new tab opens | | |
| 3 | "type AWS console" | the words are typed in the address bar | | |
| 4 | "send it" | Enter is pressed (said after a pause); the search or page loads | | |
| 5 | "open the first result" | the first search result opens | | |
| 6 | "scroll down" | the page scrolls down | | |
| 7 | "scroll up" | the page scrolls up | | |
| 8 | "go back" | back to the previous page | | |
| 9 | "go forward" | forward again | | |
| 10 | "click Sign in" (on a page with a Sign in button) | the button is pressed | | |
| 11 | "open the third result" (on a results page) | the third result opens | | |
| 12 | "open GitHub" | a GitHub tab or the app opens (it remembers your choice) | | |
| 13 | "close tab" | the current tab closes | | |
| 14 | "take a screenshot" | a screenshot is saved (macOS sound or file on the Desktop) | | |

## B. Finder

| # | Say | Expected | Result | Log line |
|---|---|---|---|---|
| 15 | "open Finder" | a Finder window comes to the front | | |
| 16 | "new tab" | a new Finder tab opens | | |
| 17 | "click Downloads" | the Downloads folder in the sidebar opens | | |
| 18 | "click Documents" | the Documents folder opens | | |
| 19 | "open the first result" | may not work: Finder rows are not always readable. Note what happens | | |
| 20 | "close tab" | the Finder tab closes | | |

## C. Notes (open a new empty note first)

| # | Say | Expected | Result | Log line |
|---|---|---|---|---|
| 21 | "open Notes" | Notes comes to the front | | |
| 22 | (dictate, no Shift) "buy milk and call mom" | the sentence is typed, cleaned up | | |
| 23 | "new line" | a line break | | |
| 24 | (dictate) "second line of the note" | typed on the new line | | |
| 25 | "select all" | the whole note is selected | | |
| 26 | "copy that" | copied | | |
| 27 | "undo" | the last change is undone | | |
| 28 | "delete that" | the current selection is removed | | |

## D. Saved details and filling forms (a web form with name, email and phone fields, in Chrome)

| # | Say | Expected | Result | Log line |
|---|---|---|---|---|
| 29 | (click a field) "type my email" | your saved email is typed | | |
| 30 | "type my phone" | your saved phone is typed | | |
| 31 | "fill in my details" | the name, email and phone fields are filled from About me | | |

## E. Your own words (the interpreter; each needs "Understand my own words" on)

| # | Say | Expected | Result | Log line |
|---|---|---|---|---|
| 32 | "open a fresh tab" (Chrome) | a new tab opens | | |
| 33 | "log me in" (on a page with a sign-in form) | the sign-in button or fields are chosen, or nothing happens if there is no match | | |
| 34 | "go to the previous page" (Chrome) | back | | |
| 35 | "scroll a little" (Chrome) | scrolls, or nothing if it is not close enough | | |
| 36 | "open a new tab and search for AWS" (Chrome) | a new tab, "AWS" typed | | |

## F. System Settings

| # | Say | Expected | Result | Log line |
|---|---|---|---|---|
| 37 | "open System Settings" | System Settings comes to the front | | |
| 38 | "click Bluetooth" | the Bluetooth pane opens | | |
| 39 | "click Wi-Fi" | the Wi-Fi pane opens | | |
| 40 | "click Sound" | the Sound pane opens | | |

## G. Mishearing checks (the known weak spot: short commands)

Say each once, in Chrome, normal speed. Note what Sayso heard (the Activity screen shows it) in the Log line column.

| # | Say | Expected | Result | Heard as |
|---|---|---|---|---|
| 41 | "new tab" | new tab (was once heard as "New time") | | |
| 42 | "close tab" | tab closes | | |
| 43 | "go back" | back | | |
| 44 | "scroll down" | scrolls down | | |

## Score

Count at the end:

| | Count |
|---|---|
| OK | |
| Wrong | |
| Nothing | |
| Error | |
| Total | 44 |

First-try accuracy = OK / 44. Report it with "tested by hand on <date>, <Mac model>, <mic>". Do not quote it as a general accuracy figure: it is one person, one Mac, one session.

## After the run

Paste the terminal lines for every row that was not OK, with the row numbers. For each failure the fix goes in one of three places:

- the interpreter prompt (`apps/desktop/src/main/core/interpret/prompt.ts`) when a free-form sentence was misread;
- the phrases in `packages/command-grammar/commands.json` when the exact words should have matched;
- the fuzzy matching in `apps/desktop/src/main/core/commands/CommandEngine.ts` when the words were close but not matched.
