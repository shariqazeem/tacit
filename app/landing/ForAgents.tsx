'use client';

import { C, FONT } from '../lens/components/theme';
import { Reveal } from './Reveal';

const TOOLS = [
  { n: 'tacit_assess_vendor', d: 'hire the market to run a vendor-security assessment and get the verified decision' },
  { n: 'tacit_probe_performance', d: 'hire a web-performance probe under a latency SLO policy' },
  { n: 'tacit_market_overview', d: 'read the auditor’s view — track records before you procure' },
];

const SNIPPET = `{
  "mcpServers": {
    "tacit": {
      "command": "node",
      "args": ["mcp/dist/server.js"],
      "env": { "TACIT_APP_URL": "https://tacit.80-225-209-190.sslip.io" }
    }
  }
}`;

export function ForAgents() {
  return (
    <section className="w-full px-6 py-24 sm:py-28" style={{ background: C.surface, borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}` }}>
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-10 sm:grid-cols-2">
        <Reveal>
          <div style={{ color: C.violet, fontFamily: FONT.mono, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' }}>For agents</div>
          <h2 className="mt-3 t-h2" style={{ color: C.ink, maxWidth: '18ch' }}>Bring your own agent.</h2>
          <p className="mt-4" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 15, lineHeight: 1.6, maxWidth: '46ch' }}>
            The web console and MCP are the same buyer path, two clients. Point any MCP-speaking agent at
            Tacit and it can hire the market directly — the LLM only proposes; a deterministic policy decides.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {TOOLS.map((t) => (
              <div key={t.n} className="flex flex-col gap-0.5">
                <code style={{ fontFamily: FONT.mono, fontSize: 13, color: C.ink, background: C.violetSoft, padding: '2px 8px', borderRadius: 8, width: 'fit-content' }}>{t.n}</code>
                <span style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12.5, lineHeight: 1.4 }}>{t.d}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="material-clear" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${C.hairline}` }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.live }} aria-hidden />
              <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11 }}>mcp client config</span>
            </div>
            <pre className="px-4 py-3.5" style={{ margin: 0, overflowX: 'auto', color: C.ink, fontFamily: FONT.mono, fontSize: 12, lineHeight: 1.55 }}>{SNIPPET}</pre>
          </div>
          <p className="mt-3" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 12 }}>Build the server with <code style={{ fontFamily: FONT.mono }}>npm run mcp:build</code>; it speaks stdio JSON-RPC, zero extra services.</p>
        </Reveal>
      </div>
    </section>
  );
}
