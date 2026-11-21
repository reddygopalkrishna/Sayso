# Changelog

What changed in Sayso, when, and what is still pending. Newest first. Times are IST (+05:30).
Each entry names the commit so you can see the exact code with `git show <commit>`.

On 21 Nov 2026 the history was rewritten for the first push: every commit was re-dated to that day and has a new commit name, so the commit names in the entries below no longer match this repository. The code and the descriptions are unchanged; the dates and times in the entries are when the work was done.

## In progress

- **Stage B of docs/PLAN_INFINA_PARITY.md:** test "click Profile" in Google Cloud Console by hand after a restart (the code is in; not yet tried in Chrome).

## Pending (later)

Known gaps, in rough priority order. Add to this list whenever something is deferred.

- **Adaptive pause:** the pause before "send" is fixed at 600 ms (`SAYSO_PAUSE_MS` to change it). The plan is to learn it per user from cancellations (`adaptive_stats`, step 7).
- **Gmail and other web mail:** "send" presses Enter in browsers, which only adds a new line in a Gmail draft (Gmail sends with ⌘⏎). Needs the page URL or the focused element to tell web mail from web chat.
- **"Delete that" removes the current selection only,** not the last thing you dictated. A reliable "delete my last dictation" needs the length of the last paste (or an undo of it); decide with real use.
- **Ask-once chip for "open X":** when an app and a website both fit, the PRD asks once with a chip. For now you teach it by voice ("open GitHub app" / "open GitHub website") and it is remembered; the chip itself is not built.
- **More commands from the PRD:** volume, lock screen, dark mode, screenshot; positional arguments ("open the third email"); "open GitHub in Chrome" (a named browser).
- **Hand-test the remaining settings links:** the Microphone and Accessibility panes (Keyboard settings and the History tab are confirmed working; the pane addresses are not yet checked for the other two), and the "Allow microphone" / "Show the macOS prompt" buttons on a Mac where a permission is still off.
- **SQLite driver (decision):** the plan says better-sqlite3; the code uses Node's built-in `node:sqlite` because one compiled better-sqlite3 cannot match both Electron's Node 24 and the test runner's Node 26. One file (`core/storage/db.ts`) to change if you prefer better-sqlite3.
- **From the Infina recordings (14 Nov):** (1) **AI cleanup speed:** theirs adds about 0.2 s, ours 0.8–2 s over the internet; the lever is a small on-device model (Gemma is in the PRD) or a faster hosted path. (2) **Choose the hold key** (Fn, Right Option, Right ⌘, Caps Lock) so Sayso and other dictation apps can coexist. (3) **Per-app style** Default / Chill with a setting. (4) **Snippets** (say a trigger, type the full text). (5) Commands: go back, next window / close this, new chat / previous chat, and "open the second email" or a link by its first words. (6) Onboarding as a short stepper ending with a "try it" step.
- **Groq lineup and limits:** Groq's model list changes (the account had no small Llama in Nov 2026), so `SAYSO_FAST_MODEL` is a setting and the History speed line shows whether it is still fast; the free tier allows about 7,000 input tokens a minute, so a heavy burst falls back to Gemini (the log says so). A paid Groq tier removes the limit.
- **Interactive tutorial** ("say send after a pause", PRD onboarding) and a first-run flag; onboarding only shows while a permission is missing.
- **Dictionary helps Whisper too:** today it only corrects the text after speech-to-text. Passing the words to WhisperKit as prompt tokens could stop the mishearing at the source.
- **Packaged app permissions:** macOS grants go to Sayso.app, not Terminal; untested until there is a packaged build.
- **Scroll direction:** `scroll down` posts a negative pixel scroll; with "natural scrolling" on some Macs the direction may feel reversed. Verify by hand.
- **Verify password-field detection by hand in browsers:** Sayso reads the focused field through Accessibility (`AXSecureTextField`). Native apps expose it; Chrome and Safari may only do so when accessibility is on for the page. Test: focus a password box in each browser, dictate, expect the pill to say "Sayso does not type into password fields."
- **Confirm dialog for Risky actions:** the SafetyGate returns "confirm" for Risky commands, but there is no dialog yet, so they never run. No Risky command exists yet; build the dialog with the first one (delete, git push…).
- **Meeting apps:** actions are off whenever Zoom, Teams, Webex or FaceTime is in front (the PRD says "with the mic active", which the helper cannot see yet). Google Meet in a browser tab is not detected.
- **Preview chip polish:** it sits above the listening pill, which still says "Typing…" while the chip shows; hide the pill during the chip. "No" by voice does not cancel yet (only Esc).
- **Mic pre-roll (300 ms):** the mic starts when Fn goes down, so a word said instantly can be clipped.
- **Smart spacing** between back-to-back dictations ("Hello.How are you"): needs the text before the cursor (Accessibility).
- **Non-QWERTY keyboards:** paste uses the ANSI V key code; other layouts are not handled yet.
- **Streaming cleanup:** Gemini is called without streaming; fine for paste, but streaming could cut latency.
- **Model load time:** the first load in a new helper process took 131 s (Neural Engine compile); later loads about 10 s. Show progress in the window.
- **Status window and pill polish:** waveform in the pill, a menu-bar icon, a real settings window.

