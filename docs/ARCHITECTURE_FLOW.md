# Sayso: Architecture and End-to-End Flows

> Version 0.2, 13 Nov 2026 (matches BUILD_PLAN.md: on-device speech, Gemini, Cloudflare). This document shows **how everything flows**, from the user's voice to an action on screen.
> Related: [PRD.md](PRD.md) · [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md)
> Diagrams use Mermaid (render in GitHub, VS Code, or any Mermaid viewer).

---

## 1. The big picture

```mermaid
flowchart LR
  U((User voice)) --> T[Triggers<br/>Fn · hands-free · wake word]
  T --> A[Audio Capture<br/>+ VAD]
  A --> S[WhisperKit STT<br/>on device + word timings]
  S --> R{Intent Router<br/>mode + pause rule}
  R -->|text| D[Dictation]
  D --> C[Text Cleanup<br/>AI polish]
  R -->|instant command| E[Command Engine<br/>local rules]
  R -->|smart task| P[Smart Task Planner<br/>Gemini + function calling]
  C --> G[Safety Gate]
  E --> G
  P --> G
  G -->|allowed| X[Action Layer]
  G -->|preview / confirm| UI[Preview chip /<br/>Confirm dialog]
  UI -->|ok| X
  G -->|blocked| B[Refuse + explain]
  X --> M[macOS apps<br/>Accessibility · keys · NSWorkspace]
  X --> W[Chrome extension<br/>web pages]
  CTX[Context Provider<br/>frontmost app · URL · focused field] -.-> R
  CTX -.-> G
  CTX -.-> C
```

**Three paths, one pipeline:**
| Path | Example | AI used? | Speed |
|---|---|---|---|
| Dictation | "Hey, can we meet at 5 tomorrow" | Yes (cleanup) | ~0.5-0.7 s |
| Instant command | "send", "click Recompile", "open GitHub" | No | < 300 ms |
| Smart task | "In GitHub, create a repo called instance" | Yes (planner) | 1-60 s |

## 2. System components and where they run

```mermaid
flowchart TB
  subgraph Mac["Mac (on device)"]
    APP[Sayso app<br/>Electron + TypeScript<br/>+ Swift helper]
    DB[(SQLite<br/>history · dictionary ·<br/>resolver memory)]
    WW[Wake word + VAD<br/>ONNX on device]
    NMH[Native messaging host]
    APP --- DB
    APP --- WW
    APP <--> NMH
  end
  subgraph Chrome["Chrome"]
    EXT[Sayso extension<br/>content scripts]
  end
  NMH <--> EXT
  subgraph Cloud["Cloudflare (Phase 2+)"]
    API[Workers: Hono API<br/>cleanup · planner · usage]
    D1[(D1 database)]
    R2[(R2: downloads)]
    API --- D1
  end
  APP <-->|HTTPS + Firebase token| API
  APP --> R2
  API --> GEM[Gemini API]
  API --> ST[Stripe]
  APP --> FB[Firebase Auth]
```

**Data that leaves the Mac:** text for cleanup and the minimum screen context for smart tasks the user starts. **Data that never leaves:** audio (speech-to-text runs on device), wake-word audio, history, passwords, full screenshots (vision fallback later, and then only with permission).

## 3. Listening state machine

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Listening: Fn down / wake word / double-tap
  Listening --> Transcribing: Fn up / tap / silence timeout
  Listening --> Idle: Esc
  Transcribing --> Routing: final transcript
  Routing --> Cleaning: dictation
  Routing --> Matching: command
  Routing --> Planning: smart task
  Cleaning --> Inserting
  Inserting --> Previewing: trailing command found
  Inserting --> Idle: no trailing command
  Matching --> Previewing: Normal level
  Matching --> Confirming: Risky level
  Matching --> Acting: Safe level
  Matching --> Idle: Blocked (show reason)
  Planning --> Clarifying: missing slot
  Clarifying --> Planning: user answers
  Planning --> Acting: steps ready
  Previewing --> Acting: ~1 s passes
  Previewing --> Idle: Esc / "no"
  Confirming --> Acting: "confirm"
  Confirming --> Idle: "cancel"
  Acting --> Idle: done / failed
```

## 4. Flow A: dictate and send

User holds Fn: *"Hey, um, can we meet at 5, no, 6 tomorrow? … send"* (pause before "send").

```mermaid
sequenceDiagram
  actor User
  participant Trig as Triggers
  participant Aud as AudioCapture
  participant STT as WhisperKit (helper)
  participant Rt as IntentRouter
  participant Cl as TextCleanup (Gemini)
  participant SG as SafetyGate
  participant Act as ActionLayer
  participant App as WhatsApp / Slack

  User->>Trig: hold Fn
  Trig->>Aud: start (with 300 ms pre-roll)
  Aud->>STT: PCM frames (on device)
  User->>Trig: release Fn
  STT-->>Rt: final words + timings
  Rt->>Rt: pause rule: "send" alone, at end, gap 720 ms ≥ 600 ms
  Rt->>Cl: raw text without "send" + tone=casual
  Cl-->>Act: "Hey, can we meet at 6 tomorrow?"
  Act->>App: paste text (restore clipboard)
  Rt->>SG: command send (Normal) in WhatsApp
  SG-->>User: preview chip "⏎ Send" (~1 s)
  SG->>Act: allowed
  Act->>App: press Enter
