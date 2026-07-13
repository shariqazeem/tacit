'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { C, FONT, decisionOf } from '../../lens/components/theme';
import { Card, CopyId, Row, SectionTitle, StatChip } from './bits';
import { WorkLens } from './WorkLens';
import { PERSONA_META, POLICY_META, SEVERITY_TONE, type RunnerHealth, type VendorSecurityAssessmentReport, type WorkResult } from '../types';

/** The score as an arc that draws once on mount (instant under reduced-motion). */
function ScoreArc({ score, band, reduce }: { score: number; band: string; reduce: boolean }) {
  const tone = band === 'critical' || band === 'poor' ? '#B02A2A' : score >= 85 ? C.live : score >= 65 ? C.violet : C.fallback;
  const R = 30;
  const CIRC = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const [drawn, setDrawn] = useState(reduce);
  useEffect(() => {
    if (reduce) { setDrawn(true); return; }
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [reduce]);
  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: 72, height: 72 }}>
        <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden>
          <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(10,10,11,0.07)" strokeWidth="6" />
          <circle cx="36" cy="36" r={R} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={drawn ? CIRC * (1 - pct) : CIRC}
            transform="rotate(-90 36 36)" style={{ transition: reduce ? 'none' : 'stroke-dashoffset 0.9s var(--micro-ease)' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="t-numeral" style={{ color: C.ink, fontSize: 23 }}>{score}</span>
        </div>
      </div>
      <div>
        <div style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{band}</div>
        <div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>score / 100</div>
      </div>
    </div>
  );
}

function DnsChip({ label, state }: { label: string; state: string }) {
  const ok = state === 'present';
  const color = ok ? C.live : state === 'absent' ? C.fallback : C.ink3;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: C.surface, border: `1px solid ${C.hairline}`, fontFamily: FONT.mono, fontSize: 11, color: C.ink2 }}>
      <span aria-hidden style={{ color }}>{ok ? '✓' : state === 'absent' ? '✕' : '?'}</span>{label}
    </span>
  );
}

function PerfChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: C.surface, border: `1px solid ${C.hairline}`, fontFamily: FONT.mono, fontSize: 11, color: C.ink2 }}>
      <span style={{ color: C.ink3 }}>{label}</span>{value}
    </span>
  );
}

