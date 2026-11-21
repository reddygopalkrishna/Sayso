# Sayso: Technical Architecture

> Version 0.2, 13 Nov 2026. Audience: engineers and Claude Code building the product.
> Matches [BUILD_PLAN.md](BUILD_PLAN.md) (final stack and phases). Related: [PRD.md](PRD.md) · [ARCHITECTURE_FLOW.md](ARCHITECTURE_FLOW.md)
> Product name is TBD (shortlist: Vaani, Kairo). Code uses `sayso` until it is chosen.

---

## 1. Principles

1. **Instant first.** Instant commands never call an AI model. They run through a local rule engine in < 300 ms.
2. **On device by default.** Speech-to-text, wake word, commands and actions all run on the user's Mac. The cloud is used only for AI text cleanup and smart tasks.
3. **Works everywhere without integrations.** Act through macOS Accessibility and a Chrome extension, like a human would.
4. **Safety is a layer, not a feature.** Every action passes through one Safety Gate.
5. **Privacy by default.** Audio never leaves the device; history stays local; no screen content is sent except for smart tasks the user starts.
6. **One language, thin native code.** All product logic in TypeScript; the Swift helper only does OS calls.
7. **Never ship secrets in the client** once real users exist (Phase 2+). The Gemini key lives only in the backend.
8. **Modular.** Each stage (trigger → audio → STT → router → engine → safety → action) is a module with a clear interface and its own tests.

## 2. System overview

```
┌──────────────────────────────── Mac (client) ─────────────────────────────────┐
│  Swift helper (OS calls)                Electron main process (TypeScript)    │
│  ─────────────────────────              ───────────────────────────────────── │
│  Fn hotkey / wake word ──► trigger ──►  IntentRouter (pause rule, "type",     │
│  Mic capture + VAD                        "send it", "open")                  │
│  WhisperKit STT (word timings) ──────►  CommandEngine (no AI, < 300 ms)       │
│  Context (app, focused element)          TextCleanup ──► LLMProvider (Gemini)  │
│  AX read / press, keys, paste  ◄──────  SafetyGate ──► actions                │
│  Open apps / URLs                        AppResolver · SmartTasks (Phase 3)   │
│                                          SQLite (better-sqlite3): history,     │
│  Renderer (React): pill, chip,           dictionary, settings, resolver memory │
│  settings, onboarding                                                          │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │ HTTPS + Firebase ID token (Phase 2+)
┌──────────────────────────────────▼──────────── Cloudflare ────────────────────┐
│  Workers (Hono API): /me, /cleanup, /plan, /usage, Stripe webhook             │
│  D1 (users, plans, usage) · R2 (app downloads, updates) · Pages (website)     │
└──────────────┬──────────────────────────────┬─────────────────────────────────┘
               ▼                              ▼
        Gemini API (Google)            Firebase Auth (Google sign-in) · Stripe
```

**Phases 0-1:** no backend. The Electron main process calls Gemini directly with a developer key stored locally (never in the renderer, never committed).

## 3. Tech stack

### 3.1 Desktop app (Electron, TypeScript)
| Concern | Choice | Notes |
|---|---|---|
| Shell | **Electron (latest stable) + electron-vite** | One codebase for Mac and Windows |
| Language | **TypeScript strict** | All product logic |
| UI | **React + Tailwind** | Listening pill, preview chip, confirm dialog, progress panel, settings, onboarding |
| Local DB | **better-sqlite3** | History, dictionary, snippets, resolver memory, app profiles |
| Validation | **zod** | Helper messages, config, API responses |
| Secrets | Electron `safeStorage` (Keychain-backed) | Dev Gemini key (Phases 0-1), auth tokens (Phase 2+) |
| AI | **`LLMProvider` interface**; `GeminiProvider` first (Gemini Flash; exact model chosen at build time) | A `ClaudeProvider` can be added later without touching other code |
| Auto-update | **electron-updater**, files hosted on Cloudflare R2 | Phase 2 |
| Packaging | **electron-builder**, Developer ID signing + notarization | Phase 2 (needs Apple Developer account) |
| Crashes / analytics | Sentry (Electron SDK), PostHog (events and timings only, no content) | Phase 2 |
| Min OS | macOS 14+, Apple Silicon first | Intel Macs later via a cloud STT fallback |

