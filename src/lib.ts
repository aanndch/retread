import type { Page } from './types';

/**
 * Computes the cumulative distance for a trip from its pages.
 * Rules:
 * - Pages are sorted chronologically by date.
 * - If a page has `km`, that direct distance is added. If it also has `odo`, we update our `lastOdo` anchor.
 * - If a page has `odo` (and no `km`), and we have a preceding `lastOdo` anchor, we add (odo - lastOdo) to the total.
 * - Otherwise, if page only has `odo` and no preceding anchor, we establish `lastOdo = odo` and add 0.
 */
export function computeTotalDistance(pages: Page[], startOdo?: number | null): number {
  const sorted = [...pages].sort((a, b) => a.date.localeCompare(b.date));
  let total = 0;
  let lastOdo: number | null = startOdo ?? null;

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

/**
 * Formats a date range from first to last ISO date strings.
 * Returns "Jun 10, 2026" for single day, "Jun 10 – 14, 2026" for same month,
 * or "Jun 10 – Jul 2, 2026" for different months.
 */
export function formatDateRange(firstDate: string, lastDate: string): string {
  const formatDate = (isoStr: string) => {
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      const d = new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10),
      );
      return d;
    }
    return null;
  };

  const first = formatDate(firstDate);
  const last = formatDate(lastDate);

  if (!first || !last) return firstDate;

  if (firstDate === lastDate) {
    return first.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  const sameYear = first.getFullYear() === last.getFullYear();
  const sameMonth = sameYear && first.getMonth() === last.getMonth();

  if (sameMonth) {
    const dayStart = first.toLocaleDateString(undefined, { day: 'numeric' });
    const monthEnd = last.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${dayStart} – ${monthEnd}`;
  }

  const start = first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const end = last.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${start} – ${end}`;
}
