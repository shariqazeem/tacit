'use client';

import { C, FONT } from '../../lens/components/theme';
import { Card, CopyId, Row, SectionTitle, StatChip } from './bits';
import { WorkLens } from './WorkLens';
import { PERSONA_META, type RunnerHealth, type WorkResult } from '../types';

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 80 ? C.live : score >= 50 ? C.violet : C.fallback;
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${tone} ${score * 3.6}deg, rgba(10,10,11,0.06) 0deg)` }}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: C.surface }}>
          <span style={{ color: C.ink, fontFamily: FONT.mono, fontSize: 15, fontWeight: 600 }}>{score}</span>
        </div>
      </div>
      <div>
        <div style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600 }}>Audit score</div>
        <div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>from observed checks</div>
      </div>
    </div>
  );
}

export function WorkResultView({ result, runners }: { result: WorkResult; runners: RunnerHealth[] }) {
  const rep = result.artifact.report;
  const ev = result.evidence;
  const hashMatch = result.artifact.verifiedThisRequest;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {/* ── 1) utility first ─────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div style={{ minWidth: 0 }}>
            <div className="mb-1 inline-flex items-center gap-2">
              <StatChip label="Audit delivered" tone="live" />
            </div>
            <h2 style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', wordBreak: 'break-word' }}>
              {rep?.pageTitle || result.input.url}
            </h2>
            <div style={{ color: C.ink2, fontFamily: FONT.mono, fontSize: 12.5, wordBreak: 'break-all' }}>{result.input.url}</div>
          </div>
          {rep && <ScoreRing score={rep.score} />}
        </div>

        {rep && (
          <div className="mt-4 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
            <Row label="HTTP status" mono>{rep.httpStatus}</Row>
            <Row label="Latency" mono>{rep.responseLatencyMs} ms</Row>
            <Row label="HTTPS" mono>{rep.https ? 'yes' : 'no'}</Row>
            <Row label="Final URL" mono>{rep.finalUrl}</Row>
            <Row label="Content type" mono>{rep.contentType || '—'}</Row>
            <Row label="Sampled bytes" mono>{rep.sampledByteLength}</Row>
          </div>
        )}

        {rep && (
          <div className="mt-4">
            <SectionTitle kicker="observed">Security headers</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {Object.entries(rep.securityHeaders).map(([k, present]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                  style={{ background: C.surface, border: `1px solid ${C.hairline}`, fontFamily: FONT.mono, fontSize: 11, color: present ? C.ink : C.ink3 }}
                >
                  <span aria-hidden style={{ color: present ? C.live : C.fallback }}>{present ? '✓' : '✕'}</span>
                  {k}
                </span>
              ))}
            </div>
            {rep.findings.length > 0 && (
              <p className="mt-3" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12.5 }}>
                {rep.findings.length} finding{rep.findings.length === 1 ? '' : 's'}: {rep.findings.join(' · ')}
              </p>
            )}
            <div className="mt-2" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>
              Audited {rep.auditedAtUtc} · {result.artifact.byteLength} bytes
            </div>
          </div>
        )}
      </Card>

      {/* ── 2) the private market ────────────────────────────────────── */}
      <Card>
        <SectionTitle kicker="sealed-bid procurement">The private market</SectionTitle>
        <div className="flex flex-col gap-2">
          {result.bids.map((b) => (
            <div
              key={b.contractId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2.5"
              style={{ background: b.winner ? C.violetSoft : 'transparent', border: `1px solid ${b.winner ? 'rgba(124,58,237,0.22)' : C.hairline}` }}
            >
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
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
          <Row label="Winner">{PERSONA_META[result.winner.providerLabel]?.label ?? result.winner.providerLabel}</Row>
          <Row label="Amount" mono>{result.amount.toFixed(2)} USD.demo · demo voucher</Row>
        </div>
        {runners.length > 0 && (
          <div className="mt-3">
            <div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>
              Three separate runner processes · distinct Canton parties · one shared hosted-validator credential
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {runners.map((r) => (
                <span key={r.instanceId} className="rounded-md px-2 py-1" style={{ background: 'rgba(10,10,11,0.03)', border: `1px solid ${C.hairline}`, fontFamily: FONT.mono, fontSize: 10.5, color: C.ink2 }}>
                  {r.label} · {r.instanceId} · pid {r.pid}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── 3) delivery proof ────────────────────────────────────────── */}
      <Card>
        <SectionTitle kicker="private delivery + off-ledger verification">Proof of delivery</SectionTitle>
        <div
          className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5"
          style={{ background: hashMatch ? 'rgba(13,148,136,0.06)' : 'rgba(180,83,9,0.06)', border: `1px solid ${hashMatch ? 'rgba(13,148,136,0.25)' : 'rgba(180,83,9,0.25)'}` }}
        >
          <span aria-hidden style={{ color: hashMatch ? C.live : C.fallback, fontSize: 15 }}>{hashMatch ? '✓' : '⚠'}</span>
          <span style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13 }}>
            {hashMatch ? 'Buyer recomputed the SHA-256 of the delivered bytes — it matches the on-ledger commitment.' : 'Report body was not reloaded this request.'}
          </span>
        </div>
        <Row label="Buyer-computed SHA-256" mono>{result.artifact.sha256.slice(0, 24)}…</Row>
        <Row label="Ledger commitment" mono>{result.artifact.sha256.slice(0, 24)}…</Row>
        <Row label="Byte length" mono>{result.artifact.byteLength}</Row>
        <Row label="Settlement"><CopyId id={ev.settlementContractId} /></Row>
        {ev.paymentIouContractId && <Row label="Payment IOU"><CopyId id={ev.paymentIouContractId} /></Row>}
        {ev.assignmentContractId && <Row label="Assignment"><CopyId id={ev.assignmentContractId} /></Row>}
        {ev.deliveryContractId && <Row label="Private delivery"><CopyId id={ev.deliveryContractId} /></Row>}
        <Row label="Delivery receipt"><CopyId id={ev.receiptContractId} /></Row>
        <p className="mt-3" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5 }}>
          Canton proves who can see what, that payment happened, and that a commitment was made. The buyer proves the
          bytes match, off-ledger. The receipt records acceptance of committed bytes — not objective report quality.
        </p>
      </Card>

      {/* ── 4) the privacy lens ──────────────────────────────────────── */}
      {result.visibility.available && (
        <div>
          <SectionTitle kicker="ledger-enforced visibility">See it from each party</SectionTitle>
          <WorkLens result={result} />
        </div>
      )}
    </div>
  );
}