### 3.2 Mac helper (Swift 6)
Long-lived child process of Electron, talking over **stdio**: newline-delimited JSON for commands/events, length-prefixed binary frames where needed. Protocol defined once in `packages/helper-protocol`.

| Concern | Choice |
|---|---|
| Hotkeys | `CGEventTap` (Fn hold, double-tap for hands-free) |
| Audio | `AVAudioEngine`, 16 kHz mono PCM, 300 ms pre-roll |
| VAD | Silero VAD (ONNX) for pause timing |
| Speech-to-text | **WhisperKit** on the Apple Neural Engine, word timestamps on |
| Wake word | **openWakeWord** (ONNX), on device only (Phase 1) |
| Accessibility | `AXUIElement` (`AXPress`, `AXValue`, focused element, roles) |
| Input | `CGEvent` keys and clicks; paste via pasteboard + ⌘V with clipboard restore |
| Apps | `NSWorkspace` (open apps/URLs, frontmost app) |

### 3.3 Chrome extension (Phase 3)
Manifest V3, TypeScript, Vite build. Talks to the app through a **Native Messaging** host. Content script finds elements by accessible name/role/text and clicks, focuses or reads them. Permissions: `nativeMessaging`, `activeTab`, `scripting`, `tabs`.

### 3.4 Cloud (Phase 2+): all on Cloudflare
| Concern | Choice |
|---|---|
| API | **Hono + TypeScript on Cloudflare Workers** |
| Database | **Cloudflare D1** (SQLite) with SQL migrations |
| Sign-in | **Firebase Auth** (Google sign-in). Workers verify the Firebase ID token (Google public keys, `jose`) |
| Secrets | Cloudflare Workers secrets (Gemini key, Stripe keys) |
| AI | Gemini API, called only from the Worker |
| Payments | Stripe (Checkout, Customer Portal, webhooks) |
| Website | **React + Vite + Tailwind on Cloudflare Pages** (landing, waitlist, pricing, account, privacy, llms.txt) |
| Downloads + updates | Cloudflare R2 |
| Domain, DNS, security | Cloudflare (Registrar, DDoS protection, HTTPS, firewall rules) |

Why not a Node.js server: speech-to-text runs on the device, so the backend only handles short requests (sign-in check, AI calls, usage, payments). Workers fit this and are free at our scale. Hono also runs on Node.js, so we can move later without a rewrite.

### 3.5 Tooling
- Monorepo with **pnpm workspaces** + SwiftPM for the helper.
- CI: **GitHub Actions** (macOS runner for app + helper; Linux for API + web).
- ESLint + Prettier, TypeScript strict; swift-format.
- Tests: **Vitest** (TypeScript), Swift Testing / XCTest (helper), Playwright (extension + web, later).

### 3.6 Later platforms
| Platform | Choice | Scope |
|---|---|---|
| Windows | C# / .NET helper (UI Automation, SendInput, keyboard hook), same Electron app | Same features as Mac |
| Mobile | **React Native** app, same Cloudflare backend and shared TypeScript types | Voice keyboard or remote mic for the laptop (phones do not allow controlling other apps) |

## 4. Repository layout

```
sayso/
├── CLAUDE.md
├── docs/
├── apps/
│   ├── desktop/                    # Electron app
│   │   └── src/
│   │       ├── main/
│   │       │   ├── core/
│   │       │   │   ├── router/     # IntentRouter + pause rule + hands-free triggers
│   │       │   │   ├── commands/   # CommandEngine, loads commands.json
│   │       │   │   ├── safety/     # SafetyGate, context rules
│   │       │   │   ├── cleanup/    # TextCleanup + LLMProvider (gemini.ts, later claude.ts)
│   │       │   │   ├── stt/        # STTProvider (helper WhisperKit; cloud fallback later)
│   │       │   │   ├── resolver/   # AppResolver ("open GitHub")
│   │       │   │   ├── tasks/      # SmartTasks planner + step runner (Phase 3)
│   │       │   │   └── storage/    # better-sqlite3 schema + repositories
│   │       │   ├── helper/         # spawns and talks to the Swift helper
│   │       │   └── windows/        # pill, chip, settings BrowserWindows
│   │       ├── preload/
│   │       └── renderer/           # React UI
│   ├── web/                        # React + Vite website (Cloudflare Pages)
│   └── chrome-extension/           # Phase 3
├── native/
│   ├── mac-helper/                 # Swift package: SaysoHelper
│   └── windows-helper/             # later (do not create yet)
├── services/
│   └── api/                        # Hono on Cloudflare Workers + D1 migrations (Phase 2)
├── packages/
│   ├── shared/                     # shared TS types (plans, usage, API contracts)
│   ├── command-grammar/            # commands.json (single source of truth)
│   └── helper-protocol/            # message types shared by app and helper
└── .github/workflows/
```