```

**If "send" had no pause before it, or had words after it** ("send me a flower"), the router keeps it as text and nothing is sent.

## 5. Flow B: instant command "click Recompile"

```mermaid
sequenceDiagram
  actor User
  participant Rt as IntentRouter
  participant CE as CommandEngine
  participant Ctx as ContextProvider
  participant SG as SafetyGate
  participant Act as ActionLayer
  participant Ext as Chrome extension
  User->>Rt: (Fn+Shift) "click Recompile"
  Rt->>CE: match
  CE-->>Rt: click(label="Recompile"), conf 0.98
  Rt->>Ctx: frontmost = Chrome, url = overleaf.com
  Rt->>SG: click (Safe)
  SG->>Act: run
  alt Frontmost is a browser
    Act->>Ext: find element by accessible name "Recompile" → click
  else Native app
    Act->>Act: AX tree search for AXButton titled "Recompile" → AXPress
  end
  Act-->>User: brief ✓ in the listening pill
```

**Matching rules for labels:** exact match → case-insensitive → contains → fuzzy (≥ 0.85). If more than one element matches, show numbered badges on screen and the user says "one" / "two".

## 6. Flow C: "open GitHub" (resolver)

```mermaid
flowchart TD
  S["open GitHub" / "open GitHub in Chrome"] --> B{Browser named?}
  B -->|yes| URL[Resolve site URL → open in that browser]
  B -->|no| M{Remembered choice?}
  M -->|yes| DO[Open remembered target]
  M -->|no| A{Installed app match?}
  A -->|yes| W{Also a known website?}
  W -->|no| OA[Open app]
  W -->|yes| ASK[Chip: 'GitHub Desktop or github.com?'<br/>→ remember answer]
  A -->|no| K{Known site / bookmark / history?}
  K -->|yes| OU[Open URL in default browser]
  K -->|no| GS[Web search in default browser]
```

## 7. Flow D: smart task (V2), "In GitHub, create a new repo called instance"

```mermaid
sequenceDiagram
  actor User
  participant Rt as IntentRouter
  participant Pl as Planner (Gemini)
  participant SG as SafetyGate
  participant Run as StepRunner
  participant Act as ActionLayer
  User->>Rt: (Fn+Shift) "In GitHub, create a new repo called instance"
  Rt->>Pl: utterance + context (frontmost app, URL, visible labels)
  Pl-->>Rt: steps: open_url(github.com/new) → fill("Repository name","instance") → click("Create repository")
  Note over Pl: if name unclear → ask_user("Create repo named 'instance'?")
  Rt->>SG: check each step (create = Safe)
  SG->>Run: approved plan
  loop each step
    Run->>Act: execute step
    Act-->>Run: result (verify element / URL changed)
  end
  Run-->>User: ✓ "Repo 'instance' created"
