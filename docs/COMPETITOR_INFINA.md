# Competitor teardown: Infina (infina.so)

> Checked on 13 Nov 2026 from their website, docs, pricing, FAQ and llms.txt.
> Purpose: learn what they built, find what they do NOT do, and decide how Sayso beats them.

---

## 1. What Infina is (one line)

**Hands-free voice typing for Mac and Windows.** You talk, and it types, presses Enter, and opens apps. No key to hold. Built mainly for developers who prompt AI tools (Claude Code, Codex, Cursor) all day.

Company: Infina Labs, Inc. First version v1.0.0 on 13 Jul 2025. Now v1.45.13 (7 Nov 2026), so about 16 months old with 80+ releases. They ship fast.

## 2. How it works (the user flow)

The whole product is built around **3 spoken words**:

| You say | What happens |
|---|---|
| "**type** can we move the call to 3pm" | Types the words after "type" where your cursor is |
| "**send it**" or "**enter**" | Presses Enter |
| "**open** Claude" / "open Slack" / "open github.com" | Opens or switches to that app or website |

So your example works like this in Infina:

> "Open Claude" → "type build me a portfolio website with a dark theme" → "send it"

Infina only **types the prompt and presses Enter**. Claude does the actual work. Infina itself never does the task.

### Triggers and modes
- **Hands-free mode (their main feature, paid):** no key at all. Turn on by double-tapping Command (Mac) / Left Ctrl (Windows). An on-device listener waits for "type", "send it", "open", or the wake word **"Infina"**.
- **Wake word "Infina":** for any other command ("Infina, new tab"). The logo turns green; while green you can skip the word. It "naps" 1 minute after you stop talking.
- **Push-to-talk (free, unlimited):** hold fn (Mac) / Right Alt (Windows), talk, let go. This mode **only types**, no commands.

### Full command list (from their docs)
- Text: send / submit / press enter, new line, new paragraph, press escape, press tab, next field, press command + key, select all, select the line, select / delete the last word, delete the line, start over
- Apps and web: open app, open website, "open Chrome and go to x.com", start a meeting (Google Meet), new tab, close tab, next / previous tab, reload
- Windows: minimize, close / quit this
- System: show desktop, volume up / down / 50 / mute, lock screen, dark / light mode, take a screenshot, empty trash, next / previous song, pause / play music
- **Mac only:** "make this shorter" / "rewrite this" (rewrites selected text), click in the text box, new Terminal tab, new Finder window, new chat, next / previous chat, switch windows, next / previous desktop, scroll, go back / forward, "click Sign in" (in Safari/Chrome), "open the first result" (up to tenth), say commands in your own words, two commands in one sentence

### "Infina Remote" (experimental, Mac only, free)
Say the name of anything you can see and it presses it: buttons ("Reply", "Compose"), pop-ups ("Allow", "Not now"), menu options, links (first 2-3 words), list items ("second one", "open the second email"), email subjects or sender names, site search ("search invoices" on Gmail, Drive, GitHub, LinkedIn, Wikipedia), browser tabs ("go to the Figma tab").
- Reads button names through Accessibility. **No screenshots**, nothing sent off the Mac.
- **Asks "yes?" before** Send, Post, Delete, Pay, Buy, Sign out.

### AI cleanup ("Tami 1")
Their **own small AI model** that runs on the laptop. Removes "um", follows changes of mind, adds punctuation, makes lists. They claim 83/100 sentences cleaned correctly vs 51 for Gemma 3 1B and Llama 3.2 1B.

## 3. Technology choices we can see

| Area | Their choice | Why it matters |
|---|---|---|
| Speech to text | **On the device** (Apple Neural Engine on Mac; local model on Windows) | Works offline, private, no server cost per user. Only the first few minutes after install go to cloud servers while the model downloads |
| Wake / trigger listener | On device, always on in hands-free mode | Needs 4+ cores and 8 GB RAM on Windows; M1+ and macOS 14+ on Mac. No Intel Macs |
| Cleanup AI | Own tiny model, on device | No AI bill per user. On Windows needs 16 GB RAM |
| Commands | Understood and run on device | Fast, private, free to offer |
| Clicking things | macOS Accessibility + AppleScript for Chrome ("Allow JavaScript from Apple Events") | No vision, no screenshots |
| Updates | Checks every minute, installs silently when screen is locked; much of the UI loads from their website | Ships changes without new downloads |
| Install | .dmg, Homebrew, `curl | bash`, PowerShell one-liner | Developer-friendly |
| Sign-in | Google only | |

**Key business insight:** because everything runs on the user's laptop, their cost per user is close to zero. That is how they can give push-to-talk away free and unlimited.

## 4. Pricing