## 5. Modules

| Module | Where | Responsibility | Key types |
|---|---|---|---|
| **Triggers** | Helper | Fn hold, double-tap (hands-free), wake word; emits `TriggerEvent(start/stop, mode)` | `TriggerEvent` |
| **AudioCapture** | Helper | Mic capture, VAD speech/silence events, pre-roll | |
| **Transcription** | Helper (WhisperKit) → main | Final transcript with per-word start/end | `TranscriptSegment{words:[{text,start,end,confidence}]}` |
| **ContextProvider** | Helper | Frontmost app bundle ID, window title, focused element role, password/terminal/meeting detection | `AppContext` |
| **IntentRouter** | Main | Pause rule on the raw transcript; hands-free prefixes ("type …", "send it", "open …"); splits dictation text from a trailing command | `RoutingDecision` |
| **CommandEngine** | Main | Match to grammar (exact + synonyms + fuzzy), extract args ("press *Submit*", "open the *third* email") | `CommandMatch{id, args, confidence}` |
| **TextCleanup** | Main | Raw text + tone profile + dictionary → `LLMProvider.cleanup()`; Light mode done locally | `CleanupRequest` |
| **SmartTasks** | Main (Phase 3) | Utterance + context → `LLMProvider.plan()` → steps run with progress panel, clarification and Stop | `Plan`, `Step` |
| **AppResolver** | Main | "open X" → app / URL / ask once; remembers choices | `ResolveResult` |
| **SafetyGate** | Main | Safe / Normal / Risky / Blocked from registry + context → run / chip / confirm / refuse | `SafetyDecision` |
| **ActionLayer** | Main → helper | Insert text, key presses, press element by label or position, open app/URL, browser actions | `Action` |
| **Storage** | Main | better-sqlite3 + migrations + repositories | §8.1 |

### 5.1 Core action model (TypeScript)
```ts
type Action =
  | { type: "insertText"; text: string }
  | { type: "keyPress"; key: Key; modifiers?: Modifier[] }          // enter, ⌘Z, ⌘T
  | { type: "pressElement"; label?: string; index?: number; role?: string } // "press Submit", "open the third email"
  | { type: "openApp"; bundleId: string }
  | { type: "openURL"; url: string; browser?: string }
  | { type: "browser"; command: BrowserCommand }                     // via Chrome extension (Phase 3)
  | { type: "scroll"; direction: "up" | "down"; amount: number }
  | { type: "switchApp"; bundleId: string }
  | { type: "system"; command: "volume" | "mute" | "lock" | "darkMode" | "screenshot" | "media"; value?: string };

type SafetyLevel = "safe" | "normal" | "risky" | "blocked";
```

### 5.2 Command grammar (single source of truth)
`packages/command-grammar/commands.json`:
```json
{
  "id": "send",
  "phrases": ["send", "send it", "send that"],
  "endOfUtteranceOnly": true,
  "action": { "type": "contextual_send" },
  "safety": "normal",
  "blockedIn": ["com.apple.Terminal", "com.googlecode.iterm2"]
}
```
`contextual_send` = Enter in chat apps; in mail apps the AX Send button or ⌘⏎ (per-app `send_strategy`).

### 5.3 Pause rule (IntentRouter)
```
given words w[0..n] with timings, mode = dictation:
  last = w[n]
  gap  = last.start - w[n-1].end
  if CommandEngine.isEndCommand(last.text)            # "send", "enter"
     and gap >= user.pauseThreshold (default 600 ms)
     and SafetyGate.allowedIn(context, command):
       dictation = w[0..n-1]; trailing = command
  else:
       dictation = all words; trailing = none
```
Multi-word end commands ("new line", "send it") use the gap before their first word. In hands-free mode, "type …" marks everything after it as text, so the pause rule is not needed there.

## 6. Backend API (Phase 2+, Hono on Workers)

