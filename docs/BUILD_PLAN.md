# Build plan and final tech stack

> Decided 13 Nov 2026. All docs were updated to match this file. **If anything ever disagrees, this file wins.**
> Product name is still TBD (shortlist: Vaani, Kairo). Code uses `sayso` until it is chosen.

## 1. Final tech stack

### Desktop app (Mac first, Windows later)
| Part | Choice | Why |
|---|---|---|
| App shell | **Electron + electron-vite, TypeScript (strict), React + Tailwind** | One codebase for Mac and Windows; full access to mic, hotkeys and other apps (a website/Next.js cannot do this) |
| Mac helper | **Swift 6** package, child process over stdio | Fn hotkey, mic, Accessibility read/press, synthetic keys, paste, open apps |
| Windows helper | C# / .NET (UI Automation) | Later, same job as the Mac helper |
| Speech-to-text | **WhisperKit on the Apple Neural Engine** (runs inside the Swift helper), word timestamps on | On-device: free per user, offline, private. Cloud STT only as a fallback adapter |
| Wake word | **openWakeWord** (on device) | Hands-free mode |
| Text cleanup + smart tasks | **Gemini API (Flash)** behind one `LLMProvider` interface | Free tier while building; switch to Claude or another model by adding one provider file |
| On-device AI (later) | Gemma (small model, local) | Cleanup and text-vs-command check without cloud cost |
| Local data | `better-sqlite3`, `zod` | History, dictionary, settings |
| Tests | Vitest (TypeScript), Swift Testing / XCTest | |
| Packaging and updates | electron-builder, electron-updater, Apple notarization | Needs Apple Developer account (~$99/yr) only before shipping to users |

### Cloud (only from Phase 2): everything on Cloudflare
**Final (13 Nov 2026). One language (TypeScript), one UI library (React), one cloud (Cloudflare). Do not switch frameworks or hosts without a clear reason.**

| Part | Choice |
|---|---|
| Domain + DNS + security | **Cloudflare** (Registrar at cost, DDoS protection, HTTPS, firewall) |
| Website (frontend) | **React + Vite + Tailwind** (same tools as the desktop app UI), hosted on **Cloudflare Pages** (free, commercial use allowed) |
| Backend API | **Hono + TypeScript on Cloudflare Workers** (free tier; our API mostly forwards requests to Gemini, which fits Workers well) |
| Database | **Cloudflare D1** (serverless SQLite): users, plans, usage counts, synced settings |
| Sign-in | **Firebase Auth** (Google sign-in, free); Workers verify the Firebase token |
| Secrets | Cloudflare Workers secrets (Gemini key lives only on the server, never in the app) |
| AI | **Gemini API**, called only from the Worker, behind the `LLMProvider` interface |
| Payments | Stripe |
| App downloads + updates | Cloudflare R2 |
| Crashes / analytics | Sentry, PostHog |

### Repository layout (one monorepo, pnpm)
```
apps/desktop/        # Electron + React (the product)
native/mac-helper/   # Swift helper
apps/web/            # React + Vite website (Cloudflare Pages)
services/api/        # Hono API (Cloudflare Workers) + D1 migrations
packages/shared/     # shared TypeScript types (plans, usage, API contracts)
packages/command-grammar/, packages/helper-protocol/
```

### Cost while building
- On-device speech, wake word, local AI: **free**.
- Gemini API: **free tier** for development. Only test data on the free tier. Free-tier limits are per API key, so before real users we move to paid Gemini (pay per use, no monthly fee).
- Cloudflare (Pages, Workers, D1, R2) and Firebase Auth: free tiers cover a small beta.
- Paid items only near launch: domain (~$10-15/yr for .com), Apple Developer (~$99/yr).

## 2. How we work (founder rules)
1. **Ship small, show often.** Every phase ends with something we can demo in a short video.
2. **Use it ourselves every day.** We are the first users; if we don't use it, nobody will.
3. **Talk to users before adding features.** Each new feature needs a real user asking for it or a clear gap vs Infina.
4. **One stack, no switching.** TypeScript + React + Electron + Swift helper + Cloudflare + Gemini. Change only with a strong reason.
5. **Measure one thing per phase** (listed below) and decide the next phase from it.

**Who does what**
- **Gopal Krishna:** product, AI (Gemini, cleanup, smart tasks), Electron app, website, marketing videos, user calls.
- **Kesava:** Swift helper (hotkeys, mic, Accessibility, clicks), testing every command in real apps, bug list.

## 3. Phases (step by step)

### Phase 0: Prototype on our own Mac
1. Create the monorepo and git repo; scaffold Electron + React + Swift helper.
2. Hold Fn → record → WhisperKit transcribes on device → text is pasted into the focused app.
3. Gemini cleanup (fillers, grammar, app-aware tone) behind `LLMProvider`.
4. Pause rule: "send" / "enter" / "new line" said alone after a pause runs as a command.
5. Preview chip with Esc to cancel; safety levels; never type into password fields.
6. Instant commands without AI: send, undo, copy, paste, click *label*, open *app/site*, new tab, switch app, scroll.
7. Local SQLite history and dictionary; Mic + Accessibility onboarding.
- **Done when:** we can write and send a Slack message and a Claude prompt without touching the keyboard.
- **Measure:** do we both use it daily ourselves?

### Phase 1: Match Infina (core product)
1. Hands-free mode with no key: "type …", "send it" / "enter", "open / go to …", plus the wake word.
2. Press by name: buttons, links, menu items, pop-up options ("Yes", "Allow", "Submit"), with a "yes?" check before risky ones.
3. Position navigation: "open the third email", "first result", "go back".
4. System commands: volume, lock, dark mode, screenshot, music.
5. Settings window, history view, personal dictionary.
6. Record our first demo videos (split screen, real tasks) and start posting.
- **Done when:** every command in Infina's reels works in Sayso, in the same apps.
- **Measure:** command accuracy and speed in our own daily use.

### Phase 2: First real users
1. Hono API on Cloudflare Workers + D1; Firebase Google sign-in; Gemini key moved to the server.
2. Usage tracking and limits per user.
3. Signed and notarized Mac app; auto-update from R2.
4. Website + waitlist on Cloudflare Pages; llms.txt and the first comparison pages.
5. Invite 20-30 heavy typers (developers, founders) from our network; talk to each one.
6. Fix the top complaints first; keep posting demo videos daily.
- **Done when:** outside users install it, sign in and use it without our help.
- **Measure:** share of beta users still using it daily (target 40%+).

### Phase 3: Beyond Infina (our edge)
1. Prompt expansion: a short spoken idea becomes a complete prompt, with preview.
2. Smart multi-step tasks with a progress panel and Stop.
3. Agent manager by voice: "which agents are done?", "tell the second terminal to run the tests".
4. Voice read-back of short replies.
5. Chrome extension for reliable clicking in web apps.
- **Done when:** one sentence finishes a real multi-step task on camera.
- **Measure:** how many users use smart tasks regularly.

### Phase 4: Money and launch
1. Stripe: Pro plan ($99/yr overseas, ₹399/mo India); free tier word limit decided.
2. Start charging when the Phase 2 retention target is met.
3. Public launch: Product Hunt, Show HN, Reddit, LinkedIn, X, Instagram reels.
4. Referral: free Pro month per invite.
- **Measure:** free → paid conversion (target 10%+).

### Later
Windows helper, vision fallback for unlabeled buttons, phone as a remote mic, multi-laptop wake words, teams plan, languages (only after English is stable end to end).

## 4. Decisions still open
- Product name (shortlist: Vaani, Kairo) → check domain and trademark.
- Free tier word limit.