function PerformanceSection({ r }: { r: any }) {
  const bandTone = r.score.band === 'fast' ? C.live : r.score.band === 'moderate' ? C.violet : C.fallback;
  const maxTtfb = Math.max(1, ...r.samples.map((s: any) => s.ttfbMs));
  return (
    <Card>
      <SectionTitle kicker="bounded performance pre-screen">Private assessment</SectionTitle>
      <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
        <Row label="HTTP version" mono>{r.protocol.httpVersion}</Row>
        <Row label="Median TTFB" mono>{r.aggregates.ttfb.medianMs} ms</Row>
        <Row label="Median total" mono>{r.aggregates.total.medianMs} ms</Row>
        <Row label="TTFB range" mono>{r.aggregates.ttfb.minMs}–{r.aggregates.ttfb.maxMs} ms</Row>
        <Row label="Median TLS" mono>{r.aggregates.tls.medianMs} ms</Row>
        <Row label="Redirects" mono>{r.redirects.count}</Row>
      </div>

      <div className="mt-4">
        <div style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Per-sample TTFB (5 fresh connections)</div>
        <div className="mt-2 flex flex-col gap-1.5">
          {r.samples.map((s: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <span style={{ width: 42, color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5 }}>#{i + 1}</span>
              <div className="flex-1 rounded-full" style={{ height: 8, background: 'rgba(10,10,11,0.05)' }}>
                <div className="rounded-full" style={{ height: 8, width: `${Math.round((s.ttfbMs / maxTtfb) * 100)}%`, background: bandTone, transition: 'width .4s var(--micro-ease, ease)' }} />
              </div>
              <span style={{ width: 64, textAlign: 'right', color: C.ink2, fontFamily: FONT.mono, fontSize: 11 }}>{s.ttfbMs} ms</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <PerfChip label="type " value={r.transfer.contentType || '—'} />
        <PerfChip label="encoding " value={r.transfer.contentEncoding || 'none'} />
        {r.transfer.compressibleWithoutCompression && <span className="rounded-full px-2.5 py-1" style={{ background: 'rgba(180,83,9,0.1)', color: C.fallback, fontFamily: FONT.mono, fontSize: 11 }}>uncompressed</span>}
        <PerfChip label="cache " value={r.caching.cacheControl ? 'set' : r.caching.etag ? 'etag' : 'none'} />
      </div>

      {r.findings.length > 0 && (
        <div className="mt-4">
          <div style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{r.findings.length} finding(s)</div>
          <div className="mt-1.5 flex flex-col gap-2">
            {r.findings.map((f: any) => (
              <div key={f.id} className="rounded-xl px-3 py-2.5" style={{ background: C.bg, border: `1px solid ${C.hairline}` }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded px-1.5 py-0.5" style={{ background: `${SEVERITY_TONE[f.severity]}18`, color: SEVERITY_TONE[f.severity], fontFamily: FONT.mono, fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>{f.severity}</span>
                  <span style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 500 }}>{f.title}</span>
                </div>
                <div className="mt-1" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12 }}>{f.remediation}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11 }}>{(r.limitations || []).join(' ')}</p>
    </Card>
  );
}

export function WorkResultView({ result, runners }: { result: WorkResult; runners: RunnerHealth[] }) {
  const reduce = !!useReducedMotion();
  const raw = result.artifact.report;
  const rep = raw && raw.service === 'vendor_security_assessment' ? (raw as VendorSecurityAssessmentReport) : null;
  const perf = raw && raw.service === 'web_performance_probe' ? (raw as any) : null;
  const ev = result.evidence;
  const art = result.artifact;
  const bv = result.buyerVerification;
  const policy = result.policy;
  const dec = policy ? decisionOf(policy.decision) : null;
  const decisionColor = dec ? dec.fg : C.ink3;
  const policyLabel = POLICY_META.find((p) => p.id === policy?.policyId)?.label ?? policy?.policyId;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {/* ── 1) DECISION HERO — the decision word in the display serif ─── */}
      <Card style={{ borderColor: `${decisionColor}44` }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div style={{ minWidth: 0 }}>
            <div className="tacit-label" style={{ color: decisionColor }}>Policy decision</div>
            <div className="t-decision mt-1" style={{ color: decisionColor }}>{dec?.label ?? 'Delivered'}</div>
            <h2 className="mt-3" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', wordBreak: 'break-word' }}>{rep?.hostname || perf?.target?.host || result.input.url}</h2>
            <div style={{ color: C.ink2, fontFamily: FONT.mono, fontSize: 12.5, wordBreak: 'break-all' }}>{result.input.url}</div>
            {policy && <div className="mt-1" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 12 }}>Policy: {policyLabel} · {result.requestSource === 'mcp' ? 'via external MCP agent' : result.requestSource === 'console' ? 'via buyer agent console' : 'via browser'}</div>}
          </div>
          {rep && <ScoreArc score={rep.score} band={rep.riskBand} reduce={reduce} />}
          {perf && <ScoreArc score={perf.score.value} band={perf.score.band} reduce={reduce} />}
        </div>
        {policy && policy.reasonCodes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {policy.reasonCodes.slice(0, 5).map((r) => (
              <span key={r} className="rounded-md px-2 py-0.5" style={{ background: 'rgba(10,10,11,0.04)', fontFamily: FONT.mono, fontSize: 10.5, color: C.ink2 }}>{r}</span>
            ))}
          </div>
        )}
        {policy && <p className="mt-3" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5 }}>{policy.statement}</p>}
      </Card>

      {/* ── 2) PRIVATE ASSESSMENT ────────────────────────────────────── */}
      {rep && (
        <Card>
          <SectionTitle kicker="passive public web-security posture">Private assessment</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
            <Row label="HTTP status" mono>{rep.httpStatus}</Row>
            <Row label="TLS" mono>{rep.tls.protocol || '—'}</Row>
            <Row label="Cert issuer" mono>{rep.tls.certIssuer || '—'}</Row>
            <Row label="Cert expires" mono>{rep.tls.daysRemaining != null ? `${rep.tls.daysRemaining}d` : '—'}</Row>
            <Row label="Final URL" mono>{rep.finalUrl}</Row>
            <Row label="Sampled bytes" mono>{rep.sampledByteLength}</Row>
          </div>
          <div className="mt-4">
            <div style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Security headers</div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {Object.entries(rep.securityHeaders).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: C.surface, border: `1px solid ${C.hairline}`, fontFamily: FONT.mono, fontSize: 11, color: v.present ? C.ink : C.ink3 }}>
                  <span aria-hidden style={{ color: v.present ? C.live : C.fallback }}>{v.present ? '✓' : '✕'}</span>{k}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>DNS / mail</span>
              <DnsChip label="CAA" state={rep.dns.caa} /><DnsChip label="MX" state={rep.dns.mx} /><DnsChip label="SPF" state={rep.dns.spf} /><DnsChip label="DMARC" state={rep.dns.dmarc} />
            </div>
            <Row label="Cookies" mono>{rep.cookies.count} ({rep.cookies.secure} secure)</Row>
            <Row label="security.txt" mono>{rep.securityTxt.status}</Row>
          </div>

          {rep.findings.length > 0 && (
            <div className="mt-4">
              <div style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{rep.findings.length} finding(s)</div>
              <div className="mt-1.5 flex flex-col gap-2">
                {rep.findings.map((f) => (
                  <div key={f.id} className="rounded-xl px-3 py-2.5" style={{ background: C.bg, border: `1px solid ${C.hairline}` }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded px-1.5 py-0.5" style={{ background: `${SEVERITY_TONE[f.severity]}18`, color: SEVERITY_TONE[f.severity], fontFamily: FONT.mono, fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>{f.severity}</span>
                      <span style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 500 }}>{f.title}</span>
                    </div>
                    <div className="mt-1" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12 }}>{f.remediation}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="mt-3" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11 }}>{rep.limitations}</p>
        </Card>
      )}

      {/* ── 2b) PERFORMANCE ASSESSMENT ───────────────────────────────── */}
      {perf && <PerformanceSection r={perf} />}

      {/* ── 3) AGENT ACTIVITY ────────────────────────────────────────── */}
      <Card>
        <SectionTitle kicker="what the agents did">Agent activity</SectionTitle>
        <ol className="flex flex-col gap-1.5">
          {result.agentTrace.map((e, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: C.live }} />
              <span style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 12.5 }}>{e.step.replace(/_/g, ' ')}</span>
              <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11 }}>{e.detail}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11 }}>The procurement agent (buyer) is distinct from the three provider worker processes. Every step above corresponds to a completed ledger or verification operation.</p>
      </Card>

      {/* ── 4) PRIVATE MARKET ────────────────────────────────────────── */}
      <Card>
        <SectionTitle kicker="sealed-bid procurement">The private market</SectionTitle>
        <div className="flex flex-col gap-2">
          {result.bids.map((b) => (
            <div key={b.contractId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: b.winner ? C.violetSoft : 'transparent', border: `1px solid ${b.winner ? 'rgba(124,58,237,0.22)' : C.hairline}` }}>
              <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                <span aria-hidden style={{ color: C.violet }}>{PERSONA_META[b.providerLabel]?.glyph}</span>
                <span style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 500 }}>{PERSONA_META[b.providerLabel]?.label ?? b.providerLabel}</span>
                {b.winner && <StatChip label="won · awarded + prepaid" tone="live" />}
              </div>
              <div className="flex items-center gap-3">
                <span style={{ color: C.ink, fontFamily: FONT.mono, fontSize: 13 }}>{b.price.toFixed(2)} <span style={{ color: C.ink3 }}>USD.demo</span></span>
                <CopyId id={b.contractId} />
              </div>
            </div>
          ))}
          {result.bids.length === 0 && <div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 12.5 }}>Bids were archived on award (resumed job).</div>}
        </div>
        <div className="mt-3">
          <Row label="Amount" mono>{result.amount.toFixed(2)} USD.demo · demo voucher</Row>
          <div className="mt-2" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>Three separate provider processes · distinct Canton parties · one shared hosted-validator credential (not separate validators or organizations).</div>
          {runners.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {runners.map((r) => (
                <span key={r.instanceId} className="rounded-md px-2 py-1" style={{ background: 'rgba(10,10,11,0.03)', border: `1px solid ${C.hairline}`, fontFamily: FONT.mono, fontSize: 10.5, color: C.ink2 }}>{r.label} · {r.instanceId} · pid {r.pid}</span>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ── 5) DELIVERY VERIFICATION ─────────────────────────────────── */}
      <Card>
        <SectionTitle kicker="private delivery + independent buyer verification">Proof of delivery</SectionTitle>
        <div className="mb-3 flex flex-wrap gap-2">
          {[['hash', bv.hashOk], ['length', bv.lengthOk], ['schema', bv.schemaOk], ['target binding', bv.bindingOk], ['score', bv.scoreOk]].map(([label, ok]) => (
            <span key={label as string} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: C.surface, border: `1px solid ${C.hairline}`, fontFamily: FONT.mono, fontSize: 11, color: C.ink2 }}>
              <span aria-hidden style={{ color: ok ? C.live : C.ink3 }}>{ok ? '✓' : '—'}</span>{label}
            </span>
          ))}
        </div>
        {art.buyerComputedSha256 && bv.hashOk ? (
          <div className="mb-3 flex flex-col gap-2 rounded-2xl p-3.5" style={{ background: `${C.live}0a`, border: `1px solid ${C.live}3a` }}>
            <div className="flex items-center justify-between gap-3">
              <span className="tacit-label" style={{ color: C.ink2 }}>Provider commitment · on-ledger</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.ink }}>{art.providerCommittedSha256.slice(0, 22)}…</span>
            </div>
            <div className="flex items-center justify-center gap-2" style={{ color: C.live }}>
              <span aria-hidden style={{ height: 1, width: 18, background: `${C.live}55` }} />
              <span style={{ fontFamily: FONT.mono, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.08em' }}>= hashes match</span>
              <span aria-hidden style={{ height: 1, width: 18, background: `${C.live}55` }} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="tacit-label" style={{ color: C.ink2 }}>Buyer re-hash · off-ledger</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.ink }}>{art.buyerComputedSha256.slice(0, 22)}…</span>
            </div>
          </div>
        ) : (
          <>
            <Row label="Provider commitment (on-ledger)" mono>{art.providerCommittedSha256.slice(0, 24)}…</Row>
            <Row label="Buyer-computed SHA-256 (off-ledger)" mono>{art.buyerComputedSha256 ? `${art.buyerComputedSha256.slice(0, 24)}…` : 'not computed (resumed)'}</Row>
          </>
        )}
        <Row label="Byte length" mono>{art.byteLength}{art.buyerComputedByteLength != null ? ` (buyer: ${art.buyerComputedByteLength})` : ''}</Row>
        <Row label="Settlement"><CopyId id={ev.settlementContractId} /></Row>
        {ev.paymentIouContractId && <Row label="Payment IOU"><CopyId id={ev.paymentIouContractId} /></Row>}
        {ev.assignmentContractId && <Row label="Assignment"><CopyId id={ev.assignmentContractId} /></Row>}
        {ev.deliveryContractId && <Row label="Private delivery"><CopyId id={ev.deliveryContractId} /></Row>}
        <Row label="Delivery receipt"><CopyId id={ev.receiptContractId} /></Row>
        <p className="mt-3" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5 }}>Canton proves who can see what, that payment happened, and that a commitment was made. The buyer independently recomputes the hash and validates the schema, target and score off-ledger. Canton does not verify SHA-256 or report correctness.</p>
      </Card>

      {/* ── 6) PRIVACY LENS ──────────────────────────────────────────── */}
      {result.visibility.available && (
        <div>
          <SectionTitle kicker="ledger-enforced visibility">See it from each party</SectionTitle>
          <WorkLens result={result} />
        </div>
      )}
    </div>
  );
}
