/**
 * Frosted-glass art as ATMOSPHERE only: large, soft, bled off-canvas, edges
 * feathered to nothing with a radial mask so it dissolves into #FAFAF9. Never
 * behind data/UI. Decorative — aria-hidden, non-interactive.
 */
export function AmbientArt({
  src,
  className,
  style,
  opacity = 0.5,
  width = 1200,
  height = 800,
  loading = 'lazy',
}: {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  opacity?: number;
  /** Intrinsic dimensions — set so the browser reserves no reflow (CLS ~0). */
  width?: number;
  height?: number;
  loading?: 'lazy' | 'eager';
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      className={className}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        objectFit: 'contain',
        opacity,
        WebkitMaskImage: 'radial-gradient(closest-side, #000 55%, transparent 100%)',
        maskImage: 'radial-gradient(closest-side, #000 55%, transparent 100%)',
        ...style,
      }}
    />
  );
}
