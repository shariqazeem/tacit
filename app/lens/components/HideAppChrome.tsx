'use client';

import { useEffect } from 'react';
import './lens-chrome.css';

/**
 * Route-scoped demo hygiene. While the Ledger Lens is mounted, adds the
 * `lens-route` class to <body>, which activates the scoped rule in
 * lens-chrome.css that hides the Next.js dev-tools indicator (the floating
 * "N"). Removes the class on unmount so every other route is unaffected.
 *
 * Renders nothing. Does NOT touch Lens visibility/data — chrome only.
 */
export function HideAppChrome() {
  useEffect(() => {
    document.body.classList.add('lens-route');
    return () => {
      document.body.classList.remove('lens-route');
    };
  }, []);

  return null;
}
