/**
 * `useIncrementalScan` — kicks off a background connector rescan on a
 * timer, only emitting a change signal when new sessions were indexed.
 *
 * The consumer is responsible for what to do on a new-session tick
 * (typically: reload metadata and refresh the current view).
 */
import { useEffect } from 'react';

import * as api from '../api';

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_LOOKBACK_MS = 30_000;

export function useIncrementalScan(
  onChange: () => void | Promise<void>,
  options: { intervalMs?: number; lookbackMs?: number } = {},
): void {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const lookbackMs = options.lookbackMs ?? DEFAULT_LOOKBACK_MS;

  useEffect(() => {
    const run = async () => {
      try {
        const count = await api.scanIncremental(
          new Date(Date.now() - lookbackMs).toISOString(),
        );

        if (count > 0) {
          await onChange();
        }
      } catch (error) {
        console.error('[recall] Incremental scan failed:', error);
      }
    };

    const interval = window.setInterval(() => {
      void run();
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [intervalMs, lookbackMs, onChange]);
}
