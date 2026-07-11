# Tacit — Deployment

Tacit is two pieces:

```
Browser ─▶ Next.js app (this repo) ─▶ [v2 JSON Ledger API] ─▶ Canton 3.x participant ─▶ (Global Synchronizer)
           deploy anywhere                                     a real, always-on node
```

The app is a thin **HTTP client of a ledger**. It targets one of three ledgers, chosen purely by env (`TACIT_LEDGER_MODE`), so moving from a laptop to the shared devnet is a config flip — no code change.

| Mode | Ledger | Auth | Package id | Use |
|---|---|---|---|---|
| `sandbox` (default) | Daml 2.x sandbox, **v1** JSON API | dev HS256 | `c0f7a95e…` | offline demo / DEMO FALLBACK tier |
| `canton3-local` | **Canton 3.x** participant (Splice LocalNet or `daml sandbox`), **v2** JSON API | none/static | `fdfbfcf0…` | real-Canton rehearsal — the exact devnet code path |
| `devnet` | shared **Canton devnet** via a Splice validator, **v2** JSON API | OAuth2 / static | `fdfbfcf0…` | the live submission target |

The v2 templates DAR (`fdfbfcf0…`) is the v1 model recompiled **verbatim** under Daml 3.4.11 (`npm run daml:build:v2`; proof: `npm run daml:test:v2`).

---

## A. Real Canton 3.x now — Splice LocalNet (no sponsor, no allowlist)

LocalNet is a complete, self-contained Canton Network (SV + validator + synchronizer + the **v2 JSON Ledger API**) that runs on one box. It's the fastest way to run Tacit on real Canton 3.x and to verify the whole devnet path. Footprint ≈ 8 GB (one `canton` JVM + one `splice-app` JVM + postgres).

**On the host (Ubuntu, Docker + docker-compose v2.26+, ~8 GB free):**

```bash
# 1. Get the Splice bundle (ARM64 + AMD64 both supported)
curl -fsSL -o splice-node.tar.gz \
  https://github.com/digital-asset/decentralized-canton-sync/releases/download/v0.6.12/0.6.12_splice-node.tar.gz
tar xzf splice-node.tar.gz
cd splice-node/docker-compose/localnet

# 2. Bring up SV + app-provider only (app-user off to save RAM; move UI off :3000)
export IMAGE_TAG=0.6.12 SV_PROFILE=on APP_PROVIDER_PROFILE=on APP_USER_PROFILE=off APP_PROVIDER_UI_PORT=3300
docker compose --env-file compose.env --env-file env/common.env \
  -f compose.yaml -f resource-constraints.yaml \
  --profile sv --profile app-provider up -d
# wait ~2-5 min for the local network to bootstrap
```

The **app-provider participant's JSON Ledger API** is published directly at **`localhost:3975`**
(SV=`4975`, app-user=`2975`). LocalNet uses unsafe dev auth (`SPLICE_APP_UI_UNSAFE=true`, HS256 secret `unsafe`).

**Bootstrap Tacit (upload DAR + allocate parties) and run the app:**

```bash
# from the tacit repo checkout (needs the v2 DAR at daml3/.daml/dist/tacit-0.1.0.dar and node)
TACIT_V2_API_URL=http://localhost:3975 TACIT_V2_AUTH=static TACIT_V2_STATIC_TOKEN=<unsafe-jwt> \
  node scripts/devnet-bootstrap.mjs

# run the app against it
TACIT_LEDGER_MODE=canton3-local \
TACIT_V2_API_URL=http://localhost:3975 \
TACIT_V2_AUTH=static TACIT_V2_STATIC_TOKEN=<unsafe-jwt> \
PORT=3100 npm start

# prove it end-to-end (privacy invariants + evidence block)
APP_URL=http://localhost:3100 npm run preflight:e2e -- --require-ledger
```

> An unsafe LocalNet JWT is an HS256 token signed with secret `unsafe` (`aud` per the participant's ledger-api config, `sub` = the ledger-api user). If the participant is started with ledger-api auth disabled, use `TACIT_V2_AUTH=none` and skip the token.

Stop: `docker compose … --profile sv --profile app-provider down -v`.

---

## B. The shared Canton devnet (the submission target)

Devnet is gated: your validator's **egress IP must be on the SV allowlist** (adoption "usually takes 2–7 days") and you need a **sponsoring SV**. There is **no fully self-serve path** — but the onboarding *secret* is self-generated once your IP is allowlisted.

### B.1 Request package (send to the hackathon's designated SV sponsor)
- **Egress IP to allowlist:** `80.225.209.190`  *(the validator VM's public IP; one IP per network)*
- **Network:** DevNet
- **Party hint / participant id:** `tacit` (suggested)
- Ask for: the **sponsor SV app URL** (`https://sv.<node>.dev.global.canton.network.<operator>`) and confirmation once the IP is adopted.

### B.2 Once the IP is allowlisted — deploy the validator
```bash
cd splice-node/docker-compose/validator
# self-serve the DevNet onboarding secret (valid 1 hour) — must run from the allowlisted IP:
SECRET=$(curl -sSf -X POST "$SPONSOR_SV_URL/api/sv/v0/devnet/onboard/validator/prepare" | jq -r '.secret // .onboarding_secret // .')
# start the validator (no -a => ledger-api auth disabled; JSON API at json-ledger-api.localhost → participant:7575)
./start.sh -s "$SPONSOR_SV_URL" -o "$SECRET" -p tacit -w
```
The participant's **v2 JSON Ledger API** is reachable at `http://json-ledger-api.localhost` (nginx → `participant:7575`, bound to `127.0.0.1:80`).

### B.3 Bootstrap + flip Tacit to devnet
```bash
TACIT_V2_API_URL=http://json-ledger-api.localhost TACIT_V2_AUTH=none node scripts/devnet-bootstrap.mjs

TACIT_LEDGER_MODE=devnet \
TACIT_V2_API_URL=http://json-ledger-api.localhost \
TACIT_V2_AUTH=none \
NEXT_PUBLIC_APP_URL=https://<public-url> \
PORT=3100 npm start
```
The SourceBadge now reads **ON CANTON DEVNET** (only because `/api/health` truly probes a devnet participant), and `preflight:e2e` records the real devnet contract ids into the evidence block.

> **Auth on devnet:** if the participant's ledger API requires OAuth, set `TACIT_V2_AUTH=oauth` +
> `TACIT_DEVNET_TOKEN_URL/_CLIENT_ID/_CLIENT_SECRET/_AUDIENCE`. The adapter caches the token and refreshes on 401.

---

## C. Hosting the app
- **Same VM as the node (recommended):** the app reaches the participant over `localhost` — the raw ledger API is never exposed publicly. Front it with Caddy/nginx for TLS + a public URL.
- **Vercel:** works, but only if the participant's JSON API is reachable from Vercel behind auth+TLS. Never expose an unauthenticated ledger API publicly.

All public-URL/OG metadata is env-driven via `NEXT_PUBLIC_APP_URL` (see `.env.example`). `/api/health` reports the true mode + reachability so the badge can never overclaim.
