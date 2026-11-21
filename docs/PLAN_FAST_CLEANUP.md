# Plan: faster AI cleanup

Written 14 Nov 2026 after reviewing Infina's recordings. **Nothing here is built yet.** Numbers are measured on this Mac (Apple M5, 16 GB, macOS 27.0.1) unless marked *estimate*.

## Status
- **Step 1 is built (14 Nov 2026):** connection warm-up when Fn is released, and skipping the AI for short clean text (`SAYSO_SKIP_AI=off` turns it off). Results on this Mac: the warm-up saves about 0.2 s (median 0.94 s vs 1.13 s in an A/B of 4 + 4 calls); Electron's own `net.fetch` was **not** better than Node's `fetch` (1.1–1.4 s every call), so Node's stays. The skip rule would have skipped **5 of the 19** real dictations (26%, not the third I first estimated: most of them are long) and all 5 matched the AI's text. Added to measure it: each History row now records how it was cleaned up and how long that took, and the History tab shows median / slowest-5% speed and how often the AI was skipped.
- **Step 2 measured (14 Nov 2026, Groq free account, our real cleanup prompt):** the account has no small "instant" Llama; the usable models are reasoning models, which must be told to think less. **`qwen/qwen3.8-27b` with `reasoning_effort: "none"`: median 0.2 s on five test cases (165–308 ms) and 0.24 s on 18 real dictations (slowest 0.40 s for 110 words); 0.2 s again after 6 s idle (the connection is reused). About 4× faster than Gemini (0.6–0.95 s warm, 1–2 s in real use).** `gpt-oss-120b` with low reasoning: 0.5 s, and it distorted a long dictation ("not a billing counters" → "something like a billing counter"); `gpt-oss-20b` returns empty text unless reasoning is turned down, then 0.35–0.56 s but leaves text uncleaned. Quality of Qwen: identical to Gemini on short and medium text (overlap 1.00); on long rambling dictations it paraphrases more (drops hedges and "or how?", "real old example" → "real-world example"). A firmer rule ("keep the speaker's wording, do not paraphrase, merge or drop") helped on long ones (overlap 0.69 → 0.95, 0.74 → 0.92) for +0.07 s; use it. **Free-tier limits:** about 7,000 input tokens per minute (our prompt is ~620 tokens per call, so roughly 7–10 dictations a minute) and about 1,000 requests; a 429 must fall back to Gemini. Text goes to Groq as well as Google.
- **Recommendation for step 2:** add Groq + Qwen as the primary cloud provider with Gemini as automatic fallback (429, timeout or error), the firmer fidelity rule in the prompt, the model set by `SAYSO_FAST_MODEL` (Groq's model list changes), and a warm-up like Gemini's. Needs your OK on sending text to a second company.
- **Step 2 is built (15 Nov 2026):** Groq + Qwen first, Gemini as the automatic fallback (see CHANGELOG). Live through the real code on this Mac: **213–350 ms** per cleanup via Groq; with a deliberately broken Groq key the chain fell back to Gemini and still answered (1.2 s). `SAYSO_AI_PROVIDER=gemini` keeps text away from Groq.
- Steps 3–4 wait for the decisions at the end of this plan.

## The problem
Infina's AI cleanup "adds about 0.2–0.25 seconds to a typical sentence" (their own small model). Ours adds **0.8–2 s** (Gemini over the internet). Cleanup now takes longer than speech-to-text (0.5–1.3 s) and is the slowest step a user feels.

## What we measured
| What | Result |
|---|---|
| Gemini Flash-Lite, connection already open, one sentence | **0.6–0.95 s** (server time; a shorter prompt does not help: 0.73–1.0 s) |
| Gemini after the connection went idle (8 s) | 0.97–1.5 s. A new connection costs **+0.25–0.5 s** (connect + TLS alone: 0.22–0.29 s). Dictations are usually more than 4 s apart, so every one pays it |
| Apple's built-in on-device model (FoundationModels), our full 540-token prompt | 0.5–1.2 s; first request after launch 2.1 s (model load). Quality uneven: echoed a 45-word dictation uncleaned |
| Same model, short prompt (~90 tokens) | **0.35–0.5 s** per sentence, 0.8–1.1 s for ~45 words. **Sloppy:** numbered "First of all…" as a list, dropped words, summarised the long one |
| Same model, short prompt + 3 examples | 0.4–0.8 s; better but still shortened a long dictation and over-listed "first of all" |
| Your 19 real dictations: what local rules alone give | identical text 6 (32%); only capitals/punctuation differ 2 (11%); the AI changed words **11 (58%)**, mostly 40–100-word dictations |

So: Gemini cannot reach 0.2 s (its floor is ~0.6 s); a generic small model is fast enough but not careful enough; and your long dictations are where the AI matters most and where every option is slowest (output length).

## Options
| | Speed | Quality | Cost / effort | Notes |
|---|---|---|---|---|
| **A. Quick wins on the current path** | 0 ms for short clean utterances; others ~0.6–0.95 s (from 0.8–2) | unchanged | ~1 day, no new services | Warm the connection when Fn goes down (hidden behind your speaking); skip the AI when the text is short and needs nothing it can do (see below) |
| **B. A fast hosted model** (Groq, Cerebras: Llama-class 8B) behind our `LLMProvider` | *estimate* 0.25–0.4 s end to end | good (8B is much better than a 3B on-device) | ~0.5 day to test, one provider file; needs a key | Text goes to another company (it already goes to Google). Must be measured with a real key before deciding |
| **C. Apple's on-device model** as a provider (helper `cleanText` request) | 0.4–1.1 s | needs guard rails (word-retention check, no list unless numbered speech was detected, fall back to A/B on doubt) | 2–3 days | Free, offline, private, **no API key**: a good default for users who skip setup. Needs macOS 26+ with Apple Intelligence on; check availability and fall back |
| **D. Our own small model** (the Infina approach, ~0.1–0.5B parameters, fine-tuned) | *estimate* 0.1–0.25 s per sentence, ~0.4 s for 100 words | can match or beat big models on this one narrow task | weeks: training data (generate pairs with Gemini plus your History), fine-tune with MLX on this Mac, ship through the helper, a benchmark like Infina's 83/100 | The real moat. Cross-platform later needs another runtime (ONNX / llama.cpp) |
| E. Insert the local text at once, replace it when the AI finishes | looks instant | cursor and undo history can break | — | **Not recommended** |

## Recommended order
1. **A, now.** Two changes:
   - *Warm-up:* when recording starts, open the connection to the AI service (a cheap request). Expected saving 0.25–0.5 s on most dictations.
   - *Skip the AI when it cannot help:* short (about 12 words or fewer), already punctuated, and none of: fillers (um, uh, you know, I mean, like), correction cues (no, sorry, actually, scratch that), numbering cues (first/second, number one), spoken "new line / new paragraph". Check the rule against your History first: of 19 dictations, 6 were identical with local rules, so expect to skip roughly a third. Show the skip in the log (`[cleanup] local (no AI needed)`) and keep a setting to turn it off.
   - Done when: p50 cleanup time over a day of use drops under ~0.5 s, and no History row got worse.
2. **B, a 30-minute test** as soon as you have a free Groq or Cerebras key: measure the same prompt. If it is 0.3–0.4 s and good on your dictations, make it the default cloud provider (Gemini stays as the fallback).
3. **C, as the keyless and offline tier.** Build with guard rails; measure how often the guard rejects its answer on your History. Ship as default only if it rarely does.
4. **D, decide after 1–3.** Start by building an evaluation set from your History (raw → what you wanted), because both the guard rails in C and any trained model need it.

## How to measure (so we know it worked)
- The app already logs `[cleanup] <method> in N ms` and History stores total latency. Add p50 and p95 per method to the History tab footer, or read them from the database.
- Keep a fixed evaluation file of 30–50 real dictations (raw and what you wanted) in `apps/desktop/src/main/core/cleanup/fixtures/`; run each option against it for speed and for "words kept".

## Decisions needed from you
1. Are you willing to create a free Groq (or Cerebras) key for the test in step 2?
2. Is sending your dictation text to a second company acceptable if it is much faster, or should we stay with Google only?
3. Should the AI be skipped for short clean text by default (step 1), or only as an opt-in setting?
4. Is "needs macOS 26+ with Apple Intelligence" fine for the on-device tier, given it falls back to the cloud?