## 2026-11-21

### 12:39 · Hands-free, slice 1: cut the microphone stream into utterances (`c5dc803`)
- **What:** a new helper component, `SpeechSegmenter`, turns a continuous microphone stream into separate utterances: it learns the room's noise level, starts after three loud frames in a row (keeping 300 ms from before, so the first word is not clipped), and ends after one second of silence (keeping a 300 ms tail). Clicks and coughs under 300 ms are dropped; an utterance over 30 s is cut and the rest continues.
- **Why:** hands-free mode (toggle on, then just speak) needs to know where each sentence starts and ends. This is the first of three slices in `docs/PLAN_INFINA_PARITY.md`: (1) this, (2) continuous listening in the helper and the protocol, (3) the app side with the trigger rules, the switch and the indicator.
- **Not wired yet:** nothing listens continuously yet, so there is no visible change.
- Tests: 11 new Swift tests with synthetic signals (silence, sentences, pauses, clicks, a steady hum, any chunk size, long speech, stopping mid-utterance); 42 helper tests pass.

### 12:37 · Choose the key you hold to dictate (`3f0149e`)
- **Settings tab:** "Key to hold to dictate": Fn (default), Right Option, Right Command or Right Control. Shift with it still gives commands; a shortcut pressed while it is held still cancels the dictation. Pick another key if a second dictation app (for example Wispr Flow) also uses Fn, otherwise both type everything you say.
- **How:** the helper tells the right-hand keys from their left twins by the device-dependent flag bits, so the left Command or Option never starts a dictation. The app sends the key when the helper connects, after a helper restart, and on a change: no restart needed. `SAYSO_HOLD_KEY` sets the starting key.
- **Protocol:** new `setHoldKey` message with its fixture and schema. The `hotkey` events still say `fn`: they mean "the hold key".
- Tests: 988 desktop, 59 protocol, 17 grammar and 31 helper tests pass; typecheck and lint clean. Live: the real helper answered `done` for valid keys and rejected `capsLock`.
- Not tried with real keys yet: restart `pnpm dev`, choose Right Option, hold it and speak. Caps Lock and the left-hand keys are not offered.

### 12:32 · Style: Default or Chill, everywhere and per app (`2b2726e`)
- **Style (Settings tab):** Default (capitals and full punctuation) or Chill (no capitals, almost no punctuation), with an example of each. A list under it shows the apps you have dictated into; each can follow the everywhere style or have its own.
- **What Chill keeps:** your dictionary words keep their spelling, links and emails stay as written, numbered lists keep their numbers, line breaks stay. Snippets are never changed.
- **Starting style:** `SAYSO_STYLE=chill` in `.env`. The Settings tab wins over it. Applies at once, without a restart.
- **Database:** schema 6 (per-app styles). History records the text that was typed.
- Tests: typecheck and lint clean; 979 desktop tests pass.
- Not yet seen in the running app: restart `pnpm dev` first.

