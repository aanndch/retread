import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { coverUrlCache, type HomeRideEntry } from './use-ride-book';
import { CloseIcon, SearchIcon } from '../components/icons';
import { formatDistance } from '../lib';
import { useSearchRecents } from './use-search-recents';
import { useBodyScrollLock } from '../components/use-body-scroll-lock';
import { useExitFade } from '../components/use-exit-fade';

interface SearchOverlayProps {
  isOpen: boolean;
  ridesData: HomeRideEntry[];
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onNavigate: (route: string) => void;
  onClose: () => void;
  closeRequest: number;
}

interface Snippet {
  label: string;
  text: string;
  legId?: number;
}

interface SearchResult {
  entry: HomeRideEntry;
  snippets: Snippet[];
}

type ClosePhase = 'idle' | 'user-closing' | 'waiting-for-history';

// Wrap every case-insensitive occurrence of the query in the mark span.
function highlight(text: string, query: string): ComponentChildren {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: ComponentChildren[] = [];
  let idx = 0;
  let pos = lower.indexOf(q);
  while (pos !== -1) {
    if (pos > idx) parts.push(text.slice(idx, pos));
    parts.push(<mark class="search-hit">{text.slice(pos, pos + q.length)}</mark>);
    idx = pos + q.length;
    pos = lower.indexOf(q, idx);
  }
  if (idx < text.length) parts.push(text.slice(idx));
  return parts;
}

