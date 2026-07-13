# Tacit — Design Direction

**Concept: privacy as material.** Tacit's one idea is that the *ledger*, not the app,
decides who sees what. The design makes that physical. Two materials carry every
surface, and they are never decorative — each appears only where it is literally true.

- **CLEAR** — public, verifiable facts. White surface, one 1px hairline in low-alpha
  ink, crisp type, full contrast, at most one soft elevation. This is the default.
- **FROST** — ledger-*sealed* facts. A translucent panel with backdrop blur + slight
  saturation, a whisper of inline-SVG noise, and a mono **"Sealed"** caption with a lock
  glyph. Frost appears **only** where Canton actually withholds data: the Lens private
  cells, the /market report-body column, and any sealed-bid representation in the running
  narration. If data is visible, it is Clear; if the ledger refuses it, it is Frost.

## Type
One editorial display serif — **Fraunces** (variable, optical; self-hosted via `next/font`)
— for page statements, the decision word, and large numerals only. **Inter** for all UI.
**JetBrains Mono** strictly for evidence (contract ids, hashes, amounts, timestamps).

| role | face | size / weight / tracking / leading |
|---|---|---|
| `t-display` | Fraunces | clamp(40→68px) · 500 · -0.02em · 1.02 |
| `t-decision` | Fraunces | clamp(34→52px) · 560 · -0.02em · 1.0 · semantic color |
| `t-numeral` | Fraunces | inherits size · 500 · -0.01em · tnum (big stats/scores) |
| `t-h2` | Inter | clamp(22→30px) · 600 · -0.02em · 1.12 |
| `t-title` | Inter | 15–16px · 600 · -0.01em · 1.3 |
| `t-body` | Inter | 15px · 400 · 1.55 |
| `t-caption` | Inter | 13px · 400 · 1.5 |
| `t-label` | Inter | 11px · 500 · +0.08em · uppercase · ink-3 |
| `t-mono` | JetBrains Mono | 12–13px · 400/500 · tnum (evidence only) |

Weight discipline: nothing heavier than **600** except Fraunces, whose optical design
carries 500–560 at display size.

## Color — evolve, don't rebrand
Warm paper ground `#FAFAF9`; ink ramp of **three tints** (`#0A0A0B` / 62% / 38%) + a 6%
hairline. **Violet `#7C3AED`** is the single accent — interactive affordances and brand
moments only, never as fill for data. Honesty signals stay: `--live #0D9488`,
`--fallback #B45309`.

**Semantic decision set — used ONLY on decision surfaces** (all ≥4.5:1 on paper):
`approve #0F766E` (teal) · `approve-with-conditions #B45309` (amber) ·
`human-review #4C1D95` (violet-ink) · `reject #B02A2A` (restrained brick).

## Space & rhythm
4/8px scale. Per-page max-widths (work ~720, market ~1040, reading ~640). Generous
negative space. **Hairlines over shadows** — one soft elevation level max
(`0 1px 2px / 0 12px 32px` at ≤6% ink). Radii: 12 (controls) / 16 (cards) / 20 (heroes).

## Motion — one family
Ease `cubic-bezier(0.32,0.72,0,1)`; durations 120ms (micro) / 260ms (enter) / 600ms
(hero + score arc). Page enter = fade + 8px rise (staggered 60ms). Narration stage lines
materialize as their contracts confirm. Frost panels **condense in** (blur+opacity
settle). Market numerals transition value **without layout shift** (fixed cell width,
tabular-nums). The score arc draws once. **`prefers-reduced-motion`: every animation
becomes an instant end-state** — motion is enhancement, never information.

## Performance & a11y guardrails
Backdrop-filter capped at ~3 frosted layers per viewport, each with a translucent solid
fallback (`@supports not (backdrop-filter)`). Visible **violet focus ring** on
`:focus-visible` only (designed, not browser-blue). Keyboard order follows reading order;
aria-live regions preserved. No horizontal overflow at 375px; no layout shift on /market
refresh.

## Shipped deviations (kept honest per the note below)
- **OG image serif**: `public/og.png` is rasterized at build with `sharp`, whose SVG
  renderer only has system fonts — so the OG headline uses a system serif (Georgia/Times),
  not Fraunces. In-app text uses real Fraunces via `next/font`; only the static social
  card differs, and the two are visually close. Accepted to keep the OG a committed static
  asset (no build-time font embedding pipeline).
- **Landing sections** are unchanged this pass (nav + tokens inherited only), per scope.

> Implementation note: if a surface forces a deviation from this document, the document is
> updated in the same commit so it always describes what shipped.