All endpoints under `/v1`, JSON, `Authorization: Bearer <Firebase ID token>` except webhooks.

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/me` | Profile, plan, limits, words left today |
| POST | `/v1/devices` | Register device (name, OS, app version) |
| POST | `/v1/cleanup` | Text cleanup via Gemini (streamed) |
| POST | `/v1/plan` | Smart task planning (Phase 3) |
| POST | `/v1/usage` | Batched usage counts (words, commands, tasks) |
| GET/PUT | `/v1/settings` | Synced settings (opt-in) |
| POST | `/v1/billing/checkout` | Stripe Checkout session |
| POST | `/v1/billing/portal` | Stripe Customer Portal session |
| POST | `/v1/webhooks/stripe` | Stripe webhooks (plan changes) |

Every AI endpoint checks a **per-user daily cap** before calling Gemini, even during the free beta.

### 6.1 Cleanup contract
Input: `{rawText, toneProfile: "casual"|"professional"|"literal", dictionary:[…], appName}`. Output: cleaned text only. Rules: keep meaning, apply self-corrections, never add content, never answer questions in the text, keep code identifiers and dictionary terms exact. Model: Gemini Flash, streaming.

### 6.2 Planner contract (Phase 3)
Gemini with **function calling**. Functions map 1:1 to `Action` types plus `ask_user(question, options)` and `read_screen(scope)`. Returns `{steps:[{tool, args, safety}], clarification?}`. The client always re-checks safety locally; the server's safety field is advisory only.

## 7. macOS permissions and distribution

### 7.1 Permissions
| Permission | Why | When requested |
|---|---|---|
| **Microphone** | Capture speech | Onboarding step 1 |
| **Accessibility** | Read UI elements, press buttons, keys, insert text | Onboarding step 2 |
| **Input Monitoring** | Global Fn detection via event tap | Onboarding step 2 (if needed) |
| **Automation (Apple Events)** | Optional browser/Mail control | On first use |
| **Screen Recording** | Vision fallback only | Later, on first use |

### 7.2 Signing and distribution (Phase 2)
- **Not sandboxed** (sandbox blocks Accessibility control), so distributed **outside the Mac App Store** as a signed + notarized DMG from our website.
- Hardened Runtime on; audio-input and apple-events entitlements.
- Auto-updates with electron-updater from Cloudflare R2.
- Chrome extension on the Chrome Web Store (Phase 3).

### 7.3 Accounts needed
| When | Accounts |
|---|---|
| Phases 0-1 | Google AI Studio (Gemini key), GitHub |
| Phase 2 | Cloudflare, Firebase, Stripe, Sentry, PostHog, Apple Developer Program (~$99/yr), domain |
| Phase 3 | Chrome Web Store developer account |

## 8. Data schema

### 8.1 Local (better-sqlite3, on device)
```sql
CREATE TABLE utterance_history (
  id            TEXT PRIMARY KEY,          -- UUID
  created_at    INTEGER NOT NULL,          -- unix ms
  app_bundle_id TEXT,
  mode          TEXT NOT NULL,             -- dictation | command | smart_task
  raw_text      TEXT,                      -- stored locally only
  final_text    TEXT,
  actions_json  TEXT,
  outcome       TEXT NOT NULL,             -- done | cancelled | blocked | failed
  latency_ms    INTEGER
);
CREATE TABLE dictionary_entry (
  id TEXT PRIMARY KEY, phrase TEXT NOT NULL, spoken_as TEXT,
  updated_at INTEGER NOT NULL, synced INTEGER DEFAULT 0
);
CREATE TABLE snippet (
  id TEXT PRIMARY KEY, trigger TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
  updated_at INTEGER NOT NULL, synced INTEGER DEFAULT 0
);
CREATE TABLE resolver_memory (
  phrase TEXT PRIMARY KEY, target_type TEXT NOT NULL,   -- app | url
  target TEXT NOT NULL, browser TEXT, updated_at INTEGER NOT NULL
);
CREATE TABLE app_profile (
  bundle_id TEXT PRIMARY KEY,
  tone TEXT NOT NULL DEFAULT 'casual',     -- casual | professional | literal
  actions_enabled INTEGER DEFAULT 1,
  send_strategy TEXT                       -- enter | cmd_enter | ax_button
);
CREATE TABLE adaptive_stats (
  key TEXT PRIMARY KEY, value REAL NOT NULL, updated_at INTEGER NOT NULL
);
```
History keeps the last 50 rows (configurable); the user can clear it at any time.

### 8.2 Cloud (Cloudflare D1, SQLite, Phase 2+)
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,                     -- Firebase UID
  email TEXT UNIQUE, name TEXT, country TEXT,
  plan TEXT NOT NULL DEFAULT 'free',       -- free | beta | pro_yearly | pro_monthly_in
  created_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE devices (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT, os_version TEXT, app_version TEXT, wake_word TEXT,
  last_seen_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  stripe_customer_id TEXT, stripe_subscription_id TEXT,
  status TEXT,                             -- active | past_due | canceled
  current_period_end INTEGER
);
CREATE TABLE usage_daily (
  user_id TEXT NOT NULL, day TEXT NOT NULL, -- YYYY-MM-DD
  words INTEGER DEFAULT 0, commands INTEGER DEFAULT 0,
  smart_tasks INTEGER DEFAULT 0, ai_calls INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY, settings_json TEXT, updated_at INTEGER
);
CREATE TABLE waitlist (
  email TEXT PRIMARY KEY, source TEXT, created_at INTEGER NOT NULL
);
```
**No transcripts, audio or screen content are stored in the cloud.**