### 11:52 · Snippets and a Settings tab (`7ad6b32`)
- **Snippets (Dictionary tab):** say a short trigger on its own ("calendly") and Sayso types the saved text exactly as written, with no AI. It also works as "calendly", pause, "send". A trigger inside a longer sentence is just dictation. Never typed into a password field. Up to 200 snippets; trigger up to 60 characters, text up to 2,000.
- **Settings tab:** pause before "send", preview time, text cleanup level (off, light, full), skip the AI for short clean text, and history size. Changes apply at once, with no restart, and win over `.env`, which only gives the starting values. "Reset to defaults" goes back to the `.env` values. Out-of-range values are refused.
- **Database:** schema 4 (snippets) and 5 (settings). Tested by upgrading older databases.
- **History** records the text that was typed for a snippet.
- Tests: typecheck and lint clean; 939 desktop tests and 17 grammar tests pass.
- Not yet seen in the running app: restart `pnpm dev` first (until then the window shows "Restart Sayso").

## 2026-11-16

### 19:18 · System commands: take a screenshot, lock screen (`4d6c97f`)
- **"take a screenshot"** sends ⇧⌘3 (saves a full-screen screenshot to the Desktop). Safe: runs at once.
- **"lock screen"** sends ⌃⌘Q. It shows the preview chip first, so Esc can stop it.
- **Not tried live:** lock screen would lock the Mac; screenshot writes a file. Volume and dark mode are still to do (they need media keys or AppleScript).
- Tests: typecheck and lint clean; 901 desktop tests and 17 grammar tests pass.

### 19:17 · Risky buttons ask "yes?" first (`9f08c8b`)
- **What:** "click Delete" (and other risky labels such as Pay, Sign out, Publish) no longer gets refused. The pill shows "Say “yes” to press …" for 8 seconds. Only "yes" (or "yes do it", "yes go ahead", "yes click it", "confirm") within that time presses the button, and only if the same app is still in front.
- **Cancelling:** Esc, any other command, or the timeout drops the wait. A late "yes" does nothing.
- **Still refused:** risky buttons in meeting apps, password fields and blocked apps.
- **Limits:** Esc works only while the helper is capturing it (a few seconds). History records a waiting action as "awaiting". Not yet tried live.
- Tests: typecheck and lint clean; 881 desktop tests, grammar and helper tests pass.

## 2026-11-15

