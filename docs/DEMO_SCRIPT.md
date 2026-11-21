# Demo script: 90 seconds, spoken only

A flow for judges. The keyboard and mouse are not touched once the demo starts. Read "What is certain and what is not" before relying on it: parts of this flow have only been checked in code or through the helper, not yet by voice end to end. **Rehearse it at least three times on the demo Mac and cut anything that fails.**

## Setup (before the demo, not counted in the 90 seconds)

1. Restart `pnpm dev` so the latest code runs (the wait-for-page-load change needs it). Wait until Home shows the speech model ready.
2. `.env` has a Groq key (the interpreter needs it; OpenAI as a second is optional). Settings → "Understand my own words" is on.
3. About me is filled in (name, email, phone). Use details you are happy to show on screen.
4. Chrome is open on a blank tab. Open a simple sign-up form in a second Chrome window or tab ready to switch to (any page with name, email and phone fields; a local test page is safest). Close other tabs and notifications.
5. Turn **hands-free on** by clicking the switch on Home (it starts off at every launch, and the switch is the one thing that is not spoken). Check the pill says "Hands-free".
6. Quiet room, a headset or close microphone. Close other dictation apps (two apps on Fn type everything twice).
7. Keep Home visible on a second screen or half the window, so the audience sees the pill and the Activity list.

## The flow

Say each line naturally, then pause a beat. In hands-free, the words before the pause are one utterance.

| Time | Say | What the audience sees | If it fails |
|---|---|---|---|
| 0:00 | "Sayso, open Chrome" | Chrome comes forward | say "Sayso, switch to Chrome" |
| 0:08 | "Sayso, new tab" | a new tab | say it again once |
| 0:14 | "type AWS console" | the words appear in the address bar (hands-free types the words after "type") | |
| 0:22 | "send it" (after a one-second pause) | Enter: Google results load | |
| 0:30 | "Sayso, open the first result" | the top result opens (it may be an ad: say so, it is the first item on the page) | skip to the next line from the results page |
| 0:40 | "Sayso, click Sign in" | the Sign in button is pressed; if the page's button has a longer name, say "Sayso, log me in" | use "log me in", the interpreter picks the button from the names on screen |
| 0:52 | "Sayso, switch to Chrome" then, with the sign-up form in front, "Sayso, fill in my details" | name, email and phone are filled from About me; a password field is never touched | say "type my email" into the focused field |
| 1:08 | "Sayso, open a fresh tab and search for Hyderabad weather" (an unusual sentence) | the interpreter turns it into new tab, type, Enter | have "new tab" ready as a plain command |
| 1:20 | (dictation) hold Fn and say: "um tell Priya to meet me in Hyderabad at five" | clean text: "Tell Priya to meet me in Hyderabad at 5." with the name spelled right | |
| 1:30 | end | | |

Notes:
- Hands-free acts without the wake word only on "type …", "send it" / "enter" / "new line" and "open …". Every other command needs "Sayso" first. Anything else it hears is ignored on purpose, which is also worth saying to the judges.
- After a step that loads a page, Sayso waits 1.8 s before the next step in the same sentence. Between separate sentences you wait as long as you speak, so no extra pause is needed.
- If a step fails the pill shows a short reason. Do not repeat it more than once on stage.

## What the judges should hear you say

- The problem: voice tools type, but they do not act, and they get Indian names wrong.
- What is different: it also does things, understands your own words, fills forms from facts that stay on your Mac, and the speech runs on the device.
- The honest part: the base dictation app existed before the event; the README lists what was built at it. The benchmark harness is built, and the real recordings for real numbers are next.

## What is certain and what is not

| Step | State |
|---|---|
| Open an app, new tab, type, send after a pause, scroll, click by label | confirmed by hand on the base app (changelog), but not in hands-free |
| "open the first result" | opened the top Google result in a live check through the helper; not by voice |
| Waiting 1.8 s for the page before the next chained step | checked live through the helper (300 ms failed, 1,800 ms worked); not by voice |
| "log me in", "open a fresh tab and search for …" | checked live against Groq on sample sentences; not measured on real voice |
| "fill in my details" | filled a real web form through the helper in Chrome, password refused; not by voice |
| Hands-free as a whole | the listening and the cutting into sentences were checked live; a person speaking to it end to end is not confirmed |
| Indian names ("Hyderabad", "Priya") | built-in spellings tested in code; real-speech accuracy unmeasured |

If hands-free misbehaves on the day, run the same flow by holding Fn + Shift for each command (command mode, which is the more tested path); the lines are the same, without "Sayso".

## If something goes wrong on stage

- Nothing happens: look at the pill. "Hands-free is off" means the switch got turned off; "model loading" means wait.
- It typed words that were meant as a command: say "undo", then use hold-key command mode.
- A wrong button: the preview chip shows before an action runs and Esc cancels it; risky buttons ask "yes?" first.
