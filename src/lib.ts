import type { Page } from './types';

/**
 * Computes the cumulative distance for a trip from its pages.
 * Rules:
 * - Pages are sorted chronologically by date.
 * - If a page has `km`, that direct distance is added. If it also has `odo`, we update our `lastOdo` anchor.
 * - If a page has `odo` (and no `km`), and we have a preceding `lastOdo` anchor, we add (odo - lastOdo) to the total.
 * - Otherwise, if page only has `odo` and no preceding anchor, we establish `lastOdo = odo` and add 0.
 */
export function computeTotalDistance(pages: Page[]): number {
  const sorted = [...pages].sort((a, b) => a.date.localeCompare(b.date));
  let total = 0;
  let lastOdo: number | null = null;

  for (const page of sorted) {
    if (page.km != null) {
      total += page.km;
      if (page.odo != null) {
        lastOdo = page.odo;
      }
    } else if (page.odo != null) {
      if (lastOdo != null) {
        if (page.odo > lastOdo) {
          total += (page.odo - lastOdo);
        }
      }
      lastOdo = page.odo;
    }
  }

  return total;
}

/**
 * Formats a distance number with a thousands separator and "km" unit.
 */
export function formatDistance(km: number): string {
  return `${Math.round(km).toLocaleString()} km`;
}
