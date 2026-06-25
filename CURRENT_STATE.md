# TACIT — Current State

> **Tacit** — *the private economy for AI agents.* A private agent-to-agent commerce layer on **Canton**: AI agents negotiate via **sealed bids**, settle on-ledger, and **the ledger itself** controls who can see what.
>
> Last updated: **2026-06-26**. This is the single source of truth for what exists today. Companion: [PROMPT_ENGINEER_BRIEF.md](PROMPT_ENGINEER_BRIEF.md) (strategy & build loop).

---

## ⚡ TL;DR
The full demo loop is **built, working, and live on a local Canton ledger** (no Docker, no VM):

> A buyer agent posts a request → three provider agents submit **sealed bids** → the buyer agent awards the lowest → it all settles on Canton → the **Ledger Lens** lets you switch perspective (Public / Buyer / Provider A·B·C) and see that the privacy is **enforced by the ledger**, with a **real Canton contract id** on screen.

What's left is mostly *packaging to win*: the atomic-settlement Daml choice (P2), a hosted deploy (live link), a deck, and a 3-minute video. See [§9](#9-whats-left).

---

## 1. Status at a glance

| Phase | What | State |
|---|---|---|
| **P0** | Ledger Lens UI (perspective-switching privacy view) | ✅ done, committed |
| **P1a** | Real Daml sealed-bid proof (`daml test`) | ✅ done, committed |
| **P4.1** | Autonomous agent negotiation engine + `/api/negotiate` | ✅ done, committed |
| **P4.2** | Live `/lens` experience (hero → theater → reveal) | ✅ done, committed |
| **P3.0** | Live local Canton ledger + JSON API; privacy proven over HTTP | ✅ done (spike) |
| **P3.1** | Negotiation route **writes** the deal to Canton | ✅ done, committed |
| **P3.2** | Lens **reads** the deal back per-party; visibility derived from the ledger | ✅ done, committed |
| **P2** | Atomic-settlement Daml `choice` (DvP) | ⬜ not started — *integrity gap, see §8* |
| **Deploy** | Hosted live product link (VM) | ⬜ blocked on VM (“soon”) |
| **Deck / Video** | Submission artifacts | ⬜ not started |
| **MCP / Auditor persona** | Optional ceiling-raisers | ⬜ not started |

Git: clean working tree. Recent history is in `git log` (P0 → P1a → P4.1/P3.1 → P4.2 → P3.2).

---

## 2. How it works (end-to-end request flow)

```
Browser (/lens)                     Next.js server (:3100)                 Canton sandbox (:6865) + JSON API (:7575)
──────────────                      ─────────────────────                 ─────────────────────────────────────────
IdleHero
  │  click "Run live negotiation"
  ▼
LensExperience ── POST /api/negotiate ─▶ negotiateCore()
                                         │  buyer agent posts RFS
                                         │  3 provider agents price bids   (LLM via Gradient, else deterministic)
                                         │  buyer agent picks lowest
                                         ▼
                                       ledgerReachable()? ──────────────▶ GET /livez
                                         │ yes
                                         ▼
                                       writeNegotiation(core) ──────────▶ ensureParty ×4  (allocate/reuse)
                                         │                                 create Rfs        (as buyer)
                                         │                                 create SealedBid ×3 (as each provider,
                                         │                                   observer = buyer only)
                                         │                                 create Settlement (as buyer + winner)
                                         ▼
                                       readDealFromLedger() ────────────▶ query SealedBid/Settlement AS each party
                                         │  visibleTo = who actually          (the ledger returns only what each
                                         │  returned each contract             party is a stakeholder of)
                                         ▼
  ◀── { transcript, deal, dealSource:'ledger', ledger:{contractIds…} } ──┘
  │
  ▼
NegotiationTheater plays the transcript ──▶ LensView renders the ledger-derived deal
                                            (switch persona → see ledger-enforced privacy + real contract id)
```

**Key idea:** the Lens does **not** assert who-sees-what. After writing the deal, the server **queries Canton as each party** and sets each field's `visibleTo` to exactly the set of parties whose query returned that contract. The privacy on screen *is* the ledger's. If the ledger is unreachable, the route falls back to an in-memory deal so the demo never dead-ends.

---

## 3. Technical backend

### 3.1 Daml layer (`daml/`)  — the moat
- **SDK:** Daml **2.10.4** (tool is `daml`, not `dpm`). Package id `aeee7b213544035aff90257d2e4e553223104281ebc9e55d37f0af57c4aa0fdf`. Build artifact `daml/.daml/dist/tacit-0.1.0.dar`.
- **Contracts** (`daml/Tacit/Sealed.daml`):
  - `Rfs { buyer, description, maxBudget }` — `signatory buyer`.
  - `SealedBid { rfsId, provider, buyer, price }` — `signatory provider`, **`observer buyer`** (and *only* buyer). This one line is the privacy property: competing providers are not stakeholders, so the ledger hides each bid from them.
  - `Settlement { buyer, provider, rfsId, price }` — `signatory buyer, provider` (dual-authorized).
