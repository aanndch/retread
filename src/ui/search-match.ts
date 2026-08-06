import type { HomeRideEntry } from './use-ride-book';

// Normalize for matching: lowercase + strip diacritics. NFD decomposition and
// removal of combining marks is length-preserving, so a normalized index maps
// 1:1 back onto the original string — the highlight walker relies on this.
export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Scored name match. Returns 0 when `query` doesn't match `name`, otherwise a
// positive score: exact > prefix > word-initial substring > substring. A
// single-character query only matches at a word start, so it can't light up
// every mid-word substring in the book.
export function matchScore(name: string, query: string): number {
  const n = normalize(name);
  const q = normalize(query).trim();
  if (!n || !q) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  const idx = n.indexOf(q);
  if (idx === -1) return 0;
  if (q.length === 1) return 0;
  if (idx > 0 && !/[a-z0-9]/.test(n[idx - 1])) return 60;
  return 50;
}

// Whether a freeform note contains the query. Notes are weak matches (they
// rank below name matches) but any substring counts once the query is ≥ 2
// chars; a 1-char query must start a word.
export function noteMatches(note: string, query: string): boolean {
  const n = normalize(note);
  const q = normalize(query).trim();
  if (!n || !q) return false;
  const idx = n.indexOf(q);
  if (idx === -1) return false;
  if (q.length >= 2) return true;
  return idx === 0 || (idx > 0 && !/[a-z0-9]/.test(n[idx - 1]));
}

// Classic two-row DP edit distance (Wagner–Fischer).
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length];
}

// "Try …" recovery for the no-results stub: the closest real entity name
// within edit distance ≤ 2. Whole-name distance first; for multi-word queries
// ("manali pass") a close token pointing at a real name is still a useful
// suggestion ("Manali"). Every returned name is a real ride/leg/stop, so the
// suggested search always has results.
export function findTolerantSuggestion(query: string, ridesData: HomeRideEntry[]): string | null {
  const q = normalize(query).trim();
  if (q.length < 2) return null;

  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const entry of ridesData) {
    const names = [
      entry.ride.title,
      entry.ride.startLocation?.name,
      ...entry.legs.flatMap((l) => [l.title, l.location?.name]),
    ];
    for (const name of names) {
      if (!name) continue;
      const key = normalize(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      candidates.push(name);
    }
  }
  if (candidates.length === 0) return null;

  let best: string | null = null;
  let bestDist = Infinity;
  for (const name of candidates) {
    const d = levenshtein(q, normalize(name));
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  if (bestDist <= 2) return best;

  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  for (const token of tokens) {
    let tBest: string | null = null;
    let tDist = Infinity;
    for (const name of candidates) {
      const d = levenshtein(token, normalize(name));
      if (d < tDist) {
        tDist = d;
        tBest = name;
      }
    }
    if (tDist <= 2) return tBest;
  }
  return null;
}