| Plan | Price | Includes |
|---|---|---|
| Free | $0 forever, no card | Unlimited push-to-talk with AI cleanup, **2,000 hands-free words**, hands-free commands free |
| Unlimited | **$8.25/month billed yearly ($99/yr)** | Unlimited hands-free words, team management, 7-day full refund |

Only "hands-free typing" is paid. Commands are free.

## 5. Marketing / growth (worth copying)

- **Huge SEO content machine:** dozens of "X vs Infina", "best X alternatives", "free dictation app" articles. Each page targets a search people actually do.
- **llms.txt for AI search:** a full file that tells ChatGPT/Claude/Perplexity exactly how to describe and recommend Infina. Every article also served as `.md`. This is a smart, cheap way to get recommended by AI assistants.
- Clear, short messaging: "Talk to your AI. Hands-free." / "Open. Type. Send it."
- Target: "people who prompt all day" (developers using Claude Code, Codex, Cursor).
- Discord community, public changelog.

### Instagram (@infinaai), checked 13 Nov 2026
- **52 posts, 2,833 followers**, follows 0. Bio: "Talk to your AI. Hands-free." + link to infina.so.
- **The same video, posted over and over:** one founder standing at a desk in a small room with the Claude app on screen, talking while the prompt types itself. Only the text hook on top changes: "typing ❌ talking ✅", "never type to claude again", "keyboard 🤬 → voice", "claude code, no hands".
- **Posting burst, not daily:** about 33 reels went up in ~13 hours (12 Nov 16:00 → 13 Nov 04:40 UTC). This looks like testing which hook the algorithm likes, not one video a day.
- **Views:** most reels get **150–1,800 views**. The newest ones have 1–500 so far. No reel goes viral.
- **Engagement on a ~1,800-view reel:** 12 likes, 8 comments, 4 shares.
- **Funnel:** the caption says *comment "app" and I'll send you the setup*. Comments are almost all just "App". That's an auto-DM tool (ManyChat-style) collecting leads.
- **What this tells us:** reach is small (a few thousand views a day at most). Their channel works mainly as a lead tool, not as a brand. Their other channels (SEO articles, llms.txt) probably bring in more users than Instagram.

