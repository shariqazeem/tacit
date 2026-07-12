# Tacit MCP server

Expose **Tacit** — private sealed-bid agent commerce on **Canton** — as tools any
MCP-capable AI agent (Claude Code, Claude Desktop, …) can call. An agent can run a
private procurement, atomically award **and pay** the winner, and get **real
Canton contract ids** back.

It is a **thin client** of the running Tacit app's HTTP API (`/api/negotiate`,
`/api/health`) — one source of truth. It never talks to Daml/Canton directly.

## Tools

**Primary workflow — Tacit Work (real provider spine):**
| Tool | Input | What it does |
|---|---|---|
| `tacit_work_health` | — | Is Canton devnet + all **three separate provider runner processes** ready? No simulation for work. |
| `tacit_procure_work` | `{ url, maxBudget, jobId?, buyerLabel? }` | Runs a **real** private procurement: three runner processes bid as distinct Canton parties, the winner performs a real `site_audit`, the buyer verifies the delivered bytes off-ledger, and an auditor-visible receipt is created. **No fallback** — errors if the network isn't ready. Reuse the same `jobId` to safely resume after a timeout (idempotent). |

**Original demo tools (backward compatible):**
| Tool | Input | What it does |
|---|---|---|
| `tacit_health` | — | Is the Tacit app + Canton ledger live? Returns status + package id. |
| `tacit_procure` | `{ description, maxBudget }` | The app-operated negotiation demo — sealed-bid procurement, atomic award + pay. Honestly labels **ON CANTON** vs **SIMULATION**. |
| `tacit_explain_privacy` | — | Explains the signatory/observer privacy model + what each persona sees. |

> `buyerLabel` is a display label only — the workflow acts through the pinned buyer party; it does **not** allocate a distinct Canton party. `USD.demo` is a demo voucher, not real money. The three runners are separate processes with distinct parties but share **one** hosted-validator credential — not separate validators or organizations.

## Build
```bash
cd mcp
npm install
npm run build      # → mcp/dist/server.js
```
Or from the repo root: `npm run mcp:build`.

## Prereq: point at a running Tacit app
The MCP server calls the app at `TACIT_APP_URL` (default `http://localhost:3100`).
**For the live devnet product, point it at the deployed HTTPS origin:**
```bash
TACIT_APP_URL=https://tacit.80-225-209-190.sslip.io
```
`tacit_work_health` / `tacit_procure_work` need a devnet app with three ready runners
(the deployed origin has them). To run your own, see the repo root `README.md`. For a
local on-ledger negotiation result:
```bash
TACIT_PACKAGE_ID=c0f7a95e01d57cc04dd72478d7886b98556d0831956767ac8e84f42b664bde1a PORT=3100 npm start
```
Without a ledger, `tacit_procure` still works but returns a clearly-labeled
**SIMULATION** result (no value moves).

## Register in Claude Code
```bash
claude mcp add tacit -- node /ABSOLUTE/PATH/TO/tacit/mcp/dist/server.js
# point it at a non-default app URL:
claude mcp add tacit --env TACIT_APP_URL=http://localhost:3100 -- node /ABSOLUTE/PATH/TO/tacit/mcp/dist/server.js
```
Then in Claude Code, `/mcp` lists **tacit** with its three tools.

## Register in Claude Desktop
`claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "tacit": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/tacit/mcp/dist/server.js"],
      "env": { "TACIT_APP_URL": "http://localhost:3100" }
    }
  }
}
```

## Sample transcript
```
> Use tacit to privately procure a "Competitive analysis of three DeFi lending protocols" with a $120 budget.

tacit_procure({ description: "Competitive analysis of three DeFi lending protocols", maxBudget: 120 })

PROCUREMENT — Competitive analysis of three DeFi lending protocols
Budget < $120 · 3 sealed bids received

✅ ON CANTON — awarded and paid in one atomic Daml transaction ...
Winner: Provider C at $67
Settlement contract: 00abc…
Payment: 67 USD.demo transferred to the winner — IOU contract 00def…

Sealed bids: each losing provider never saw competitors' prices — enforced by
Canton's signatory/observer model, not by application code.
View this deal in the Ledger Lens: http://localhost:3100/lens
```