- **Proof** (`daml/Tacit/Test.daml`): a Daml Script that allocates buyer + A/B/C + an uninvolved party, creates the 31/42/28 bids, queries as each party, and asserts the visibility matrix. `daml test` → **ok, 8/8 assertions**.

### 3.2 Ledger integration (`app/lens/ledger/`) — server-side, over the JSON Ledger API
- `client.ts` — the JSON API client. Mints dev **JWTs** (HS256, dummy secret), `ensureParty`, `create`, `queryAs`, `ledgerReachable`. All config is env-overridable (`DAML_JSON_API_URL`, `DAML_LEDGER_ID`, `DAML_APPLICATION_ID`, `DAML_TOKEN_SECRET`, `TACIT_PACKAGE_ID`) with working local defaults.
- `write.ts` — `writeNegotiation(core)`: ensures the 4 parties, creates `Rfs` (buyer) + 3× `SealedBid` (each provider) + `Settlement` (buyer + winner). Returns the real contract ids. Errors are caught → `{ written:false, error }`.
- `read.ts` — `readDealFromLedger(rfsId, parties, core)`: queries `SealedBid`/`Settlement` **as each persona**, derives each price's `visibleTo` from who-can-query, and surfaces the **real Settlement contract id** as the Lens's “Canton transaction”. Participant metadata (RFS text, labels, timestamps) and public-framing fields come from the negotiation core (“public” is not a ledger party).

### 3.3 The Canton local-dev recipe (hard-won — keep this)
- **Stack (no Docker / no VM):** Canton **sandbox** on `:6865`, **JSON Ledger API** on `:7575`, both bundled in the SDK. JDK 17 required.
- **Auth:** dev JWT, HS256, dummy secret (sandbox runs `--allow-insecure-tokens` → signature not verified). Custom claim `https://daml.com/ledger-api` with `applicationId`, `actAs`/`readAs` (or `admin:true`), `exp`.
- **The subtle gotcha:** command submission (`/v1/create`) **requires `ledgerId: "sandbox"`** in the token; party management (`/v1/parties`) does not. Omitting it = 401 on create.
- **Party ids** are `<Hint>::1220e232…` (stable participant namespace). Allocation is idempotent via `ensureParty` (lists `/v1/parties`, reuses if present).
- **R9 note:** the 2.x JSON API serves the active contract set in real time — **no PQS lag** — so a live write→read demo is viable locally.

### 3.4 Agent engine (`app/lens/agents/`)
- `negotiation.ts` — `negotiateCore(opts)` runs the buyer + 3 provider agents and returns the raw outcome (prices, winner, transcript). `buildDealFromCore(core)` turns it into the Field-wrapped `Deal`. `runNegotiation` = both.
- Providers price via an LLM (`llm.ts`, OpenAI-compatible, reads `GRADIENT_*` env) **or** a deterministic, persona-based fallback (multipliers chosen so budget $50 → **31 / 42 / 28**, winner C). The fallback guarantees the demo never hangs; with a key set, bids are real-LLM (`usedLLM: true` → “LIVE AI” badge, else “SIMULATED”).
- `llm.ts` — null-safe: any missing-key/network/timeout/parse failure returns `null` and the caller falls back.

### 3.5 API (`app/api/negotiate/route.ts`)
`GET`/`POST` → `negotiateCore` → `buildDealFromCore` → if `ledgerReachable()`: `writeNegotiation` then `readDealFromLedger` → returns `{ transcript, deal, usedLLM, ledger, dealSource }` (`dealSource: 'ledger' | 'memory'`). Dev note: this route is x402-bypassed in dev; prod-excluding it from the payment matcher is a later deploy item.

---

## 4. Frontend — UI/UX (`app/lens/`)

### 4.1 The experience (`/lens`)
A three-phase machine in `LensExperience.tsx`, with `LensView` (the privacy viewer) left untouched:
1. **Idle hero** — “Watch three AI agents negotiate a private deal.” + a violet **▶ Run live negotiation** CTA (and a quiet “skip to the ledger”).
2. **Live theater** (`NegotiationTheater.tsx`) — a `● LIVE NEGOTIATION` feed: the buyer posts, three `🔒 Submitted sealed bid · Encrypted to the buyer only` rows appear one by one (~850 ms apart), award, settle; a violet progress bar fills.
3. **Reveal** (`LensView.tsx`) — the **Ledger Lens**.

