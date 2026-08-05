import type { Leg, LocationUnion } from './types';

/**
 * Computes the cumulative distance for a ride from its legs.
 * Legs are sorted chronologically by date; each leg's direct `km` is summed.
 */
export function computeTotalDistance(legs: Leg[]): number {
  const sorted = [...legs].sort((a, b) => a.date.localeCompare(b.date));
  let total = 0;

  for (const leg of sorted) {
    if (leg.km != null) {
      total += leg.km;
    }
  }

  return total;
}

/**
 * Formats a distance number with a thousands separator and "km" unit.
 */
export function formatDistance(km: number): string {
  if (km >= 1000) return `${Math.round(km).toLocaleString()} km`;
  const s = km.toFixed(1);
  return `${s.replace(/\.0$/, '')} km`;
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
export function buildStops(startLocation: LocationUnion | null | undefined, sortedLegs: Leg[]): string[] {
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

  for (const leg of sortedLegs) {
    if (leg.location?.name) {
      add(leg.location.name);
    }
  }

  return places;
}

/**
 * Builds a trail of stops for the ride detail page, including phantom stops
 * (legs without a GPS pin). Returns objects with a name and a phantom flag
 * so the renderer can apply the dashed/italic design from the map.
 *
 * The start location falls back to "Start" when unnamed. Phantom stops use
 * the "Stop N" label and are flagged for visual distinction.
 */
export interface TrailStop {
  name: string;
  phantom?: boolean;
}

export function buildTrailStops(startLocation: LocationUnion | null | undefined, sortedLegs: Leg[]): TrailStop[] {
  const seen = new Set<string>();
  const stops: TrailStop[] = [];

  const add = (name: string, phantom?: boolean) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    stops.push({ name: name.trim(), phantom });
  };

  add(startLocation?.name || 'Start', false);

  for (let i = 0; i < sortedLegs.length; i++) {
    const loc = sortedLegs[i].location;
    const isPhantom = loc?.kind !== 'gps';
    add(stopLabel(loc, i + 1), isPhantom);
  }

  return stops;
}

/**
 * Builds a deduped, chronologically-ordered trail of distinct named stops
 * for a ride, starting from the departure point. Returns e.g.
 * "Mysore → Coorg → Kochi → Alleppey".
 */
export function buildStopTrail(startLocation: LocationUnion | null | undefined, sortedLegs: Leg[]): string {
  return buildStops(startLocation, sortedLegs).join(' → ');
}

/**
 * Display label for a stop: the place name if there is one, otherwise a
 * positional fallback. `n` is the 1-based leg number ("Stop 2" for the second
 * leg). Unnamed GPS pins and pin-less phantom stops both fall back here.
 */
export function stopLabel(loc: LocationUnion | null | undefined, n: number): string {
  if (loc?.name) return loc.name;
  return `Stop ${n}`;
}

/**
 * Computes the per-day cumulative distance for a ride from its legs,
 * summing each leg's direct `km` into its date bucket.
 * Returns a map of date (YYYY-MM-DD) → km.
 */
export function computeDayDistances(legs: Leg[]): Map<string, number> {
  const sorted = [...legs].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map<string, number>();

  for (const leg of sorted) {
    if (leg.km != null) {
      byDate.set(leg.date, (byDate.get(leg.date) || 0) + leg.km);
    }
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
