import { useCallback, useState } from 'preact/hooks';

// Recent search queries, persisted across sessions. Read once per overlay open
// (the overlay calls reload()), written only when the user actually runs a
// search (submit / result navigation) — never per keystroke.
const STORAGE_KEY = 'retread-search-recents';
const MAX_RECENTS = 8;

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, MAX_RECENTS);
  } catch {
    // Corrupt or unavailable storage: recents are a progressive enhancement.
    return [];
  }
}

function writeRecents(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota / private mode: ignore; recents still work for the session.
  }
}

export function useSearchRecents() {
  const [recents, setRecents] = useState<string[]>(readRecents);

  // Re-read from storage — called when the overlay opens so another tab's
  // writes are picked up without keeping a storage listener mounted.
  const reload = useCallback(() => {
    setRecents(readRecents());
  }, []);

  // Most-recent-first, case-insensitively deduped, capped.
  const addRecent = useCallback((rawQuery: string) => {
    const q = rawQuery.trim();
    if (!q) return;
    setRecents((prev) => {
      const next = [
        q,
        ...prev.filter((r) => r.toLowerCase() !== q.toLowerCase()),
      ].slice(0, MAX_RECENTS);
      writeRecents(next);
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    writeRecents([]);
    setRecents([]);
  }, []);

  return { recents, addRecent, clearRecents, reload };
}
