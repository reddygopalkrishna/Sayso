# Startup Buildathon India 2026: submission drafts

Team: **SuperIntelligence** · Product: **Sayso** · Deadline: **13 Nov 2026, 11:59 PM IST**
Every answer below fits the form's 1,024-character limit. Items marked **[YOU]** need your input.

Two parts are mandatory:
1. **Project Submission form** + pitch deck PDF (≤ 5 MB, prescribed 9-slide template)
2. **Startup/Project Details** form (founders)

---

## Part 1: Project Submission form

**Challenge:** Open Innovation

**1. One-sentence summary**
> Sayso is a hands-free AI voice assistant for Mac and Windows that lets you talk to your computer and have it type, send, open apps, click buttons and finish multi-step tasks in any app, powered by Gemini and on-device Gemma.

**2. Main problem**
> People who work on computers all day, especially developers and founders prompting AI tools like Claude Code, Cursor, ChatGPT and Gemini, spend hours typing long prompts and doing hundreds of small actions: press Enter, click Send, switch apps, open sites. Typing runs at about 40 words a minute, while we speak at about 150, so typing is now the bottleneck between people and AI. Voice typing tools stop at text: your hands still go back to the keyboard to send, click and switch. Built-in voice control on Mac and Windows is slow, rigid and hard to learn. AI computer-use agents are slow and not built for instant everyday actions. Every app and AI agent also keeps stopping for approvals and pop-ups (Allow? Yes or No? Continue?), so people walk back to the keyboard just to click one button. Result: lost time, broken focus, and real pain for people with RSI, carpal tunnel or motor disabilities.

**3. Typical user/customer**
> Primary: software developers and AI power users who prompt Claude Code, Cursor, Codex, ChatGPT and Gemini all day, often running several AI agents at once. Secondary: founders, product managers, sales and support teams who send hundreds of messages and emails daily (Slack, Gmail, WhatsApp, LinkedIn), and people with RSI, carpal tunnel or motor impairments who need hands-free computer use. Typical buyer: an individual professional paying a monthly subscription, later small teams buying seats. Early users: Indian developers and startup teams, then global.

**4. Solution**
> Sayso is a desktop app that controls any app end to end by voice. Slack: "open Slack, go to the design channel, read the latest message, reply: looks good, ship it, send it". WhatsApp: "message Ravi: running late, send it". Gmail: "reply to Priya: confirmed for Friday, send it". No keyboard, no mouse. Features: (1) Hands-free mode with an on-device wake word, plus push-to-talk. (2) AI cleanup: removes fillers, fixes grammar, app-aware tone. (3) Instant commands under 300 ms: send, new tab, switch app, scroll, undo, volume. (4) Click by name: "click Reply", "open the second email", read through OS accessibility. (5) Prompt expansion: a short spoken idea becomes a clear, complete prompt for any AI tool. (6) Smart multi-step tasks across apps ("create a GitHub repo called instance") with a progress panel and Stop. (7) Safety: risky actions (send to many, delete, pay) always ask "confirm?". Works in every app and website without integrations.

**5. Stage:** Ideation *(PRD and technical architecture are written; prototype build starting. Change to MVP if you have a working demo by tonight.)*

**6. Business model**
> Freemium SaaS subscription. Free: unlimited push-to-talk dictation with AI cleanup and basic voice commands, to drive adoption. Pro: about USD 8-12 per month (INR 299-399 in India, regional pricing): unlimited hands-free use, prompt expansion, smart multi-step tasks, multiple devices. Teams: per-seat pricing with shared dictionary, snippets, admin and billing. Later: enterprise plans and accessibility licensing for organisations. Costs stay low because speech recognition and cleanup run on-device with Gemma; cloud Gemini calls are used only for smart tasks and are metered by plan. Growth: short demo videos (Reels, Shorts, X, LinkedIn), Product Hunt and Hacker News launches, SEO comparison pages, and referrals (free Pro month per invite).

**7. Competitors and how we differ**
> Sayso creates a new category: end-to-end voice control of the computer. No product today lets people talk naturally and have any app typed in, clicked, navigated and finished for them. Today people work around this with three partial alternatives: (1) voice typing tools, which only convert speech to text, so hands still go back to the keyboard to send, click and switch; (2) built-in accessibility voice control on Mac and Windows, which needs a rigid command language and has no AI understanding; (3) general AI computer-use agents, which take 10-60 seconds per task and are not built for instant everyday actions. Sayso is different: one natural voice flow that types, clicks, navigates and completes tasks in every app (Slack, WhatsApp, Gmail, code editors, AI tools) with no integrations; instant commands under 300 ms; prompt expansion; safety confirmations before risky actions; and Gemini plus on-device Gemma for speed, privacy and low cost.

**8. Target countries**
> Primary: India (large and fast-growing developer and startup base, strong price sensitivity that suits our regional pricing). Secondary: United States, United Kingdom, Canada, Australia and Europe (largest markets for paid productivity and AI developer tools), followed by Southeast Asia and the Middle East.

**9. Pitch deck:** upload the PDF (see Part 3).

