import type { Page, LocationUnion } from './types';

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
 * Returns e.g. "Jun 10, 2026", "Jun 10-15, 2026", "Jun 10 - Jul 2, 2026".
 */
export function formatDateRange(firstDate: string, lastDate: string): string {
  const parseDate = (isoStr: string) => {
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      return new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10)
      );
    }
    return null;
  };

  const first = parseDate(firstDate);
  const last = parseDate(lastDate);

  if (!first || !last) return firstDate;

  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  
  const fMonth = months[first.getMonth()];
  const fDay = first.getDate();
  const fYear = first.getFullYear();

  const lMonth = months[last.getMonth()];
  const lDay = last.getDate();
  const lYear = last.getFullYear();

  if (firstDate === lastDate) {
    return `${fMonth} ${fDay}, ${fYear}`;
  }

  if (fYear === lYear) {
    if (fMonth === lMonth) {
      return `${fMonth} ${fDay} — ${lDay}, ${fYear}`;
    }
    return `${fMonth} ${fDay} — ${lMonth} ${lDay}, ${fYear}`;
  }

  return `${fMonth} ${fDay}, ${fYear} — ${lMonth} ${lDay}, ${lYear}`;
}

/**
 * Builds a deduped, chronologically-ordered array of distinct named stops
 * for a ride, starting from the departure point. Returns e.g.
 * ["Mysore", "Coorg", "Kochi", "Alleppey"].
 */
export function buildStops(startLocation: LocationUnion | null | undefined, sortedPages: Page[]): string[] {
  const seen = new Set<string>();
  const places: string[] = [];

  const add = (name: string) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    places.push(name.trim());
  };

  if (startLocation?.name) {
    add(startLocation.name);
  }

  for (const page of sortedPages) {
    if (page.location?.name) {
      add(page.location.name);
    }
  }

  return places;
}

/**
 * Builds a deduped, chronologically-ordered trail of distinct named stops
 * for a ride, starting from the departure point. Returns e.g.
 * "Mysore → Coorg → Kochi → Alleppey".
 */
export function buildStopTrail(startLocation: LocationUnion | null | undefined, sortedPages: Page[]): string {
  return buildStops(startLocation, sortedPages).join(' → ');
}

/**
 * Computes the per-day cumulative distance for a trip from its pages,
 * using the same km/odo anchoring rules as computeTotalDistance.
 * Returns a map of date (YYYY-MM-DD) → km.
 */
export function computeDayDistances(pages: Page[], startOdo?: number | null): Map<string, number> {
  const sorted = [...pages].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map<string, number>();
  let lastOdo: number | null = startOdo ?? null;

  for (const page of sorted) {
    let delta = 0;
    if (page.km != null) {
      delta = page.km;
      if (page.odo != null) {
        lastOdo = page.odo;
      }
    } else if (page.odo != null) {
      if (lastOdo != null && page.odo > lastOdo) {
        delta = page.odo - lastOdo;
      }
      lastOdo = page.odo;
    }
    byDate.set(page.date, (byDate.get(page.date) || 0) + delta);
  }

  return byDate;
}

/**
 * Formats a YYYY-MM-DD string to DD-MM-YYYY.
 */
export function formatIsoDateToDMY(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}
