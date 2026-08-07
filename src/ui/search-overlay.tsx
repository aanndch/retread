import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { coverUrlCache, type HomeRideEntry } from './use-ride-book';
import { CloseIcon, SearchIcon } from '../components/icons';
import { PageHeader } from '../components/page-header';
import { formatDistance, formatIsoDateToDMY } from '../lib';
import { useSearchRecents } from './use-search-recents';
import { DAY_COLORS } from './squiggle';
import { findTolerantSuggestion, matchScore, normalize, noteMatches } from './search-match';
import type { Leg } from '../types';
import { useBodyScrollLock } from '../components/use-body-scroll-lock';

interface SearchOverlayProps {
  ridesData: HomeRideEntry[];
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onNavigate: (route: string) => void;
  onClose: () => void;
}

// Wrap every occurrence of the query in the mark span. Matching is normalized
// (lowercase, accents stripped) but the mark slices the ORIGINAL text, so the
// visible characters keep their case and diacritics.
function highlight(text: string, query: string): ComponentChildren {
  const normText = normalize(text);
  const normQ = normalize(query).trim();
  if (!normQ) return text;
  const parts: ComponentChildren[] = [];
  let idx = 0;
  let pos = normText.indexOf(normQ);
  while (pos !== -1) {
    if (pos > idx) parts.push(text.slice(idx, pos));
    parts.push(<mark class="search-hit">{text.slice(pos, pos + normQ.length)}</mark>);
    idx = pos + normQ.length;
    pos = normText.indexOf(normQ, idx);
  }
  if (idx < text.length) parts.push(text.slice(idx));
  return parts;
}

// Build a deep-link route to a search match target. `scrollTo` names the target
// element on the destination page and `q` carries the matched term (URL-encoded)
// so the target page can scroll to + flash it (see use-scroll-highlight). Stop
// matches target the leg title (Option A: no stop anchor on the leg page) — the
// term may not be in the title, in which case the target page scrolls without
// flashing.
function buildTargetRoute(dest: string, scrollTo: string, q: string): string {
  const sep = dest.includes('?') ? '&' : '?';
  return `${dest}${sep}scrollTo=${scrollTo}&q=${encodeURIComponent(q)}`;
}

// Route for a margin note: a `note` match deep-links to the leg note; a `stop`
// match goes to the leg (or ride) title. The destination stays as today — the
// leg when one is known, else the parent ride.
function marginNoteRoute(n: MarginNote, parentRideId: number | undefined, q: string): string {
  const dest = n.legId !== undefined ? `#/leg/${n.legId}` : `#/ride/${parentRideId}`;
  const scrollTo = n.label === 'note' ? 'note' : 'title';
  return buildTargetRoute(dest, scrollTo, q);
}

// For freeform notes, show a short window around the first hit.
function windowed(text: string, query: string): string {
  const idx = normalize(text).indexOf(normalize(query).trim());
  if (idx === -1) return text;
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + query.length + 40);
  const before = start > 0 ? '…' : '';
  const after = end < text.length ? '…' : '';
  return `${before}${text.slice(start, end)}${after}`;
}

// Derived example searches for the pre-search journal: the most recent ride
// titles and stop names from the book (never static copy). Cap at 3.
function deriveSuggestions(ridesData: HomeRideEntry[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (name: string | null | undefined) => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };
  for (const entry of ridesData) {
    push(entry.ride.title);
    push(entry.ride.startLocation?.name);
    for (const leg of entry.legs) {
      push(leg.title);
      push(leg.location?.name);
      if (out.length >= 3) break;
    }
    if (out.length >= 3) break;
  }
  return out.slice(0, 3);
}

interface SearchSuggestion {
  label: string;
  scope: 'RIDE' | 'LEG';
}

// Suggestion panel rows: built ONLY from real rides/legs/stops — a suggested
// term is implicitly endorsed, so never suggest something with zero results.
// Prefix matches rank first (rides are newest-first in the data), capped at 8.
function buildSuggestions(query: string, ridesData: HomeRideEntry[]): SearchSuggestion[] {
  const q = query.trim();
  if (!q) return [];
  const out: SearchSuggestion[] = [];
  const seen = new Set<string>();
  const push = (label: string, scope: SearchSuggestion['scope']) => {
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, scope });
  };
  for (const entry of ridesData) {
    const title = entry.ride.title?.trim();
    if (title && matchScore(title, q) > 0) push(title, 'RIDE');
    if (out.length >= 8) break;
    for (const leg of entry.legs) {
      const legTitle = leg.title?.trim();
      if (legTitle && matchScore(legTitle, q) > 0) push(legTitle, 'LEG');
      const stopName = leg.location?.name?.trim();
      if (stopName && matchScore(stopName, q) > 0) push(stopName, 'LEG');
      if (out.length >= 8) break;
    }
  }
  return out.slice(0, 8);
}

