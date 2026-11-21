# Benchmark: plain Whisper vs Sayso

What it measures, how to run it, and how to record the sentences. **Read the honesty note first.**

## Honesty note

- The sample audio in `scripts/benchmark/sample/` is made with the macOS `say` voice. It exists **only to check that the harness runs**. A synthetic voice is not a real speaker, so those numbers say nothing about how Sayso performs for people. Do not quote them.
- Real numbers need **real recordings** (below). Until someone records them, there are no real results, and none are claimed anywhere in this repo.
- Sayso uses the same Whisper model as the "plain" side. Its gain comes from what it does with the text afterwards (names, cleanup, formatting, commands), not from hearing better. The benchmark shows that gain, and shows where there is none.

## What is compared

Both sides start from the **same transcript** of the **same wav file**, made by `SaysoHelper --transcribe` (WhisperKit, the model the app uses).

| Side | Text |
|---|---|
| Plain Whisper | the transcript as Whisper gives it |
| Sayso | the same transcript after Sayso's own steps: built-in Indian names and tech names, local cleanup (fillers, stutters), address formatting ("open ai dot com" → openai.com). With `--ai`, also the AI cleanup, exactly as the app does it (keys from `.env`) |

The Sayso side calls the app's own code (`TextCleanup`, `applyDictionary`, `fixWebAddresses`, `CommandEngine`, `Interpreter`), so it cannot drift from the product.

### Measures

- **Word error rate (WER):** edits needed to turn the output into the expected text, divided by the expected word count. Case and punctuation are ignored. Lower is better.
- **Indian names and entities:** how many expected names (Hyderabad, Priya, GitHub…) appear **spelled exactly, with the right capitals**.
- **Filler removal:** how many "um / uh / hmm" are left in the output, out of the number spoken. Whisper sometimes drops fillers itself, which is why this is counted instead of assumed.
- **Command success** (recordings of spoken commands, each with the command it should run):
  1. plain Whisper text through the exact grammar;
  2. Sayso text through the exact grammar plus close-mishearing matching (no AI);
  3. Sayso with the interpreter (needs `--ai` and a key; asked only when no exact match, as in the app). The harness gives it no screen, so it measures commands that need none (it will not find "click Sign in" on a page).
- **Speech-to-text time**, median per recording (the same for both sides).

## Run it

```bash
pnpm helper:build                                   # once
pnpm benchmark <folder>                             # local rules only, no network
pnpm benchmark <folder> --ai                        # with AI cleanup and the interpreter (keys from .env)
pnpm benchmark <folder> --json out.json             # also save the per-recording results
```

`<folder>` holds `manifest.json` and the wav files. Transcripts are cached in `<folder>/transcripts.json` (keyed by file size and time), so a second run is instant and only re-scores. Keys are read from the git-ignored `.env` and never printed. The report is also saved as `<folder>/report.md`. The script runs through vitest (it is the TypeScript runner that can load the app's code); it is not part of `pnpm test`. `pnpm benchmark:test` checks the scoring functions and the sample manifest. Each recording loads the speech model in its own helper process, so about 8 s each: 22 recordings took about 3 minutes the first time.

To test the harness with the synthetic voice:

```bash
scripts/benchmark/make-samples.sh                   # writes the wav files into scripts/benchmark/sample/
pnpm benchmark scripts/benchmark/sample
```

`manifest.json` has one entry per recording:

```json
{ "kind": "dictation", "file": "d01.wav", "script": "um I will meet Priya in Hyderabad tomorrow",
  "expected": "I will meet Priya in Hyderabad tomorrow.", "entities": ["Priya", "Hyderabad"] }
{ "kind": "command", "file": "c01.wav", "script": "new tab", "command": "new_tab" }
```

`script` is what is read aloud, hesitations included. `expected` is what should end up typed. `command` is an id from `packages/command-grammar/commands.json`.

## Harness check (synthetic voice, not a result)

One run on 22 `say` recordings (10 sentences, 12 commands; local rules, no AI) showed the harness works end to end: word error rate 11.9% plain vs 8.1% Sayso, fillers left 3 vs 0, names spelled exactly 10 of 15 on both sides, exact-grammar command success 7 of 12 on both sides, interpreter not run. Five of the twelve command clips came back from Whisper as empty or unusable text: two-word clips of about one second from a synthetic voice, which is not how the app records. These figures only show the harness runs; they say nothing about real speech. Note that on this synthetic audio the built-in names did not change the name score (the mishearings were ones outside the built-in list, such as "Lakshmiya" and "Sikhangrabad"): real recordings may differ either way.

## How to record the real sentences

1. Use the Mac you normally dictate on, the microphone you normally use, and a quiet room. Note the Mac model and the mic in your results.
2. Make a folder, for example `~/bench-real`, and copy `scripts/benchmark/sample/manifest.json` into it. Edit the scripts and expected text so the names are **yours and your colleagues'** (the names you really say), and keep the fillers in the script: say "um" and "uh" where they are written, as you would while thinking.
3. Aim for at least **30 dictation sentences** (a mix of short and long, with names, places, product names and a few web addresses) and **20 commands** in the commands you actually use. Fewer than that gives numbers too noisy to quote.
4. Record each sentence on its own, **16 kHz mono wav** if you can (the helper reads any file macOS can open, so QuickTime or Voice Memos exports work). Name the files as in the manifest. Say each one **once, naturally**: do not re-record because it sounded bad, or the results will look better than real life.
5. If several people record, keep one folder per speaker and report each separately. Accents are the point of the track.
6. Run the benchmark without `--ai` first, then with `--ai`, and keep both outputs.

## Reporting results

State: number of recordings, number of speakers, Mac and microphone, date, whether `--ai` was used, and the model name from the helper. Quote the table as measured and do not generalise beyond it.

## Limits

- Only English is scored. Telugu and Hindi are a later phase.
- The interpreter is measured without a screen, so commands that need on-screen names are not covered.
- The AI cleanup adds network variability: times and outputs can differ run to run.
- Word error rate against hand-written "expected" text depends on how that text is written (numbers as digits, "p.m." vs "pm"); the normaliser handles case and punctuation only.