```

**Verification:** after each step, the runner checks that the expected change happened (new URL, field value, element present). If not, it retries once, then stops and shows what failed. It never reports success without checking.

**Optional connector path:** if the GitHub connector is enabled, the planner returns one `apiCall(github.createRepo)` step instead of clicks (≈ 1 s).

## 8. Flow E: multi-step task (V2), the Overleaf resume example

*"Open Overleaf, create LaTeX from my resume, paste it, recompile and download."*

```mermaid
flowchart TD
  A[Planner builds steps] --> B[1. Open overleaf.com in Chrome<br/>user already logged in]
  B --> C[2. Open the target project<br/>ask if more than one]
  C --> D[3. Read resume file from disk<br/>ask which file if unclear]
  D --> E[4. Generate LaTeX<br/>Sayso's own AI, or ChatGPT tab if the user asked]
  E --> F[5. Focus editor → select all → paste<br/>Risky: replaces content → Confirm]
  F --> G[6. Click 'Recompile' → wait for PDF ready]
  G --> H[7. Click 'Download PDF' → file in ~/Downloads]
  H --> I[✓ Done, show file]
  P[[Progress panel: Step n of 7 · Stop button]] -.-> B & C & D & E & F & G & H
```

## 9. Flow F: multiple laptops side by side (V2)

Each laptop runs its **own independent install**. They are **not linked** and can be on different networks. Each reacts only to **its own trigger**.

```mermaid
flowchart LR
  V((User's voice)) --> MA[Laptop A mic]
  V --> MB[Laptop B mic]
  subgraph LA["Laptop A: trigger = Fn hotkey only"]
    MA --> TA{Fn held?}
    TA -->|no| IA[Ignore]
    TA -->|yes| PA[Process: dictation + actions per A's settings]
  end
  subgraph LB["Laptop B: trigger = wake word 'Hey Atlas'"]
    MB --> TB{"'Hey Atlas' heard?<br/>(on-device)"}
    TB -->|no| IB[Ignore, nothing sent]
    TB -->|yes| PB[Process: dictation + actions per B's settings]
  end
```

**Example:** hands typing on Laptop A. Voice: *"Hey Atlas, open Claude Code. Pull Jira story 918 and do the work. [pause] Send."*
- Laptop A: Fn not held → ignores.
- Laptop B: wake word matched → opens Claude Code → types the prompt → pause rule → Normal-level send → presses Enter.

Per-device settings (stored locally, optionally synced by `device_id`): dictation on/off, actions on/off, smart tasks on/off, wake word on/off + name, safety unlocks.

## 10. Flow G: Safety Gate decision

```mermaid
flowchart TD
  IN[Action + context] --> PW{Focused field is a password?}
  PW -->|yes| BLK[Blocked: never type]
  PW -->|no| BL{In Blocked list?<br/>trades · payments · Terminal execute}
  BL -->|yes, not unlocked| BLK2[Blocked: explain, offer to type only]
  BL -->|no| MT{Meeting app active with mic on?}
  MT -->|yes| DOFF[Actions off: dictation only]
  MT -->|no| LV{Level from registry + context}
  LV -->|Safe| RUN[Run now]
  LV -->|Normal| CH[Preview chip ~1 s → run unless cancelled]
  LV -->|Risky| CF[Confirm dialog: voice 'confirm' or click]
```

**Risky triggers by context:** recipients > 3; destructive verbs (delete, remove, discard, close without saving); git push / merge / deploy; replacing existing document content; submitting forms with money fields.

## 11. Flow H: text cleanup

```mermaid
flowchart LR
  RAW[Raw transcript<br/>commands already removed] --> L{Cleanup level}
  L -->|Off| OUT[Insert as is]
  L -->|Light| LOC[Local: punctuation + capitals] --> OUT
  L -->|Full| TONE{App tone profile}
  TONE -->|literal: code editor, terminal| LIT[Minimal: dictionary only] --> OUT
  TONE -->|casual / professional| AI[Gemini Flash, streaming<br/>fillers · self-corrections · grammar ·<br/>formatting · dictionary terms] --> OUT
```

## 12. Account, billing and usage flow

```mermaid
sequenceDiagram
  actor User
  participant App as Mac app
  participant API as Cloudflare Worker
  participant Auth as Firebase Auth
  participant Stripe
  User->>App: Sign in with Google
  App->>Auth: Firebase Auth (browser sign-in)
  Auth-->>App: Firebase ID token (stored with safeStorage)
  App->>API: requests carry the ID token; Worker verifies it
  App->>API: GET /v1/me → plan = trial, limits
  User->>App: Upgrade
  App->>API: POST /v1/billing/checkout
  API->>Stripe: create Checkout session
  Stripe-->>User: payment page (browser)
  Stripe->>API: webhook: subscription active
  API-->>App: next /v1/me → plan = pro
  App->>API: batched usage events (words, commands, tasks)
```

## 13. Deployment view

```mermaid
flowchart TB
  subgraph Users
    MAC[Mac app: signed + notarized DMG<br/>electron-updater]
    CWS[Chrome Web Store extension]
  end
  subgraph CF["Cloudflare (DNS · HTTPS · DDoS protection)"]
    WEB[Pages: React website]
    API1[Workers: Hono API]
    D1[(D1 database)]
    R2[(R2: DMG + update feed)]
  end
  subgraph Vendors
    GEM[Gemini API]
    FB[Firebase Auth]
    STR[Stripe]
    OBS[Sentry · PostHog]
  end
  MAC --> API1
  MAC --> R2
  MAC --> FB
  MAC --> OBS
  API1 --> D1 & GEM & STR
  WEB --> API1
```

## 14. Version map: what flows exist in each version

| Flow | V1 | V2 | V3 | V4 |
|---|---|---|---|---|
| A. Dictate + send | ✅ | ✅ | ✅ | ✅ |
| B. Instant commands / click by label | ✅ | ✅ | ✅ + vision fallback | ✅ |
| C. Open resolver | ✅ | ✅ | ✅ | ✅ |
| D. Smart task | | ✅ | ✅ | ✅ |
| E. Multi-step task | | ✅ | ✅ | ✅ |
| F. Multiple laptops (wake word per device) | | ✅ | ✅ | ✅ |
| G. Safety Gate | ✅ | ✅ | ✅ | ✅ |
| H. Cleanup | ✅ | ✅ | ✅ | ✅ + translation (Telugu, Hindi, Hinglish → English) |
| Windows | | | ✅ | ✅ |
