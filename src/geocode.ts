/**
 * Reverse-geocoding for backfill: turn a stop leg's median GPS pin into a
 * suggested settlement name via the Nominatim (OpenStreetMap) reverse endpoint.
 *
 * This is the network counterpart to the pure clustering in `photo-cluster.ts`.
 * The fetch itself is browser/Node-safe (plain `fetch` + AbortSignal) so it runs
 * under Node for unit tests and in the app for the real import flow. All network
 * failures degrade to `null` — the caller never blocks on the geocoder; the UI
 * falls back to "Stop N".
 *
 * PRIVACY: reverse-geocoding sends the leg's coordinates to Nominatim (a public
 * service operated by the OSM community). This is part of the user-initiated
 * backfill flow — they explicitly chose to import photos that carry GPS — and is
 * opt-in by uploading, not a silent background call. The plan (BACKFILL-PLAN §3)
 * keeps it online-only with a manual/"Stop N" fallback.
 */

import type { DayGroup, PhotoPoint } from './photo-cluster';

/**
 * Nominatim reverse endpoint. `format=jsonv2` returns the structured `address`
 * object (plus a top-level `name`) we pick a settlement name from.
 */
export const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

/**
 * Nominatim's usage policy requires a descriptive User-Agent/Referer so operators
 * can contact the client. `User-Agent`/`Referer` are forbidden headers in the
 * browser (fetch silently drops them), so they take effect under Node / tests
 * and are harmlessly ignored in the browser — either way it's policy-correct.
 */
export const NOMINATIM_USER_AGENT =
  'Retread/0.1 (personal field-logbook; backfill reverse-geocoder)';

/**
 * Minimum delay between successive Nominatim calls. The service asks for ~1
 * request/second; `suggestLegNames` serializes the batch and sleeps this long
 * between calls to stay polite.
 */
export const NOMINATIM_RATE_LIMIT_DELAY_MS = 1100;

/**
 * Settlement keys on Nominatim's `address` object, most-preferred first. A stop's
 * pin is usually in a small settlement, so a specific village/town beats a whole
 * county; `county` is the coarsest acceptable answer.
 */
export const PLACE_PRIORITY = [
  'village',
  'town',
  'city',
  'municipality',
  'hamlet',
  'locality',
  'county',
] as const;

/** The shape of the `address` object Nominatim returns inside a jsonv2 result. */
export type NominatimAddress = Record<string, unknown>;

/**
 * Picks the best settlement name from a Nominatim `address` object.
 *
 * Walks PLACE_PRIORITY (village > town > city > municipality > hamlet > locality
 * > county) and returns the first present, non-empty string. Falls back to the
 * result's top-level `name` (some features have a name but no settlement key),
 * then to null. PURE — trivially unit-testable with mock address objects.
 */
export function placeFromAddress(
  address: NominatimAddress,
  name?: string | null
): string | null {
  for (const key of PLACE_PRIORITY) {
    const value = address[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  if (name && name.trim().length > 0) return name;
  return null;
}

/** The geocoder contract `suggestLegNames` depends on (injectable for tests). */
export type GeocoderFn = (
  lat: number,
  lng: number,
  signal?: AbortSignal
) => Promise<string | null>;

export interface ReverseGeocodeOptions {
  signal?: AbortSignal;
}

/**
 * Reverse-geocodes a lat/lng via Nominatim and returns the best settlement name.
 *
 * Graceful by design: any failure (network, non-OK status, abort, no place
 * found) yields null rather than throwing, so callers never need a try/catch.
 * The request is abortable via the optional `signal`.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  opts?: ReverseGeocodeOptions
): Promise<string | null> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
  });
  try {
    const res = await fetch(`${NOMINATIM_REVERSE}?${params}`, {
      signal: opts?.signal,
      headers: {
        'User-Agent': NOMINATIM_USER_AGENT,
        Referer: NOMINATIM_USER_AGENT,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data === 'object' && 'address' in data) {
      const address = (data as { address?: NominatimAddress }).address ?? {};
      const name = (data as { name?: string }).name ?? null;
      return placeFromAddress(address, name);
    }
    return null;
  } catch {
    // Network error, timeout, or aborted — offline/graceful.
    return null;
  }
}

export interface SuggestLegNamesOptions {
  /** Injectable geocoder; defaults to the real Nominatim `reverseGeocode`. */
  geocoder?: GeocoderFn;
  /** Delay between successive calls (Nominatim ~1 req/s). */
  delayMs?: number;
  /** Shared abort signal, forwarded to each geocode call. */
  signal?: AbortSignal;
}

/**
 * Suggests a name for every StopLeg that carries GPS, attaching it as
 * `leg.name`. Legs without GPS (and legs whose geocode fails/aborts) are left
 * with `name` unset — the UI/P3 falls back to "Stop N" for those.
 *
 * Calls run sequentially (Nominatim rate-limits ~1 req/s) with a small delay
 * between them. Because the batch can be large (one call per stop across the
 * dump), the injected geocoder keeps this testable without any network.
 */
export async function suggestLegNames(
  dayGroups: DayGroup[],
  opts?: SuggestLegNamesOptions
): Promise<DayGroup[]> {
  const { geocoder = reverseGeocode, delayMs = NOMINATIM_RATE_LIMIT_DELAY_MS, signal } =
    opts ?? {};

  let first = true;
  for (const group of dayGroups) {
    for (const leg of group.legs) {
      if (leg.lat == null || leg.lng == null) continue; // no GPS → no geocode
      if (!first && delayMs > 0) await sleep(delayMs);
      first = false;
      leg.name = (await geocoder(leg.lat, leg.lng, signal)) ?? undefined;
    }
  }
  return dayGroups;
}

/**
 * Auto-cover selection: the first leg's first photo of the whole dump is the
 * ride's cover (editable later via the existing cover picker). Deterministic and
 * PURE. Returns the cover photo's id, or null when there are no legs/photos.
 */
export function pickCover(dayGroups: DayGroup[]): PhotoPoint['id'] | null {
  for (const group of dayGroups) {
    if (group.legs.length === 0) continue;
    const first = group.legs[0].photos[0];
    if (first) return first.id;
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