// For freeform notes, show a short window around the first hit.
function windowed(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
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

// Prefix (or word-initial) match, so a 1-char query doesn't light up every
// mid-word substring in the book.
function matchesQuery(name: string, q: string): boolean {
  if (name.startsWith(q)) return true;
  const idx = name.indexOf(q);
  if (idx <= 0) return false;
  return !/[a-z0-9]/.test(name[idx - 1]);
}

// Suggestion panel rows: built ONLY from real rides/legs/stops — a suggested
// term is implicitly endorsed, so never suggest something with zero results.
// Prefix matches rank first (rides are newest-first in the data), capped at 8.
function buildSuggestions(query: string, ridesData: HomeRideEntry[]): SearchSuggestion[] {
  const q = query.trim().toLowerCase();
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
    if (title && matchesQuery(title, q)) push(title, 'RIDE');
    if (out.length >= 8) break;
    for (const leg of entry.legs) {
      const legTitle = leg.title?.trim();
      if (legTitle && matchesQuery(legTitle, q)) push(legTitle, 'LEG');
      const stopName = leg.location?.name?.trim();
      if (stopName && matchesQuery(stopName, q)) push(stopName, 'LEG');
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

function buildSearchResults(query: string, ridesData: HomeRideEntry[]): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResult[] = [];

  for (const entry of ridesData) {
    const snippets: Snippet[] = [];
    // Dedupe by (legId, matched field, text) so one match source yields one
    // snippet: a leg's location name used to appear twice — as a plain STOP
    // snippet from the stops scan and again as a STOP·leg snippet below.
    const seen = new Set<string>();
    const add = (s: Snippet, field: string) => {
      const key = `${s.legId ?? 'root'}|${field}|${s.text}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (snippets.length < 2) snippets.push(s);
    };

    if (entry.ride.title && entry.ride.title.toLowerCase().includes(q)) {
      add({ label: 'RIDE', text: entry.ride.title }, 'title');
    }

    // Stop names (start location + leg locations). Each stop remembers its leg
    // so the key above collides with the matching STOP·leg snippet.
    const stops: { name: string; legId?: number }[] = [];
    if (entry.ride.startLocation?.name) stops.push({ name: entry.ride.startLocation.name });
    for (const leg of entry.legs) {
      if (leg.location?.name) stops.push({ name: leg.location.name, legId: leg.id });
    }
    for (const stop of stops) {
      if (stop.name.toLowerCase().includes(q)) {
        add({ label: 'STOP', text: stop.name, legId: stop.legId }, 'stop');
      }
    }

    // Leg titles, locations and notes (deep-link to the specific leg)
    for (const leg of entry.legs) {
      if (leg.title && leg.title.toLowerCase().includes(q)) {
        add({ label: 'LEG', text: leg.title, legId: leg.id }, 'leg-title');
      }
      if (leg.location?.name && leg.location.name.toLowerCase().includes(q)) {
        add({ label: `STOP · ${leg.title || 'Leg'}`, text: leg.location.name, legId: leg.id }, 'stop');
      }
      if (leg.note && leg.note.toLowerCase().includes(q)) {
        add({ label: `NOTE · ${leg.title || 'Leg'}`, text: windowed(leg.note, q), legId: leg.id }, 'note');
      }
    }

    if (snippets.length > 0) {
      results.push({ entry, snippets });
    }
  }

  // Most recent trip first
  return results.sort((a, b) => b.entry.startDate.localeCompare(a.entry.startDate));
}

// The predictive/unique tail of a suggestion renders in green — the part of
// the entity name beyond what the user has already typed.
function SuggestionLabel({ label, query }: { label: string; query: string }) {
  const q = query.trim().toLowerCase();
  const lower = label.toLowerCase();
  if (q && lower.startsWith(q)) {
    return (
      <>
        {label.slice(0, q.length)}
        <span class="search-suggest-tail">{label.slice(q.length)}</span>
      </>
    );
  }
  return <>{label}</>;
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

export function SearchOverlay({
  isOpen,
  ridesData,
  loading,
  query,
  onQueryChange,
  onNavigate,
  onClose,
  closeRequest,
}: SearchOverlayProps) {
  const [closing, setClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const handledCloseRequestRef = useRef(0);
  const closePhaseRef = useRef<ClosePhase>('idle');
  // Play a short fade-out whenever the overlay closes (including navigation)
  // so it never cuts away; keep the page scroll locked until the fade ends.
  const { visible, closing: exitClosing } = useExitFade(isOpen);
  useBodyScrollLock(visible);
  // Recents live in localStorage; refresh on each open so a second tab's
  // writes are picked up. addRecent is called on submit/selection only.
  const { recents, addRecent, clearRecents, reload } = useSearchRecents();
  useEffect(() => {
    if (isOpen) reload();
  }, [isOpen, reload]);

  // User-initiated close (× / Escape / backdrop): clear the query so the next
  // open starts fresh. Navigation to a result goes through goTo() instead,
  // which leaves the query intact for a return-reopen.
  const handleClose = (userInitiated = true) => {
    if (closing) return;
    closePhaseRef.current = userInitiated ? 'user-closing' : 'idle';
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      if (userInitiated) closePhaseRef.current = 'waiting-for-history';
      onClose();
    }, 220);
  };

  // Focus the input whenever the overlay opens.
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Close on Escape. Browser Back is coordinated by App so fragment route
  // navigation cannot be mistaken for a modal close.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, closing]);

  // App increments this only when the search history entry was actually
  // popped. Consume requests even while closed so a later open cannot inherit
  // an old close command.
  useEffect(() => {
    if (closeRequest === handledCloseRequestRef.current) return;
    handledCloseRequestRef.current = closeRequest;
    if (!isOpen) return;
    if (closePhaseRef.current === 'user-closing') return;
    if (closePhaseRef.current === 'waiting-for-history') {
      closePhaseRef.current = 'idle';
      onClose();
      return;
    }
    handleClose(false);
  }, [closeRequest, isOpen, closing, onClose]);

  // Deferred + memoized results: the input keeps the live query (typing stays
  // snappy) while the full-book scan runs against the lagging deferred value,
  // so intermediate keystrokes reuse the cached result list instead of
  // re-scanning every ride. Once the query is committed (Enter / Search key /
  // suggestion tap) the results come from the live query so the commit is
  // immediate — the deferred lag only smooths keystroke typing.
  const deferredQuery = useDeferredValue(query);
  const [committed, setCommitted] = useState(false);
  // Active suggestion for the combobox (aria-activedescendant); -1 = none.
  const [activeIndex, setActiveIndex] = useState(-1);
  const resultsQuery = committed ? query : deferredQuery;
  const results = useMemo(
    () => buildSearchResults(resultsQuery, ridesData),
    [resultsQuery, ridesData],
  );
  // Count every match (result rows + snippet rows), not matched rides — the
  // truthful intermediate number; Phase 3 replaces this line with section counts.
  const matchCount = results.reduce((n, r) => n + 1 + r.snippets.length, 0);
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

  if (!visible) return null;

  // Navigate to a result: leave the query intact so App can reopen search
  // with it when the user returns (tapping the wrong ride shouldn't lose it).
  const goTo = (route: string) => {
    const q = resultsQuery.trim();
    if (q) addRecent(q);
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

  // Trap Tab focus inside the sheet while the overlay is open (input, close
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
      class={`modal-backdrop search-backdrop${closing || exitClosing ? ' closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Search rides"
      onClick={() => handleClose()}
      onKeyDown={onOverlayKeyDown}
    >
      <div class="search-sheet" onClick={(e) => e.stopPropagation()}>
        <div class="search-top">
          <div class="search-header">
            <span class="note-label">Search</span>
            <button type="button" class="btn-close" aria-label="Close search" onClick={() => handleClose()}>
              <CloseIcon size={16} />
            </button>
          </div>
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

        {loading && results.length === 0 ? (
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
        ) : query.trim() === '' ? (
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
        ) : !committed ? (
          null
        ) : results.length === 0 ? (
          <p class="search-empty">No rides match “{resultsQuery.trim()}”.</p>
        ) : (
          <>
            <p class="search-count">
              {matchCount} {matchCount === 1 ? 'match' : 'matches'}
            </p>
            <div class="search-results">
              {results.map(({ entry, snippets }) => (
                <div class="search-result" key={entry.ride.id}>
                  <button
                    type="button"
                    class="search-result-main"
                    onClick={() => goTo(`#/ride/${entry.ride.id}`)}
                  >
                    <SearchThumb blob={entry.firstPhotoBlob} coverKey={entry.coverKey} />
                    <span class="search-result-body">
                      <span class="search-result-title">{highlight(entry.ride.title, resultsQuery)}</span>
                      <span class="search-result-meta">
                        {entry.dateRange}
                        {entry.totalKm > 0 ? ` · ${formatDistance(entry.totalKm)}` : ''}
                      </span>
                    </span>
                  </button>
                  {snippets.map((s, i) => (
                    <button
                      type="button"
                      class="search-snippet"
                      key={i}
                      onClick={() => {
                        if (s.legId !== undefined) {
                          goTo(`#/leg/${s.legId}`);
                        } else {
                          goTo(`#/ride/${entry.ride.id}`);
                        }
                      }}
                    >
                      <span class="search-snippet-label">{s.label}</span>
                      <span class="search-snippet-text">{highlight(s.text, resultsQuery)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
