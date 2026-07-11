'use client';

/**
 * GPU-cheap ambient field: two violet + one warm-neutral blurred radial
 * gradients drifting on 45–60s transform loops, plus a faint SVG-noise overlay
 * to kill banding. Transform/opacity only. The drift is disabled under
 * prefers-reduced-motion (see globals.css). Purely decorative.
 */
export function AmbientBackground() {
  return (
    <div className="ambient" aria-hidden>
      <span className="ambient-blob a" />
      <span className="ambient-blob b" />
      <span className="ambient-blob c" />
      <span className="noise" />
    </div>
  );
}