A fixed top-right control shows **↻ Replay negotiation** and a **SIMULATED / LIVE AI** badge.

### 4.2 The Ledger Lens (`LensView.tsx`) — the wow moment
- A **PersonaSwitcher** (segmented control with a `layoutId` sliding violet pill): Public · Buyer Agent · Provider A · B · C.
- Three cards: **The Request**, **Sealed Bids** (3 rows), **Atomic Settlement** (status, network commitment, winner, settled amount, **Canton transaction = real contract id**).
- A per-persona caption (“You are Provider A… Canton hides every competitor’s price from you.”).
- Each field is a **`RevealField`**: if the active persona can see it → crisp value (JetBrains Mono for data, Inter for prose) with a blur→sharp entrance + a brief violet underline flash; if not → a frosted `🔒 PRIVATE` pill (`backdrop-blur`, redaction bars). Visibility is computed **only** from the field's `visibleTo` (which, post-P3.2, is derived from the ledger).

### 4.3 Visual system (premium light / institutional, not crypto-neon)
- Background `#FAFAF9`, white cards, hairline border `rgba(0,0,0,0.06)`, soft shadow.
- Accent **violet `#7C3AED`** (deliberately *not* the old Solana purple), ink `#0A0A0B`, muted grays.
- **JetBrains Mono** for all data values (loaded globally via `@import` in `globals.css`), **Inter** for prose.
- Demo hygiene: `HideAppChrome.tsx` + `lens-chrome.css` hide the Next.js dev-tools indicator on `/lens` only (route-scoped via a `body.lens-route` class) for clean full-screen captures. (That “N” was the dev indicator — absent in production anyway.)

### 4.4 Data model (`types.ts`)
`Persona = 'public' | 'buyer' | 'providerA' | 'providerB' | 'providerC'`. `Field<T> = { value, visibleTo: Persona[] }`. `Deal` wraps an `Rfs`, `Bid[]`, and a `Settlement`, every leaf a `Field`. `isVisible(field, persona)` is the single visibility primitive. `PERSONAS` is a registry — adding an **auditor/regulator** persona later is purely additive (no model change). `getDeal()` in `dataSource.ts` is the seam (currently a seed for first paint; the live deal arrives via `/api/negotiate`).

---

## 5. File map

```
daml/
  daml.yaml                         Daml project (sdk 2.10.4, name tacit, source .)
  Tacit/Sealed.daml                 Rfs · SealedBid (observer buyer) · Settlement
  Tacit/Test.daml                   Daml Script visibility proof (daml test: 8/8)

app/api/negotiate/route.ts          GET/POST → negotiate → write+read ledger → JSON

app/lens/
  page.tsx                          server: getDeal() → <HideAppChrome/> + <LensExperience/>
  types.ts                          Persona, Field, Bid, Deal, PERSONAS, isVisible
  dataSource.ts                     getDeal() seam (seed deal)
  components/
    LensExperience.tsx              phase machine: idle → theater → reveal; fetches /api/negotiate
    NegotiationTheater.tsx          plays the transcript
    LensView.tsx                    the Ledger Lens (switcher + 3 cards)  ← privacy/data untouched since P0
    RevealField.tsx                 reveal vs frosted-PRIVATE field
    PersonaSwitcher.tsx             segmented control (sliding pill)
    HideAppChrome.tsx + lens-chrome.css   route-scoped dev-indicator hide
  agents/
    negotiation.ts                  negotiateCore · buildDealFromCore · runNegotiation
    llm.ts                          OpenAI-compatible client (Gradient env), null-safe
  ledger/
    client.ts                       JSON API client (tokens, ensureParty, create, queryAs)
    write.ts                        writeNegotiation(core) → creates contracts
    read.ts                         readDealFromLedger() → per-party reads, derived visibility
```

> The surrounding repo is the ported ParallaxPay app (Next.js 15 / React 19 / TS / Tailwind v4 / custom `server.js`). Everything Tacit lives under `app/lens/**`, `app/api/negotiate/**`, and `daml/**`. The legacy Solana/x402 code is inert and slated for removal.

---

## 6. How to run it locally

**Prereqs:** JDK 17 (`brew install openjdk@17`), Daml SDK 2.10.4 (`curl -sSL https://get.daml.com | sh`), Node + `npm install`. Put the JDK + daml on PATH:
```bash
export PATH="/opt/homebrew/opt/openjdk@17/bin:$HOME/.daml/bin:$PATH"
export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
```

**1 — build the DAR:**  `cd daml && daml build`  → `daml/.daml/dist/tacit-0.1.0.dar`