### Second account @infinamoments ("Infina Reels"), watched 13 Nov 2026
- 474 posts, 153 followers, bio "talk to your ai hands-free". Same reel re-cut many times with different hooks ("keyboard 🤡 → voice 🗿", "typing 😮‍💨 talking 🤯", "never touch your computer again").
- 5 reels downloaded and transcribed locally (40–55 s each). **Format:** split screen. Top half is the Mac screen recording; bottom half shows the founder standing about 2 m from the desk, back to the camera, never touching the laptop. Each spoken phrase appears as a handwritten caption.
- **What he says, in order (typical reel):** "open Claude, type: hi, can you check the reviews of the new touchscreen MacBook on the community forums on Google… send it" → "go to Claude, type: give me a TL;DR, buddy, don't give me a full article… send it" → "open Chrome, go to Wikipedia, search for Elon Musk" → "personal life… public image… legal affairs… business career" (clicks Wikipedia section links by name) → "go to Codex, type: … send it" → "open OpenCode" → "Public GitHub" → "Submit" → "Yes" (answers a coding agent's question prompt by voice). Also "go to Slack, type: hi, this is a demo, send it" and "new chat".
- **What the demo proves:** fast app switching, prompting several AI agents in parallel, clicking links and options by name, and **answering an agent's approval/question prompt by voice** ("Public GitHub → Submit → Yes"). The wake word "Infina" is never heard; plain triggers ("open", "go to", "type", "send it") do everything.
- **Reel DfrN1cCAFuO (50 s, different room):** "go to Gmail, open the third email, go back, open the second email, go back, open the fourth email" → "open Terminal, type: can you give me an estimate of how long the test will take and report back once it's done so we can push to production, send it" (into Claude Code in the terminal) → "open Claude, type: … check Reddit sentiment about the new touchscreen MacBook launch… send it". He stands across a living room, far from the screen. Shows **inbox navigation by position** ("third email") and "go back". The terminal on screen is their own Claude Code session about shipping "Infina Remote" without breaking the free app (type, send, open, hands-free, push-to-talk, Windows), so they build Infina with AI coding agents.
- **What it does not show:** no multi-step task done on its own, no voice reply, no prompt writing help. The user still speaks every word and every click.

**What we copy and do better:** use the same "comment a word, get the link by DM" funnel, but make **different** demo videos (real tasks finished end to end, before/after timers, "built an app without touching the keyboard"). Post the same clips on Reels, Shorts, X, LinkedIn and TikTok.

## 6. What Infina does NOT do (our openings)

Taken from their own docs, they say it plainly:

1. **"It isn't a general assistant. It won't book a flight, write and send an email on its own, or do a task across several apps."** → No smart tasks, no multi-step tasks.
2. **Doesn't answer questions or read the screen out loud.** No voice replies.
3. **Doesn't send messages to people on its own.** You must type it, then say "send it".
4. **English only.** No Hindi, Telugu, Hinglish, or any other language.
5. **No phone, iPad, Android or Linux.**
6. **No Intel Macs.**
7. Push-to-talk **cannot run commands**, only typing.
8. Windows is weaker: no Remote, no "say it your own way", no rewrite.
9. Can't move/resize windows, sleep, or change brightness.
10. Clicking only works on things with a visible name; same-name buttons = it presses nothing. No vision fallback.
11. No multi-laptop story, no "which agent is done?" status, no reading back what Claude/Codex replied.
12. Writing a prompt still means **you** say the whole prompt. No help writing a better prompt.

## 7. How Sayso beats them (improvements)

### A. Match them first (must-have to compete)
These are now **table stakes**, because Infina already does them:
- Hands-free mode with **no key** (not only push-to-talk). Move this into **V1**, not V2.
- The simple "type / send it / open" flow. Keep our pause rule too, but also support a clear spoken prefix like "type".
- **On-device speech to text** (e.g. WhisperKit / Parakeet on Apple Neural Engine) so it works offline and costs us nothing per user. Our current plan uses a cloud speech provider; that would make us slower, less private and more expensive than Infina.
- Free unlimited push-to-talk with cleanup (or we lose on price).
- Press buttons by name, with "yes?" before risky buttons (we already planned this as safety levels).
- System commands (volume, lock, dark mode, music, screenshot).
- llms.txt + comparison articles from day one.

### B. Do what they refuse to do (our real advantage)
1. **Smart tasks:** "Open Claude and ask it to build a portfolio site in Next.js with a contact form, then send" → Sayso writes a **better, full prompt** from a short idea, types it, sends it. ("Prompt expansion" mode, user can preview first.)
2. **Multi-step tasks across apps** (our V2 plan): GitHub repo creation, Overleaf resume, "reply to the last email from Ravi saying yes", with a progress panel and Stop.
3. **Agent manager by voice:** run many agents (Claude Code, Codex, Cursor) and say "Sayso, which agents are done?", "read me what Claude Code said", "tell the second terminal to run the tests". Voice replies (text to speech) for short summaries. Infina explicitly can't answer or read the screen.
4. **Indian languages and Hinglish (later):** speak Telugu / Hindi / Hinglish → clean English prompt. Infina is English only. **Decision (13 Nov 2026): English first.** Languages come only after the English product works end to end and is stable.
5. **Multi-laptop:** each laptop has its own wake word (our existing plan). Infina has nothing for this.
6. **Vision fallback** when buttons have no name (our V3), so "click the blue button" works.
7. **Phone as a remote mic** later: talk into your phone, the laptop acts. Infina has no mobile.
8. **Personal workflows / macros:** "Sayso, start my day" → open Slack, Gmail, Linear, Claude Code in one go. User-defined voice shortcuts.
9. **Intel Macs and lower-RAM PCs** via a cloud fallback (paid), where Infina simply refuses.

### C. Pricing idea
- Free: unlimited push-to-talk + basic hands-free commands (match Infina).
- Pro (~$99/yr or ₹299-399/mo in India): unlimited hands-free + smart tasks + prompt expansion + multi-laptop.
- Smart tasks use cloud AI, so they cost us money: put them in Pro with a fair monthly limit.

## 8. Important cautions

- **Don't copy their brand, text, design, or the name "Infina"/"Tami".** Copy the *idea and features* (that is normal competition), but write our own website copy and design.
- They are 16 months ahead with 80+ releases. We should not try to beat them at "pure hands-free dictation" alone. We win on **smart tasks + agents + languages + multi-laptop**.
- On-device AI is hard engineering (model size, speed, battery). Plan time for it, or start with cloud speech and move on-device later, knowing that's a temporary weakness.
- Their "nothing leaves your computer" story is strong. Our smart tasks send data to cloud AI, so we need very clear privacy messaging ("only when you ask for a smart task").

## 9. Suggested changes to our docs (not done yet)

| Doc | Change |
|---|---|
| PRD §5 Competitors | Add Infina as the **closest competitor** (not Wispr Flow) |
| PRD §7.1 Triggers | Make hands-free (no key) a V1 feature; add "type" prefix trigger |
| PRD §8 V1 | Add system commands, press-button-by-name, on-device STT |
| PRD V2 | Add prompt expansion, agent manager, voice read-back |
| PRD V4 | Keep languages in V4: English must be stable end to end first |
| TECHNICAL_ARCHITECTURE | On-device STT (WhisperKit/Parakeet) + on-device wake word; cloud LLM only for smart tasks |
| Pricing | Free unlimited push-to-talk to match Infina |