### 14:35 · Go back and go forward by voice (`b497890`)
- **What:** "go back", "back page" or "previous page" sends ⌘[; "go forward", "forward page" or "next page" sends ⌘]. Both are safe and run without the preview chip. They are Stage C step 2 of `docs/PLAN_INFINA_PARITY.md`.
- **Why:** Infina has these, and they are the simplest way to move through pages in browsers and Finder.
- **How it was checked:** the helper sent ⌘[ and ⌘] to Chrome: a test tab went back one page and then forward again. The test window was closed afterwards.
- **Limits:** the voice path (Fn+Shift, then "go back") is not tried yet. In text editors, ⌘[ may change indentation instead of going back.
- Tests: 862 desktop tests, grammar (17), protocol (56) and helper (26) pass; typecheck and lint are clean.

### 14:09 · Chained commands: "open Chrome, new tab" runs each step in order (`bb883f9`)
- **What:** in command mode (Fn+Shift), a sentence with commas, semicolons, "then" or "and then" runs each part as a command, in order, with a short pause between steps. Stops at the first refusal or failure. If any part is not a command, nothing runs. Up to 4 steps.
- **Why:** one sentence can now do a short task ("open Slack, new tab"), which is Stage C step 1 of `docs/PLAN_INFINA_PARITY.md`. A bare "and" is not a joint, so "open Tom and Jerry" stays one command.
- **Limits:** the history row shows only the last step of a chain. "search GCP" is not a command yet, so a chain with it is refused as a whole.
- Tests: 835 desktop tests, typecheck and lint pass. Not yet tried live.

### 14:06 · Click not-found shows a short message; first click in a web app retries once (`39bf851`)
- **Not-found message:** a click that finds nothing already reached the pill; the text is now short ("Couldn't find “X” on screen.") so it fits.
- **First-click retry:** when a web app (Chrome, ChatGPT, Claude…) was just switched on for accessibility, a miss waits 200 ms and searches once more, because its tree may still be building.
- **Competitor notes:** `docs/COMPETITOR_INFINA.md` section 10 holds our recording's results, Infina's UI (v1.45.21) and the Instagram reel.
- Tests: helper 26 Swift tests pass; TypeScript typecheck passes (no TypeScript changed). Live: a missing label returns "not found" in about 1 s.
- Not yet tested: clicks in Chrome (Google Cloud "Profile") and the pill text in a real run. Your running Sayso keeps the old helper until restart.

### 13:03 · Click reliability for Chrome and Electron apps; the parity plan (`f0fc936`)
- **Why clicks failed:** Chrome, ChatGPT, Claude, Slack and WhatsApp build their accessibility tree only when asked, so "click Profile" searched an almost empty tree. The helper now asks once per app, then searches the focused window before the whole app.
- **Plan:** `docs/PLAN_INFINA_PARITY.md` lists the stages (measure, reliable single commands, Phase 1 features, quick wins, demos), a command test matrix for hand testing, and the open decisions.
- Tests: helper 26 Swift tests pass. Live: "Search" pressed in the Claude app returned success; a label that does not exist returns "not found" in about 1 s. Not yet tested: a click in Chrome (Google Cloud "Profile") and the pill message.
- Your running Sayso keeps the old helper until you restart it.

### 00:07 · Faster AI cleanup, step 2: Groq first, Gemini as the fallback (`9057315`)
- **About 0.2–0.35 s instead of 1–2 s.** Add `GROQ_API_KEY` to `.env` and Sayso tries Groq (Qwen 3.8 27B, reasoning off) first. Live through the real code: 297, 213 and 350 ms for a correction, a numbered list and a long dictation, with your dictionary and the list formatting working as before.
- **Gemini stays as the safety net.** If Groq errors, is slow (over 1.5 s) or is rate-limited, Gemini answers instead; a broken key was tested and still produced the right text (1.2 s). A rate limit pauses Groq for as long as it asks (30 s by default, at most 60 s), and two failures in a row pause it for 30 s, so a bad spell does not make every dictation wait. The log says when this happens. If you give up (time limit), nothing new is started.
- **Your choice of where text goes:** with only a Gemini key nothing changes. `SAYSO_AI_PROVIDER=gemini` keeps your text away from Groq even with a Groq key; `groq` uses only Groq. `SAYSO_FAST_MODEL` changes the Groq model. Everything is documented in `.env.example`.
- **Firmer wording rule** for every AI: keep the speaker's own wording, change only fillers, grammar and punctuation, never paraphrase, merge or drop an idea, question or hedge. (On Groq it brought several long dictations much closer to what you said.)
- **History shows who answered:** rows read "Groq 0.2 s" or "Gemini 0.9 s", and the Speed line gives each provider's median. Database upgraded to version 3; checked by booting the real app on a copy of your real database (version 1 → 3, all 27 rows intact).
- Tests: 819 TypeScript (Groq request and error handling incl. Retry-After and reasoning-tag removal, the fallback chain with timeout, cooldown, caller-gave-up and recovery, provider selection incl. forced modes, config, the new database column, the speed statistics). Isolated boot of the app: clean start.

## 2026-11-14

### 23:57 · Plan: fast hosted model measured (Groq), no code changed
- Tested on your Groq key with the real prompt: **Qwen 3.8 27B with reasoning off answers in about 0.2 s** (0.24 s median on 18 real dictations, slowest 0.4 s), against 0.6–0.95 s warm and 1–2 s in real use for Gemini. Quality matches Gemini on short and medium text; on long rambling dictations it paraphrases more, which a firmer "keep the speaker's wording" rule reduces. The gpt-oss models were slower and less careful.
- Free-tier limits (about 7,000 input tokens a minute, about 1,000 requests) mean Gemini must stay as the automatic fallback. Details and the recommendation are in `docs/PLAN_FAST_CLEANUP.md`. Waiting for your go-ahead (it sends text to a second company).

### 23:44 · Faster AI cleanup, step 1 (see docs/PLAN_FAST_CLEANUP.md) (`e296717`)
- **Connection warm-up:** when you release Fn, Sayso opens the connection to the AI service while speech-to-text is still running (a bare request, no key, no text; at most once every 2 s; never errors). A/B on this Mac: median 0.94 s with it vs 1.13 s without, about 0.2 s saved. It runs on release, not on press, because Node drops an idle connection after about 4 s and your speech is often longer than that. Electron's own network stack (`net.fetch`) was measured and was not faster, so it is not used.
- **Skip the AI when it cannot help:** a short sentence (12 words or fewer) with no hint of fillers, corrections, numbering, spoken line breaks or "dot" is finished by the local rules, with no AI call at all (the log says `no AI needed: short and clean`; History shows "no AI needed"). Chat apps accept a missing closing full stop; mail and documents need one. On your 19 real dictations it would skip 5 (26%), and all 5 matched what the AI produced. Honest note: most of your dictations are long (14–106 words), so the AI still runs for about three quarters of them. `SAYSO_SKIP_AI=off` in `.env` turns the skipping off.
- **You can now see the speed:** every new History row records how its text was cleaned up (AI with its time, no AI needed, AI unavailable, local rules, raw) and the History tab starts with a Speed line: median time, slowest 5%, and the share of dictations where the AI was skipped or used. Database upgrade to version 2 keeps all existing rows (checked on a copy of your real database: 27 rows intact).
- Tests: 754 + 73 TypeScript (rule table incl. whole-word cues, the skip inside the cleanup with your dictionary applied first, warm-up request shape and throttle, `onRelease` for tap / chord / command, schema upgrade with existing rows, speed statistics, the History screen). Isolated boot of the real app: clean start, fresh database at version 2.
- Still to decide for later steps (questions at the end of the plan): a fast hosted model, Apple's on-device model, our own model.

### 23:36 · Plan: faster AI cleanup (no code changed)
- Written to `docs/PLAN_FAST_CLEANUP.md`, with measurements from this Mac. Findings: Gemini has a floor of about 0.6 s and a cold connection adds 0.25–0.5 s, so it can never match Infina's 0.2 s; Apple's built-in on-device model runs at 0.35–1.1 s with a short prompt but is sloppy (over-lists, drops words, summarises long text); on your 19 real dictations, local rules alone gave identical text for 6 and the AI changed words for 11 (mostly your long dictations).
- Recommended order: (1) warm the connection when Fn goes down and skip the AI for short clean text; (2) test a fast hosted model (Groq/Cerebras) with a key; (3) Apple's on-device model as the keyless, offline tier with guard rails; (4) our own small model later.
- Four questions for you are at the end of the plan.

### 23:26 · Lists and structure in dictation; Infina recordings reviewed (`1800494`)
- **Your observation was right:** "first one … second one … third one" came out as one running paragraph, where Wispr Flow and Infina make points. My cleanup prompt said "keep the order of ideas" and "no markdown", so the AI never made points. Now it writes a numbered list when two or more items are clearly enumerated ("first one / second one", "number one", "point one", "step one", "first, … second, …"), drops the spoken ordinals, keeps a lead-in sentence only if you said one, and never invents one (found and fixed in testing: it added "Here are the tasks to complete:").
- Also handled: "new line" / "new paragraph" said in the middle of a dictation become real line breaks; several unrelated topics in a long dictation become short paragraphs; "john at example dot com" becomes john@example.com and "example dot org slash pricing" example.org/pricing.
- Does **not** make lists out of ordinary sentences: "milk, eggs and bread", "first of all, thank you" and short chat messages stay as they are (checked live on seven cases).
- **When the AI is not used** (Light level, a timeout, or a rate limit) a careful local rule still lists clearly numbered speech ("First one. … Second one. …"): markers must run 1, 2, 3… at sentence starts with punctuation after them, so "first of all", "the first one is red" and "third-party" are left alone. Never in terminals and code editors.
- History and Home now show the line breaks of a list.
- **Infina recordings:** watched both (no audio track in either; on Mac, choose Microphone in the screenshot toolbar's Options before recording). Notes and a comparison table are in `docs/COMPETITOR_INFINA.md`; the gaps are in Pending above. Biggest finding: their AI cleanup adds 0.2 s to a sentence, ours 1–2 s.

### 23:16 · Fix: the AI turned the word "dictionary" into "Sayso"; "open X" is now remembered automatically (`aa8a534`)
- **Bug found in your own History:** you said "I opened dictionary tab" and "listed on dictionary tab" and Sayso typed "…Sayso tab" each time. The cleanup prompt called your word list a "dictionary", so when you said that ordinary word the AI took it as a pointer to the list and swapped it for your word. Reproduced against Gemini (empty list: kept; list with Sayso: replaced), then fixed by wording the prompt without the word "dictionary" and telling the AI never to put one of your names where it was not said. Verified live on your exact sentence and five more.
- **Safety net:** your spelling fixes ("say so" → Sayso) are made locally before the AI runs, so the AI never needs to add one of your words. If its answer contains one that was not in what you said, the answer is discarded and the local cleanup is used (the log says why).
- **"Open X" is remembered automatically.** You said "open GitHub", it opened the website, and nothing was listed, because only "open GitHub app/website" taught it. Now whatever "open …" opens (an app or a known website) is remembered and shown on the Dictionary tab at once (the list refreshes live), and the same words open the same thing next time. Web searches and typed-out domains are not remembered. Say "open GitHub app" or "open GitHub website" to change a choice, or Forget it on the tab.
- **Your dictionary now also fixes spoken commands.** "Open Cloud" (a real mishearing of Claude in your History) opened a web search for "cloud". Add `Claude` with "sounds like" `cloud` and "open Cloud" opens the Claude app. The History keeps the words exactly as heard.
- **Confirmed by you:** History fills in; a password box in Chrome refuses voice typing (detection works in Chrome); the Keyboard settings link opens.
- Note: my test calls used up some of your Gemini free-tier quota for a minute; if one dictation fell back to the local cleanup around then, that is why.

### 16:35 · The window says "Restart Sayso" when it is newer than the program behind it
- In development the screens hot-reload but the main program does not. After step 7 this left a running copy with the new History / Dictionary / permission screens on the old backend: no database file, no permission log line, and screens that could crash. The window now checks that the backend has the features it needs and, if not, shows a clear "Restart Sayso" message with what to do. Tested with the older API shape.
- If you ever see "Restart Sayso": quit Sayso (or Ctrl+C in the terminal) and run `pnpm dev` again.

### 16:33 · Phase 0 step 7: history, personal dictionary, remembered choices and permission setup (`e3a35bd`)
- **History tab:** the last 50 things you said and what Sayso did (heard text, typed text, app, time, how long it took, done / cancelled / blocked / failed). Stored on this Mac only (`~/Library/Application Support/Sayso/sayso.sqlite`, readable only by you). **Anything said into a password field is never saved.** "Clear history" at any time; `SAYSO_HISTORY_KEEP=0` turns history off.
- **Dictionary tab:** add names and terms (Kairo, GitHub, Sayso) and, optionally, what Sayso mishears them as ("say so" → Sayso). They are spelled correctly locally before cleanup (Light and Full), and sent to the AI as exact spellings.
- **Remembered "open" choices:** say "open GitHub app" or "open GitHub website" once and plain "open GitHub" does the same afterwards. The Dictionary tab lists them with a Forget button.
- **Permission setup on Home:** an orange card with two steps (Microphone, Accessibility), each with the right button (allow, show the macOS prompt, or open the System Settings pane). It refreshes by itself and disappears once both are on. Home also has a short how-to (Fn, Fn+Shift, Esc) and a link to the Keyboard setting.
- **Under the hood:** SQLite through Node's built-in `node:sqlite` (not better-sqlite3, see Pending: Electron's Node 24 and the test runner's Node 26 cannot share one compiled module). Versioned migrations, each atomic; a database from a newer app is refused. If the database cannot open, dictation still works and Home says why. The UI reaches data only through validated requests, and only fixed System Settings links can be opened.
- **Test copy:** `SAYSO_DATA_DIR=/some/folder pnpm dev` runs a second copy with its own data (used to boot-test without touching a running one).
- Tested: 31 storage tests on real databases (privacy mode, atomic migrations, pruning, SQL-injection safety), dictionary replacement, history recording incl. the password rule, remembered choices, permission polling, 15 request handlers (rejecting bad input and foreign URLs), UI states (incl. HTML escaping), 26 Swift tests. Booted a real copy: database created (3 tables, mode 600), permissions read through the helper, closed cleanly.

### 15:35 · Fix: "open Chrome" opened a web search instead of the app
- Found in your real test: "Open Chrome" ran a Google search for "chrome" (which opened in Chrome), because app names only matched from their first word and "chrome" is the second word of "Google Chrome".
- A whole word inside an app name now counts: "open chrome" → Google Chrome, "open code" → Visual Studio Code, "switch to chrome" works too. Order: exact app name → known website → name starts with it → name contains it as a word → close mis-hearing → web search. Partial words still don't match ("chro" is not Chrome).
- Your test also confirmed in real use: open Calculator, new tab, close tab, scroll down, click by label in Chrome, and send/enter after a pause.

### 12:49 · Phase 0 step 6: instant voice commands (hold Fn+Shift) (`0cc6831`)
- **Command mode:** hold **Fn + Shift** and speak a command. Everything said in command mode is a command and is never typed; if it is not a command, the pill says what it heard. Plain Fn is still dictation (so "undo" said while dictating is just text). The pill shows "Command…" while you hold.
- **Commands:** undo, redo, select all, copy, paste, delete that (the selection), new tab, close tab, scroll up / scroll down, cancel (also "never mind", "stop"), plus the earlier send / enter / new line, now also usable as a whole utterance. Natural wording works: "please undo", "copy that", "open a new tab".
- **Click by label:** "click Submit", "press Save", "click on the Next button". The helper searches the front app's buttons, links and menu items by their visible name (Accessibility, AXPress) within 300 ms. It shows the preview chip first. Buttons that pay, buy, delete, remove, sign out, publish or post are refused (PRD asks "yes?" for those; no confirm dialog yet).
- **Open:** "open Slack" opens an installed app; "open GitHub" a known website; "open github dot com" a domain you spell out; anything else becomes a web search (PRD §7.5). Only http(s) links open. **Switch:** "switch to Safari" brings a running app forward.
- **Matching** (`CommandEngine`) is local and takes well under a millisecond, no AI: exact phrases first, then phrases with an argument, then close mis-hearings ("new tap" → new tab, "scroll dawn" → scroll down). Short phrases ("undo") never fuzz; "click the button" with no real name is not a command.
- **Same safety as before** for every command: Terminal can't close tabs, meeting apps and password fields refuse (and the pill says why), "cancel" always works. Commands are data in `commands.json`; phrases can end in `{label}`, `{target}` or `{app}`.
- Tested: 17 commands × 9 contexts in the SafetyGate matrix (205 cases), 99 command and resolver cases, command-mode pipeline cases (chip, Esc, refusals, app changes mid-chip), Fn+Shift in either order, and 25 Swift tests. On this Mac: listing apps takes 46 ms cold, 10 ms warm; unsafe links and missing apps are rejected with clear errors.

### 12:29 · Phase 0 step 5: safety gate, preview chip, no typing into password fields (`060bb67`)
- **Preview chip:** before "send" or "enter" runs, a small chip above the pill shows "Send · Esc to cancel" with a bar that fills for 1 second (`SAYSO_PREVIEW_MS`). Press **Esc** and the command is cancelled and the word you said is typed instead. "New line" (Safe) runs at once without the chip.
- **Esc is swallowed only while the chip shows**, so it does not also hit the app underneath (Esc clears drafts in some apps). The helper switches this off by itself after 3 seconds, so a crashed app can never leave Esc disabled.
- **Password fields:** Sayso never types into one, and never presses keys there. The check uses the focused element from Accessibility, is done again right before typing (the focus can move while the AI is cleaning up), and happens before any text is sent to the AI. The pill says why.
- **Safety levels (`SafetyGate`):** Blocked refuses; Safe runs; Normal shows the chip; Risky asks to confirm (no dialog yet, so it never runs). Context rules: Terminal/iTerm never get Enter, send or new line; no actions while a meeting app is in front (dictation still works); refused commands stay as typed text.
- **If you switch app during the chip,** the command is skipped instead of being sent to the wrong app. Commands also re-check the app and field just before running.
- App names no longer carry the invisible mark WhatsApp adds.
- Tested: every command × context (Slack, Mail, Terminal, iTerm, Zoom, Teams, unknown, password in two apps) = 27 cases, chip timing and Esc, and the pipeline's change-of-focus cases.

### 10:01 · Docs and skills: smaller start for every session, no app code changed (`9c077dd`)
- CLAUDE.md cut from about 15 KB to about 2.5 KB. It is now a short index and the rules; the repo detail moved to `docs/REPO_MAP.md`, and the status to `docs/STATUS.md`. Every session reads these first, so the start costs far fewer tokens.
- Added the `sayso-testing` skill (test commands, fixtures, the required cases for the pause rule, commands and SafetyGate). `build-step` now points to STATUS and REPO_MAP.
- Moved the superseded `EARLY_PLAN.md`, the Buildathon submission and its deck out of the repo (kept in `../Sayso-archive/`).

### 09:53 · Phase 0 step 4: say "send" after a pause to send (`60e87a4`)
- Say your message, pause, then say **"send"** (or "send it"): the text is typed, then the message is sent. Also **"enter"** / "press enter" and **"new line"** (Shift+Enter, a line break that does not send).
- It only counts as a command when it is the last thing you say, after a pause of at least 600 ms. "Send me a flower" and "reply send" (no pause) stay text. Saying just "send" on its own presses send.
- Send is Enter in chat apps (Slack, WhatsApp, Claude…), ⌘⇧D in Apple Mail and ⌘⏎ in Outlook/Spark/Superhuman.
- Terminals never get Enter, send or new line: the word is typed as text instead.
- The command is detected on the raw transcript, before AI cleanup, so the AI never sees or rewrites it.
- Commands are data in `packages/command-grammar/commands.json`; the helper can now press keys (`keyPress`). Tested with 27 pause-rule cases, including a real recording ("…tomorrow? [pause] Send." → text + send).

### 00:35 · No AI attribution in commits from now on
- New rule in CLAUDE.md: commits, PRs and repo files carry no Claude/Anthropic attribution or co-author line. Earlier commits are unchanged.

### 00:33 · Only one Sayso runs at a time
- Starting `pnpm dev` while another copy was running left both copies listening to Fn, so each dictation was pasted twice (up to five times tonight).
- Now a newly started dev copy makes the old one quit and takes over (it has your latest code). A packaged app instead brings its existing window forward.
- Quitting is one clean path (stop the helper, then exit). The first version hung half-quit because the new copy's lock retries made the old copy call quit repeatedly; fixed and tested live with two copies: one left running, then 0 after ⌘Q.
- Clicking the Dock icon reopens the status window after it was closed.

### 00:26 · Changelog, and a clear page for localhost:5173 in a browser
- Added this `CHANGELOG.md`; CLAUDE.md now requires updating it after every change.
- Opening `localhost:5173` in a browser showed a blank page (it only serves the Sayso window and has no app connection there). It now explains that and says how to reopen the window (Electron icon in the Dock).

### 00:21 · Fix: no error popups when the terminal closes (`8f227a1`)
- Closing the terminal that started Sayso made every log line fail with "write EIO" and Electron showed an error dialog each time. Log write errors are now ignored.

### 00:17 · Faster AI cleanup: Gemini Flash-Lite (`0fcbe17`)
- `gemini-flash-latest` returned 503 "high demand" or took 35–130 s, so every cleanup hit the 2.5 s limit and fell back to local cleanup.
- Default is now `gemini-flash-lite-latest` with minimal thinking: 0.9–1.3 s in repeated tests, correct output ("…5, no, 6…" → "6:00").
- Measured in real use: AI cleanup in 1.2 s for Claude.

### 00:04 · Fix: the app in front is detected again (`a1b2b9c`)
- Replies to "which app is in front?" were never matched to their request, so every dictation waited 500 ms and used the casual tone for an "unknown app". The message handling is now exhaustive, so a new message type cannot be dropped silently again.

## 2026-11-13

### 22:03 · Phase 0 step 3: AI text cleanup (`0bc053c`)
- `LLMProvider` interface + `GeminiProvider` (key in a request header, never in the URL).
- Tone per app: casual (Slack, WhatsApp, Claude…), professional (Mail, Outlook, Notes…), literal (Terminal, VS Code… never sent to AI).
- Cleanup levels Off / Light / Full; on any AI error, timeout or suspicious output, a local cleanup (remove "um", "uh", repeats) is used instead.
- API key read from `.env` into the main process only (not visible to the UI or the helper).

### 21:57 · Phase 0 step 2: hold Fn to dictate (`1685e3a`)
- Swift helper: Fn key listener, microphone at 16 kHz, on-device WhisperKit (`large-v3 turbo`, about 600 MB, downloaded once) with word timings, paste with clipboard restore.
- Electron: dictation state machine (short taps ignored, Fn + another key cancels, 5 min limit), floating "Listening…" pill, status window.
- Measured: 4–5 s of speech transcribed in 0.6–1.3 s.

### 21:27 · Phase 0 step 1: project setup (`5421239`)
- pnpm monorepo: Electron + React + Tailwind app, Swift helper talking over stdin/stdout, shared message definitions with tests on both sides.