**10. How we use AI**
> AI is the core of Sayso at every step: (1) Speech: Gemini Live streams real-time speech understanding with low latency; on-device models handle the wake word so nothing is sent until the user speaks to Sayso. (2) Cleanup: Gemma runs locally to remove fillers, fix grammar and adapt tone to the app (casual in Slack, formal in Gmail, literal in code editors). (3) Intent: AI decides whether speech is text to type or a command to run. (4) Prompt expansion: Gemini turns a short spoken idea into a complete, well-structured prompt for coding agents and chatbots. (5) Planning: Gemini converts a sentence like "create a repo called instance and open it" into structured steps with function calling. (6) Screen understanding: Gemini vision reads the screen to find buttons and fields when apps have no accessibility labels. (7) Personalisation: learns names, terms and frequent commands.

**11. Google AI models:** ☑ Gemini API ☑ Gemini Live ☑ Gemma *(optional: ☑ Gemini Omni if you want; skip Nano Banana and Lyria, they don't fit)*

**12. How we use the selected models**
> Gemini Live: real-time, streaming voice understanding for hands-free mode, with natural turn-taking and interruption, so commands feel instant and conversational. Gemini API (Gemini Pro/Flash): the brain for smart tasks. It expands short prompts, plans multi-step tasks through function calling (open_app, click, type, press_key, create_repo), checks its plan against what is on screen, and uses vision to locate buttons when accessibility data is missing. Gemini Flash keeps latency and cost low for everyday requests. Gemma (on-device): small, private, offline model that cleans up dictated text and classifies text vs command in under half a second, without sending audio or text to the cloud, which keeps cost per user near zero and protects privacy. Together: on-device Gemma for speed and privacy, cloud Gemini for intelligence.

**13. Development platforms:** ☑ Google AI Studio ☑ Google Antigravity *(+ "Google Agent Skills" in the deck)*

**14. Deploy and scale on Google Cloud**
> The desktop app (Electron + native macOS/Windows helpers) runs voice, Gemma and actions locally. Cloud backend on Google Cloud: Cloud Run hosts our API (auth, plan checks, usage metering, prompt expansion and task-planning endpoints) and scales to zero and up automatically; Vertex AI / Gemini API serves Gemini models with quotas per plan; Firebase Authentication for Google sign-in; Firestore for user settings, dictionary, snippets and subscription data; Cloud Storage for app updates and model downloads; Pub/Sub for async jobs; Cloud Logging, Monitoring and Error Reporting for reliability; Secret Manager for keys; Cloud CDN for downloads. Scaling plan: stateless Cloud Run services, regional deployment (Mumbai region first, then US/EU), caching of common prompts, and on-device processing for most requests so cloud cost grows slower than users.

**15. How did you hear about the Buildathon:** Through the Hack2skill platform

---

## Part 2: Startup/Project Details form

| Field | Draft |
|---|---|
| Team / startup name | SuperIntelligence (product: Sayso) |
| Planning to build a venture? | Yes |
| Members | 2 |
| Industry | Artificial intelligence and machine learning (AI/ML) |
| Founders, roles, LinkedIn | Reddy Gopal Krishna P: Founder & CEO (product, AI and engineering), LinkedIn: **[YOU add URL]** · Reddy Kesava: Co-founder (engineering), LinkedIn: **[YOU add URL]** |
| Founder emails | The two emails already on your team page |
| Founder bios | see below |
| Time working as a team | < 12 months |
| How did you hear | Through the Hack2skill platform |

**Founder bios (form answer)**
> Reddy Gopal Krishna P (Founder & CEO): B.Com in Computer Applications. AI engineer and full-stack web developer with hands-on experience across three roles, building AI/ML features, frontends and backends. Leads product, the AI pipeline (Gemini, Gemma) and the desktop app. Reddy Kesava (Co-founder, Engineering): B.Tech Computer Science and Engineering student. Works on the desktop app, OS automation and testing, and brings strong CS fundamentals. We are brothers: full trust, fast decisions and long-term commitment. Complementary skills: product, AI and full-stack delivery (Gopal Krishna) plus core CS and systems work (Kesava). Why this problem: we prompt AI tools and send messages all day and saw that typing, not thinking, is now the slowest step. Voice tools stop at text, so our hands keep going back to the keyboard. We are building the tool we want to use every day.

---

## Part 3: Pitch deck (prescribed 9-slide template)

| # | Slide | Content |
|---|---|---|
| 1 | Submission Guidelines | **Delete** (instruction slide) |
| 2 | Cover | Team Name: SuperIntelligence · Team Size: 2 · Problem Statement: "Typing is the bottleneck between people and AI: voice tools stop at text, so hands still go back to the keyboard." |
| 3 | Problem Statement | Answer 2, as 4-5 bullets + stats (40 vs 150 wpm) |
| 4 | Proposed Solution | Answer 4 + example flow "open Claude → type … → send it" + competitor differences |
| 5 | Solution Architecture | Diagram: Mic → wake word (on-device) → Gemini Live / Gemma → intent router → instant commands / Gemini planner → action executor (accessibility, keyboard, Chrome extension) → safety layer → app. Cloud Run + Firebase + Firestore + Vertex AI |
| 6 | Google AI Tools | AI Studio (prompt design, testing), Antigravity (agent-first coding of the app), Google Agent Skills (task skills: GitHub, Gmail, Slack) |
| 7 | Google AI Models | Gemini Live, Gemini API (Flash/Pro), Gemma: what each does |
| 8 | (blank content slide) | Business model, market, go-to-market, roadmap |
| 9 | Thank you | Keep |