// React 18's useDeferredValue never made it into preact/hooks, so emulate it:
// render with the previous value immediately (typing stays snappy) and let an
// effect-triggered update catch up with the new value on the next render — the
// expensive buildSearchResults scan runs against this lagging value.
function useDeferredValue<T>(value: T): T {
  const [deferred, setDeferred] = useState(value);
  useEffect(() => {
    setDeferred(value);
  }, [value]);
  return deferred;
}

type MarginNoteLabel = 'stop' | 'note' | 'ride';

interface MarginNote {
  label: MarginNoteLabel;
  text: string;
  legId?: number;
}

interface RideRow {
  kind: 'ride';
  entry: HomeRideEntry;
  notes: MarginNote[];
  score: number;
}

interface LegRow {
  kind: 'leg';
  leg: Leg;
  entry: HomeRideEntry;
  notes: MarginNote[];
  dayNum: number; // 1-based day within the ride → day-color swatch
  score: number;
}

interface SearchCatalog {
  rides: RideRow[];
  legs: LegRow[];
}

// Display identity for a leg row: its title, else its stop name, else "Leg".
function legLabel(leg: Leg): string {
  return leg.title?.trim() || leg.location?.name?.trim() || 'Leg';
}

// Max 2 margin notes per row, deduped by (label, leg, text).
function dedupeNotes(notes: MarginNote[]): MarginNote[] {
  const seen = new Set<string>();
  const out: MarginNote[] = [];
  for (const n of notes) {
    const key = `${n.label}|${n.legId ?? 'root'}|${n.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
    if (out.length >= 2) break;
  }
  return out;
}

// Builds the sectioned catalog (D2): RIDES holds rides whose title matched
// (plus start-stop and orphan note matches as margin notes beneath); LEGS
// holds legs whose title/location matched, with a day-color swatch identity.
// Note matches never float alone — they attach to their leg row when the leg
// itself matched, else to the parent ride row. An empty query returns the
// whole book as ride rows ("browse all rides").
function buildSearchCatalog(query: string, ridesData: HomeRideEntry[]): SearchCatalog {
  const q = query.trim();
  const rides: RideRow[] = [];
  const legs: LegRow[] = [];

  if (!q) {
    for (const entry of ridesData) {
      rides.push({ kind: 'ride', entry, notes: [], score: 0 });
    }
    return { rides, legs };
  }

  for (const entry of ridesData) {
    const rideNotes: MarginNote[] = [];
    let rideScore = 0;
    let rideMatched = false;

    if (entry.ride.title) {
      const s = matchScore(entry.ride.title, q);
      if (s > 0) {
        rideMatched = true;
        rideScore = s;
      }
    }

    // The ride's departure pin is a ride-level stop, not a leg: its match
    // becomes a stop: margin note under the ride row.
    if (entry.ride.startLocation?.name && matchScore(entry.ride.startLocation.name, q) > 0) {
      rideNotes.push({ label: 'stop', text: entry.ride.startLocation.name });
      rideMatched = true;
    }

    const uniqueDates = Array.from(new Set(entry.legs.map((l) => l.date))).sort();

    for (const leg of entry.legs) {
      let legMatched = false;
      let legScore = 0;
      const legNotes: MarginNote[] = [];

      const legTitle = leg.title?.trim();
      if (legTitle) {
        const s = matchScore(legTitle, q);
        if (s > 0) {
          legMatched = true;
          legScore = Math.max(legScore, s);
        }
      }

      const stopName = leg.location?.name;
      if (stopName) {
        const s = matchScore(stopName, q);
        if (s > 0) {
          legMatched = true;
          legScore = Math.max(legScore, s);
          // Surface the matched stop explicitly when the row identity (the
          // leg title) doesn't carry the mark itself.
          if (legTitle && matchScore(legTitle, q) === 0) {
            legNotes.push({ label: 'stop', text: stopName, legId: leg.id });
          }
        }
      }

      if (leg.note && noteMatches(leg.note, q)) {
        const note: MarginNote = { label: 'note', text: windowed(leg.note, q), legId: leg.id };
        if (legMatched) {
          legNotes.push(note);
        } else {
          rideNotes.push(note);
          rideMatched = true;
        }
      }

      if (legMatched) {
        const dayNum = uniqueDates.indexOf(leg.date) + 1;
        legs.push({
          kind: 'leg',
          leg,
          entry,
          notes: dedupeNotes(legNotes),
          dayNum,
          score: legScore,
        });
      }
    }

    if (rideMatched) {
      rides.push({ kind: 'ride', entry, notes: dedupeNotes(rideNotes), score: rideScore });
    }
  }

  // Relevance first, recency as tiebreak (rides arrive newest-first).
  rides.sort((a, b) => b.score - a.score || b.entry.startDate.localeCompare(a.entry.startDate));
  legs.sort((a, b) => b.score - a.score || b.entry.startDate.localeCompare(a.entry.startDate));
  return { rides, legs };
}

// The first occurrence of the typed term in a suggestion renders in green —
// the part of the entity name the user has already typed; the rest stays
// plain ink. Matching is normalized (lowercase, accents stripped) but the
// span slices the ORIGINAL text, so the visible characters keep their case
// and diacritics. A prefix match (index 0) renders exactly as before. When
// the suggestion only matched tolerantly and doesn't literally contain the
// term, the whole label stays plain.
function SuggestionLabel({ label, query }: { label: string; query: string }) {
  const normLabel = normalize(label);
  const normQ = normalize(query).trim();
  const idx = normQ ? normLabel.indexOf(normQ) : -1;
  if (idx === -1) return <>{label}</>;
  return (
    <>
      {label.slice(0, idx)}
      <span class="search-suggest-prefix">{label.slice(idx, idx + normQ.length)}</span>
      {label.slice(idx + normQ.length)}
    </>
  );
}

function SearchThumb({ blob, coverKey }: { blob: Blob | null; coverKey: string }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!blob || !coverKey) {
      setUrl('');
      return;
    }
    const cached = coverUrlCache.get(coverKey);
    if (cached) {
      setUrl(cached.url);
      return;
    }
    const created = URL.createObjectURL(blob);
    coverUrlCache.set(coverKey, { blob, url: created });
    setUrl(created);
  }, [blob, coverKey]);

  if (!url) {
    return (
      <div class="search-thumb search-thumb--empty" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="2" />
          <line x1="12" y1="3" x2="12" y2="7" />
          <line x1="12" y1="17" x2="12" y2="21" />
          <line x1="3" y1="12" x2="7" y2="12" />
          <line x1="17" y1="12" x2="21" y2="12" />
        </svg>
      </div>
    );
  }
  return <img src={url} alt="" loading="lazy" class="search-thumb" />;
}

// Sectioned catalog (D2/D3): RIDES and LEGS groups with mechanical-font
// headers + counts and a dashed rule to the edge; rows are borderless index
// entries separated by dashed hairlines. Margin notes deep-link to their leg
// when one is known, else to the parent ride.
function CatalogSections({
  catalog,
  resultsQuery,
  onGoTo,
}: {
  catalog: SearchCatalog;
  resultsQuery: string;
  onGoTo: (route: string) => void;
}) {
  return (
    <div class="search-index">
      {catalog.rides.length > 0 && (
        <section class="search-section">
          <h2 class="search-section-head search-section-head--catalog" aria-live="polite">
            Rides · {catalog.rides.length}
            <span class="search-section-rule" aria-hidden="true" />
          </h2>
          {catalog.rides.map((row) => (
            <div class="search-row-wrap" key={row.entry.ride.id}>
              <button
                type="button"
                class="search-row"
                onClick={() =>
                  onGoTo(buildTargetRoute(`#/ride/${row.entry.ride.id}`, 'title', resultsQuery))
                }
              >
                <SearchThumb blob={row.entry.firstPhotoBlob} coverKey={row.entry.coverKey} />
                <span class="search-row-body">
                  <span class="search-row-title">{highlight(row.entry.ride.title, resultsQuery)}</span>
                  <span class="search-row-meta">
                    RIDE · {row.entry.dateRange}
                    {row.entry.totalKm > 0 ? ` · ${formatDistance(row.entry.totalKm)}` : ''}
                  </span>
                </span>
              </button>
              {row.notes.map((n, i) => (
                <button
                  type="button"
                  class="search-margin-note"
                  key={i}
                  onClick={() => onGoTo(marginNoteRoute(n, row.entry.ride.id, resultsQuery))}
                >
                  <span class="search-margin-note-label">{n.label}:</span>
                  <span class="search-margin-note-text">{highlight(n.text, resultsQuery)}</span>
                </button>
              ))}
            </div>
          ))}
        </section>
      )}
      {catalog.legs.length > 0 && (
        <section class="search-section">
          <h2 class="search-section-head search-section-head--catalog" aria-live="polite">
            Legs · {catalog.legs.length}
            <span class="search-section-rule" aria-hidden="true" />
          </h2>
          {catalog.legs.map((row) => (
            <div class="search-row-wrap" key={row.leg.id}>
              <button
                type="button"
                class="search-row"
                onClick={() => onGoTo(buildTargetRoute(`#/leg/${row.leg.id}`, 'title', resultsQuery))}
              >
                <span
                  class="search-day-swatch"
                  aria-hidden="true"
                  style={{ background: DAY_COLORS[Math.max(0, row.dayNum - 1) % DAY_COLORS.length] }}
                />
                <span class="search-row-body">
                  <span class="search-row-title">{highlight(legLabel(row.leg), resultsQuery)}</span>
                  <span class="search-row-meta">
                    LEG · {formatIsoDateToDMY(row.leg.date)}
                    {row.leg.km ? ` · ${formatDistance(row.leg.km)}` : ''}
                  </span>
                </span>
              </button>
              {row.notes.map((n, i) => (
                <button
                  type="button"
                  class="search-margin-note"
                  key={i}
                  onClick={() => onGoTo(marginNoteRoute(n, row.entry.ride.id, resultsQuery))}
                >
                  <span class="search-margin-note-label">{n.label}:</span>
                  <span class="search-margin-note-text">{highlight(n.text, resultsQuery)}</span>
                </button>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export function SearchOverlay({
  ridesData,
  loading,
  query,
  onQueryChange,
  onNavigate,
  onClose,
}: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // The route owns open/close — the viewport transition fades this page in and
  // out — so the only scroll concern is locking the page body while mounted.
  // Ref-counting for overlapping locks arrives in R4.
  useBodyScrollLock(true);
  // Recents live in localStorage; refresh on each open (the route remounts this
  // page every time) so a second tab's writes are picked up. addRecent is
  // called on submit/selection only.
  const { recents, addRecent, clearRecents, reload } = useSearchRecents();
  useEffect(() => {
    reload();
  }, [reload]);

  // Focus the input whenever the page mounts (the user explicitly tapped the
  // search icon, so the keyboard should already be up).
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Restore focus on unmount: the page opens from the home-page search icon
  // (or a deep link, where the active element is body) and closes via Back /
  // the × button / a result tap. Remember what had focus on mount and give it
  // back in the cleanup so focus never falls through to <body>.
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      restoreFocusRef.current?.focus();
    };
  }, []);

  // Close on Escape — same as the × button: history.back() returns to the
  // previous page; the route transition fades the sheet out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Deferred + memoized results: the input keeps the live query (typing stays
  // snappy) while the full-book scan runs against the lagging deferred value,
  // so intermediate keystrokes reuse the cached result list instead of
  // re-scanning every ride. Once the query is committed (Enter / Search key /
  // suggestion tap) the results come from the live query so the commit is
  // immediate — the deferred lag only smooths keystroke typing.
  const deferredQuery = useDeferredValue(query);
  // The URL only encodes the query, not the commit: committed is local state
  // that starts false on every mount, so a fresh visit always lands on the
  // journal (empty query) or suggestions (non-empty) and typing after a commit
  // returns to suggestions — the old "committed never resets on close" bug
  // disappears structurally. When the page mounts WITH a query already in the
  // URL (Back from a result restores ?q=), committed starts true so the
  // catalog for that query renders immediately instead of the suggestion panel.
  const [committed, setCommitted] = useState(() => query.trim() !== '');
  // Active suggestion for the combobox (aria-activedescendant); -1 = none.
  const [activeIndex, setActiveIndex] = useState(-1);
  const resultsQuery = committed ? query : deferredQuery;
  const catalog = useMemo(
    () => buildSearchCatalog(resultsQuery, ridesData),
    [resultsQuery, ridesData],
  );
  const catalogEmpty = catalog.rides.length === 0 && catalog.legs.length === 0;
  // Tolerant "Try …" recovery for the no-results stub.
  const tolerantSuggestion = useMemo(
    () => (resultsQuery.trim() ? findTolerantSuggestion(resultsQuery, ridesData) : null),
    [resultsQuery, ridesData],
  );
  // Derived example searches for the pre-search journal.
  const journalSuggestions = useMemo(() => deriveSuggestions(ridesData), [ridesData]);
  // Suggestion panel rows, built live from the typed query.
  const suggestions = useMemo(() => buildSuggestions(query, ridesData), [query, ridesData]);

  // Reset the active suggestion whenever the query changes.
  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  // State B: while typing (and not yet committed), the suggestion panel in the
  // sticky top bar replaces the result list below.
  const panelOpen = query.trim() !== '' && !committed;
  const emptyQuery = query.trim() === '';

  // Navigate to a result: the ?q= stays in the URL so Back restores the query
  // (tapping the wrong ride shouldn't lose it). Blur the input first so the
  // mobile keyboard folds on navigation.
  const goTo = (route: string) => {
    const q = resultsQuery.trim();
    if (q) addRecent(q);
    inputRef.current?.blur();
    onNavigate(route);
  };

  // Re-run a journal entry (recent or suggested) as a search query.
  const runQuery = (q: string) => {
    addRecent(q);
    onQueryChange(q);
    setCommitted(true);
  };

  // Typing after a commit returns to the suggestion panel (State B).
  const handleQueryInput = (value: string) => {
    if (committed) setCommitted(false);
    onQueryChange(value);
  };

  // "Browse all rides" reveals the whole book in place (State D recovery).
  const browseAll = () => {
    onQueryChange('');
    setCommitted(true);
    setActiveIndex(-1);
  };

  // "Return to recent searches" (State D third rung): clear the query and
  // drop the commit so the pre-search journal comes back.
  const backToJournal = () => {
    onQueryChange('');
    setCommitted(false);
    setActiveIndex(-1);
  };

  // Commit a suggestion: fill the field with the entity name and go straight
  // to its results (the entity always has results — suggestions are real).
  const commitSuggestion = (s: SearchSuggestion) => {
    addRecent(s.label);
    onQueryChange(s.label);
    setCommitted(true);
    setActiveIndex(-1);
  };

  // Enter / Search-key submit: active suggestion wins, else commit the raw
  // query. Records the query in recents (submit is a deliberate action).
  const submit = () => {
    if (!committed && suggestions.length > 0 && activeIndex >= 0) {
      commitSuggestion(suggestions[activeIndex]);
      return;
    }
    const q = query.trim();
    if (q) addRecent(q);
    setCommitted(true);
    setActiveIndex(-1);
  };

  // Combobox keyboard contract: ↓/↑ move through suggestions (focus stays in
  // the input, aria-activedescendant tracks it), Enter submits, Escape closes
  // via the document handler below.
  const onInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!committed && suggestions.length > 0) {
        e.preventDefault();
        setActiveIndex((prev) => {
          const n = suggestions.length;
          if (prev === -1) return e.key === 'ArrowDown' ? 0 : n - 1;
          return (prev + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
        });
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  // Trap Tab focus inside the sheet while the page is mounted (input, close
  // button, result/snippet buttons), wrapping at both ends. Escape handling
  // and the input's own combobox key contract stay untouched.
  const onOverlayKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const container = rootRef.current;
    if (!container) return;
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(
        'input, button, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const activeIndex = focusables.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && (activeIndex <= 0 || activeIndex === -1)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (activeIndex === -1 || activeIndex === focusables.length - 1)) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      class="search-page"
      role="dialog"
      aria-modal="true"
      aria-label="Search rides"
      onKeyDown={onOverlayKeyDown}
    >
      <PageHeader onBack={() => onClose()} />

      <div class="search-top">
        <span class="note-label">Search</span>
        <div class="search-field">
          <SearchIcon size={16} class="search-field-icon" />
          <input
            ref={inputRef}
            type="search"
            name="q"
            class="search-input"
            role="combobox"
            aria-expanded={panelOpen}
            aria-controls="search-suggest-listbox"
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 ? `search-suggest-option-${activeIndex}` : undefined
            }
            aria-label="Search rides, stops and notes"
            enterkeyhint="search"
            autocomplete="off"
            spellcheck={false}
            placeholder="Search rides, stops and notes…"
            value={query}
            onInput={(e) => handleQueryInput((e.target as HTMLInputElement).value)}
            onKeyDown={onInputKeyDown}
          />
          {query !== '' && (
            <button
              type="button"
              class="search-clear"
              aria-label="Clear search"
              onClick={() => {
                handleQueryInput('');
                inputRef.current?.focus();
              }}
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>
        {panelOpen && (
          <div
            class="search-suggest"
            id="search-suggest-listbox"
            role="listbox"
            aria-label="Suggestions"
          >
            {suggestions.length === 0 ? (
              <p class="search-suggest-none">
                No suggestions yet — press the Search key to see all matches.
              </p>
            ) : (
              suggestions.map((s, i) => (
                <div
                  id={`search-suggest-option-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  class={`search-suggest-row${i === activeIndex ? ' is-active' : ''}`}
                  onClick={() => commitSuggestion(s)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <span class="search-suggest-name">
                    <SuggestionLabel label={s.label} query={query} />
                  </span>
                  <span class="search-suggest-scope">{s.scope}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {loading && catalogEmpty ? (
        <div class="search-skeleton" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div class="search-skeleton-row" key={i}>
              <span class="search-skeleton-thumb" />
              <span class="search-skeleton-lines">
                <span class="search-skeleton-block search-skeleton-title" />
                <span class="search-skeleton-block search-skeleton-meta" />
              </span>
            </div>
          ))}
        </div>
      ) : emptyQuery && !committed ? (
        <div class="search-journal">
          <div class="search-journal-section">
            <div class="search-section-head">
              <span class="search-section-title">Recent Searches</span>
              {recents.length > 0 && (
                <button
                  type="button"
                  class="search-margin-action"
                  onClick={clearRecents}
                >
                  Clear All
                </button>
              )}
            </div>
            {recents.length === 0 ? (
              <p class="search-journal-note">
                No recent searches yet — try one of the suggestions below.
              </p>
            ) : (
              <div class="search-journal-rows">
                {recents.map((recent) => (
                  <button
                    type="button"
                    class="search-journal-row"
                    key={recent}
                    onClick={() => runQuery(recent)}
                  >
                    <SearchIcon size={14} class="search-journal-icon" />
                    <span class="search-journal-row-text">{recent}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {journalSuggestions.length > 0 && (
            <div class="search-journal-section">
              <div class="search-section-head">
                <span class="search-section-title">Suggested</span>
              </div>
              <div class="search-journal-rows">
                {journalSuggestions.map((s) => (
                  <button
                    type="button"
                    class="search-journal-row search-journal-row--suggested"
                    key={s}
                    onClick={() => runQuery(s)}
                  >
                    <span class="search-journal-row-text">{s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p class="search-log-count">
            Your Log · {ridesData.length} Rides
          </p>
        </div>
      ) : emptyQuery && ridesData.length === 0 ? (
        <div class="search-stub">
          <p class="search-stub-title">
            Your log is empty — log your first ride to start the book.
          </p>
        </div>
      ) : emptyQuery ? (
        <CatalogSections catalog={catalog} resultsQuery={resultsQuery} onGoTo={goTo} />
      ) : !committed ? (
        null
      ) : catalogEmpty ? (
        <div class="search-stub">
          <p class="search-stub-title">No matches for “{resultsQuery.trim()}”.</p>
          <p class="search-stub-recovery">
            {tolerantSuggestion ? (
              <button
                type="button"
                class="search-stub-link"
                onClick={() => runQuery(tolerantSuggestion)}
              >
                Try “{tolerantSuggestion}”
              </button>
            ) : null}
            {tolerantSuggestion ? <>, or </> : null}
            <button type="button" class="search-stub-link" onClick={browseAll}>
              browse all rides →
            </button>
          </p>
          <p class="search-stub-recovery">
            <button type="button" class="search-stub-link" onClick={backToJournal}>
              …or return to recent searches.
            </button>
          </p>
        </div>
      ) : (
        <CatalogSections catalog={catalog} resultsQuery={resultsQuery} onGoTo={goTo} />
      )}
    </div>
  );
}
