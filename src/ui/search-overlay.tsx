import { useState, useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { coverUrlCache, type HomeRideEntry } from './use-ride-book';
import { CloseIcon } from '../components/icons';
import { formatDistance } from '../lib';

interface SearchOverlayProps {
  isOpen: boolean;
  ridesData: HomeRideEntry[];
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

function buildSearchResults(query: string, ridesData: HomeRideEntry[]): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResult[] = [];

  for (const entry of ridesData) {
    const snippets: Snippet[] = [];
    const add = (s: Snippet) => {
      if (snippets.length < 2) snippets.push(s);
    };

    if (entry.ride.title && entry.ride.title.toLowerCase().includes(q)) {
      add({ label: 'RIDE', text: entry.ride.title });
    }

    // Stop names (start location + leg locations)
    const stops: string[] = [];
    if (entry.ride.startLocation?.name) stops.push(entry.ride.startLocation.name);
    for (const leg of entry.legs) {
      if (leg.location?.name) stops.push(leg.location.name);
    }
    for (const stop of stops) {
      if (stop.toLowerCase().includes(q)) {
        add({ label: 'STOP', text: stop });
      }
    }

    // Leg titles, locations and notes (deep-link to the specific leg)
    for (const leg of entry.legs) {
      if (leg.title && leg.title.toLowerCase().includes(q)) {
        add({ label: 'LEG', text: leg.title, legId: leg.id });
      }
      if (leg.location?.name && leg.location.name.toLowerCase().includes(q)) {
        add({ label: `STOP · ${leg.title || 'Leg'}`, text: leg.location.name, legId: leg.id });
      }
      if (leg.note && leg.note.toLowerCase().includes(q)) {
        add({ label: `NOTE · ${leg.title || 'Leg'}`, text: windowed(leg.note, q), legId: leg.id });
      }
    }

    if (snippets.length > 0) {
      results.push({ entry, snippets });
    }
  }

  // Most recent trip first
  return results.sort((a, b) => b.entry.startDate.localeCompare(a.entry.startDate));
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
  return <img src={url} alt="" class="search-thumb" />;
}

export function SearchOverlay({
  isOpen,
  ridesData,
  query,
  onQueryChange,
  onNavigate,
  onClose,
  closeRequest,
}: SearchOverlayProps) {
  const [closing, setClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handledCloseRequestRef = useRef(0);
  const closePhaseRef = useRef<ClosePhase>('idle');

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

  if (!isOpen) return null;

  const results = buildSearchResults(query, ridesData);

  // Navigate to a result: leave the query intact so App can reopen search
  // with it when the user returns (tapping the wrong ride shouldn't lose it).
  const goTo = (route: string) => {
    onNavigate(route);
  };

  return (
    <div class={`modal-backdrop search-backdrop${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label="Search rides" onClick={() => handleClose()}>
      <div class="search-sheet" onClick={(e) => e.stopPropagation()}>
        <div class="search-top">
          <div class="search-header">
            <span class="note-label">Search</span>
            <button type="button" class="btn-close" aria-label="Close search" onClick={() => handleClose()}>
              <CloseIcon size={16} />
            </button>
          </div>
          <input
            ref={inputRef}
            type="text"
            class="search-input"
            placeholder="Search rides, stops, notes…"
            value={query}
            onInput={(e) => onQueryChange((e.target as HTMLInputElement).value)}
          />
        </div>

        {query.trim() === '' ? (
          <p class="search-empty">Type to search rides, stops and notes.</p>
        ) : results.length === 0 ? (
          <p class="search-empty">No rides match “{query.trim()}”.</p>
        ) : (
          <>
            <p class="search-count">
              {results.length} {results.length === 1 ? 'ride' : 'rides'}
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
                      <span class="search-result-title">{highlight(entry.ride.title, query)}</span>
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
                      <span class="search-snippet-text">{highlight(s.text, query)}</span>
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
