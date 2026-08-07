import { useEffect, useState } from 'preact/hooks';

// Query-param modal keys for the page-level overlays (map, photo, arrange).
// A modal's open state lives in the URL as ?modal=<key> on its host route
// (#/ride/1?modal=map, #/leg/1?modal=arrange, #/edit?mode=…&modal=arrange).
// Settings is a routed page now (#/settings), not a modal. See
// docs/architecture/NAV-REFACTOR-PLAN.md §2/§3.
export type ModalKey = 'map' | 'photo' | 'arrange';

export interface RouteQuery {
  // Which page-level modal is open on the current route (null = none).
  modal: ModalKey | null;
  // The ?photo= param used by the ride/leg photo overlay for the active photo
  // index. Kept in the URL so prev/next can replaceState without stacking
  // history entries and a deep link restores the exact photo.
  photo: string | null;
  // The ?q= search query (the routed search page's param, R0).
  q: string | null;
}

// Parse a raw hash ("#/ride/1?modal=map&photo=2") into the route query. Shared
// by useRouteQuery (page state) and the write helpers (close guards) so both
// always agree on what the URL currently says.
export function readRouteQueryFromHash(hash: string): RouteQuery {
  const qi = hash.indexOf('?');
  const params = new URLSearchParams(qi >= 0 ? hash.slice(qi + 1) : '');
  const modal = params.get('modal');
  return {
    modal:
      modal === 'map' || modal === 'photo' || modal === 'arrange'
        ? modal
        : null,
    photo: params.get('photo'),
    q: params.get('q'),
  };
}

// Live view of the current route's query params. Subscribes to hashchange AND
// popstate: a modal-only change (?modal= added/removed) does not re-transition
// the viewport (the App's same-page guard returns early), so the pages must
// re-render themselves when the param changes under them.
export function useRouteQuery(): RouteQuery {
  const [query, setQuery] = useState(() => readRouteQueryFromHash(window.location.hash));
  useEffect(() => {
    const sync = () => setQuery(readRouteQueryFromHash(window.location.hash));
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  return query;
}

// Open a modal: hash-push the host route with ?modal=<key> appended, creating
// a back entry (closing is a plain history.back()). Existing params (e.g. the
// editor's ?mode=) are preserved; the photo overlay's ?photo= index rides
// along when supplied.
export function openModal(key: ModalKey, opts?: { photo?: string | number }): void {
  const hash = window.location.hash;
  const qi = hash.indexOf('?');
  const path = qi >= 0 ? hash.slice(0, qi) : hash;
  const params = new URLSearchParams(qi >= 0 ? hash.slice(qi + 1) : '');
  params.set('modal', key);
  if (opts?.photo !== undefined) params.set('photo', String(opts.photo));
  const qs = params.toString();
  window.location.hash = qs ? `${path}?${qs}` : path;
}

// Close a modal: pop back to the bare host route. Only pops when the URL still
// shows this modal key, so a close that races a browser Back (or a re-entered
// close while an exit fade is running) never double-pops.
export function closeModal(key: ModalKey): void {
  if (readRouteQueryFromHash(window.location.hash).modal === key) {
    history.back();
  }
}

// Prev/next inside the photo overlay: replaceState the ?photo= param in place
// so Back does not stack an entry per photo — the open and close stay a
// push/pop pair. replaceState fires no hashchange, so callers update their own
// local index state alongside this call.
export function setModalPhotoParam(photo: string | number): void {
  const hash = window.location.hash;
  const qi = hash.indexOf('?');
  const path = qi >= 0 ? hash.slice(0, qi) : hash;
  const params = new URLSearchParams(qi >= 0 ? hash.slice(qi + 1) : '');
  params.set('photo', String(photo));
  history.replaceState(history.state, '', `${path}?${params.toString()}`);
}