**2 — ledger:**  `daml sandbox --dar daml/.daml/dist/tacit-0.1.0.dar --port 6865 --port-file /tmp/sandbox-port.txt --wall-clock-time`

**3 — JSON API:**  `daml json-api --ledger-host localhost --ledger-port 6865 --http-port 7575 --allow-insecure-tokens`

**4 — app:**  `PORT=3100 NODE_ENV=development npm run dev`  → open **http://localhost:3100/lens**, click ▶.

**Env (optional):** `GRADIENT_API_KEY` (+ `GRADIENT_MODEL`, `GRADIENT_BASE_URL`) flips agents to real LLM. `TACIT_PACKAGE_ID` if the DAR is rebuilt. `DAML_JSON_API_URL` / `DAML_LEDGER_ID` for non-default hosts (the VM).

---

## 7. What's verified
- **Daml:** `daml test` → ok, 8/8 assertions (provider sees only own bid; buyer sees all; uninvolved sees none).
- **Over HTTP (P3.0):** created contracts via JSON API; query as each party → buyer `[28,31,42]`, providerA `[31]`, B `[42]`, C `[28]`.
- **Route writes (P3.1):** `/api/negotiate` returns real contract ids; independent ledger query confirms the fresh deal + visibility.
- **Route reads (P3.2):** `dealSource: 'ledger'`, each bid's `visibleTo` derived per-party, real Settlement contract id surfaced.
- **UI (headless Chromium):** idle / theater / reveal captured; reveal shows a real Canton contract id; Provider A sees its own `$31`, B/C frosted. Light theme correct at 1440×900.

---

## 8. Known gaps & integrity flags
1. **⚠️ “Atomic settlement” is aspirational.** Settlement is currently a dual-signatory **`create`** — losing bids aren't archived and no payment token moves. The Lens copy says “Settled atomically — payment + delivery in one Canton transaction.” **Fix = P2:** a Daml `choice` (`Award`) that archives bids + creates `Settlement` + moves a `Token`/IOU in one exercise. Until then, either build P2 or soften the copy.
2. Footer copy “live Canton ledger at P3” is now stale (it *is* live).
3. `TACIT_PACKAGE_ID` default is hardcoded; set the env if the DAR is rebuilt.
4. `/api/negotiate` is dev-bypassed by the x402 middleware; for prod it must be excluded from the payment matcher (a frozen file — handle at deploy).
5. Contracts accumulate on the ledger across runs (each run uses a unique `rfsId` to group them); fine for demo.
6. RFS text/labels in the read-back come from the negotiation core (participant-visible metadata); only the *price* and *settlement* visibility are ledger-derived.
7. No `.env` locally → agents run the deterministic fallback (“SIMULATED”). Add `GRADIENT_API_KEY` for “LIVE AI”.

---

## 9. What's left (to win)
- **P2 — atomic-settlement choice** (VM-independent; closes flag #1; strengthens technical execution). *Recommended next.*
- **Deploy to the VM** → the required **live product link** (LocalNet not needed; the sandbox stack runs on the VM, ~8 GB for the JVM).
- **Presentation deck** + **3-minute video** (recordable now against localhost — the spine works).
- **Optional ceiling-raisers:** **MCP** (expose Tacit as tools so any agent can transact privately on Canton — the differentiator), **auditor/regulator persona** in the Lens.

---

## 10. Decision log
- `2026-06-21` — Chose the Canton Foundation hackathon; pivoted the ParallaxPay *engine* (agents/marketplace/payments) onto Canton. Rejected invoice-financing as “correct but not winner energy.” Chose **private agent-to-agent commerce** = **Tacit**.
- `2026-06-21` — Fresh repo (dismissed old local git; GitHub copy untouched); renamed project → `tacit`.
- `2026-06-21` — **Demo-first**: built the Ledger Lens (P0) with mock data before any chain work; proved the sealed-bid model in real Daml (P1a).
- `~06-22..23` — Built the agent engine (P4.1) and the live `/lens` experience (P4.2).
- `~06-23..26` — **Override: light theme** (corrected the brief's dark assumption — the app is already a white theme; also de-Solana'd the accent to `#7C3AED`). **Override: no mocks** — implemented via a swappable `getDeal()` seam, fulfilled by the live ledger in P3.
- `~06-24..26` — Stood up local Canton (P3.0), wired writes (P3.1) and per-party reads (P3.2). Architecture locked: **Next.js → JSON Ledger API directly** (no Java/Spring quickstart backend). Local sandbox chosen over LocalNet for dev (Docker/VM-free, real-time reads).
- `2026-06-26` — Flagged the atomic-settlement gap (P2) before claiming “atomic” in the pitch.
