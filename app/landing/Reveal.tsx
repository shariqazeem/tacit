'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { microEase } from '../lens/components/theme';

/**
 * Scroll-triggered entrance (once). Always carries `data-reveal` so that:
 *   - prefers-reduced-motion pins it visible (globals.css !important rule), and
 *   - JS-off pins it visible (the <noscript> style in the root layout).
 * So content is visible-by-default; the rise is pure enhancement.
 */
export function Reveal({
  children,
  className,
  style,
  delay = 0,
  y = 24,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
  y?: number;
}) {
  return (
    <motion.div
      data-reveal
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.6, ease: microEase, delay }}
    >
      {children}
    </motion.div>
  );
}