## 9. Latency budget (instant command "send")

| Stage | Budget |
|---|---|
| Trigger release → final transcript (WhisperKit, on device) | 150-250 ms |
| Pause rule + command match (local) | 5 ms |
| Safety Gate + chip decision | 5 ms |
| Action execution (CGEvent / AXPress) | 20 ms |
| **Total (excluding the deliberate ~1 s preview chip)** | **< 300 ms** |

Dictation with Full cleanup: transcript + Gemini first tokens + insert ≈ **0.5-0.8 s**. Benchmark WhisperKit model sizes in Phase 0 and pick the smallest one that meets accuracy.

## 10. Security
- Renderer: `contextIsolation: true`, `nodeIntegration: false`, preload IPC only. Keys never reach the renderer.
- Phases 0-1: dev Gemini key in a git-ignored local config or `safeStorage`. Never committed.
- Phase 2+: Gemini and Stripe keys only in Workers secrets; app sends a Firebase ID token; per-user rate limits and daily caps in the Worker.
- Cloudflare in front of everything (HTTPS, DDoS protection, firewall rules).
- Native messaging host accepts only our published extension ID.
- Never type into secure text fields (`AXSecureTextField`); never log content remotely.
- Blocked list enforced on device even if the planner suggests an action.
- Signed and notarized releases; Dependabot.

## 11. Testing strategy
| Layer | Tests |
|---|---|
| IntentRouter / pause rule | Table-driven tests with synthetic word timings ("send me a flower", "reply send", "… [700 ms] send", "type … send it") |
| CommandEngine | Grammar coverage, fuzzy thresholds, position args ("third email") |
| SafetyGate | Every command × context (Terminal, meeting app, password field, Mail) |
| ActionLayer / helper | Integration tests against a test app with known buttons |
| API (Phase 2) | Vitest with Workers test runtime and a local D1; contract tests for `/cleanup`, `/plan` |
| End-to-end | Recorded audio fixtures → expected actions (regression suite) |
| Performance | Latency per stage on a macOS CI runner; alert if p95 regresses |

## 12. CI/CD and environments
- Environments: `local`, `staging`, `production` (separate Firebase projects, D1 databases, Stripe modes, Gemini keys).
- `desktop-ci.yml`: typecheck, lint, Vitest, helper build + tests on every PR.
- `release.yml`: on tag → electron-builder → sign → notarize → DMG → upload to R2 → update feed.
- `api-ci.yml`: test, apply D1 migrations, deploy Worker to staging; manual promote.
- `web-ci.yml`: Cloudflare Pages preview per PR.

## 13. Build order by phase
Phases and steps are defined in [BUILD_PLAN.md](BUILD_PLAN.md) §3. Engineering order inside Phase 0:
1. Monorepo + git; Electron + React scaffold; Swift helper scaffold with the stdio protocol.
2. Fn hotkey → mic → WhisperKit → word-timed transcript in the main process.
3. Paste text into the focused app with clipboard restore.
4. IntentRouter + CommandEngine + `commands.json`; SafetyGate; preview chip.
5. `GeminiProvider` cleanup; app-aware tone.
6. AppResolver, press-by-label, local SQLite history and dictionary; onboarding.
