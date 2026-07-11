# Tacit MCP server

Expose **Tacit** — private sealed-bid agent commerce on **Canton** — as tools any
MCP-capable AI agent (Claude Code, Claude Desktop, …) can call. An agent can run a
private procurement, atomically award **and pay** the winner, and get **real
Canton contract ids** back.

It is a **thin client** of the running Tacit app's HTTP API (`/api/negotiate`,
`/api/health`) — one source of truth. It never talks to Daml/Canton directly.

## Tools
| Tool | Input | What it does |
|---|---|---|
| `tacit_health` | — | Is the Tacit app + Canton ledger live? Returns status + package id. |
| `tacit_procure` | `{ description: string, maxBudget: number }` | Runs a private sealed-bid procurement, awards & pays the winner atomically on Canton, returns the settlement + IOU contract ids. Honestly labels **ON CANTON** vs **SIMULATION**. |
| `tacit_explain_privacy` | — | Explains the signatory/observer privacy model + what each persona sees. |

## Build
```bash
cd mcp
npm install
npm run build      # → mcp/dist/server.js
```
Or from the repo root: `npm run mcp:build`.

## Prereq: the Tacit app must be running
The MCP server calls the app at `TACIT_APP_URL` (default `http://localhost:3100`).
Start the app (and, for real settlements, the Canton stack) — see the repo root
`README.md`. For a real on-ledger result:
```bash
TACIT_PACKAGE_ID=c0f7a95e01d57cc04dd72478d7886b98556d0831956767ac8e84f42b664bde1a PORT=3100 npm start
```
Without a ledger, `tacit_procure` still works but returns a clearly-labeled
**SIMULATION** result (no value moves).

## Register in Claude Code
```bash
claude mcp add tacit -- node /ABSOLUTE/PATH/TO/parallaxpay_x402/mcp/dist/server.js
# point it at a non-default app URL:
claude mcp add tacit --env TACIT_APP_URL=http://localhost:3100 -- node /ABSOLUTE/PATH/TO/parallaxpay_x402/mcp/dist/server.js
```
Then in Claude Code, `/mcp` lists **tacit** with its three tools.

## Register in Claude Desktop
`claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "tacit": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/parallaxpay_x402/mcp/dist/server.js"],
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
