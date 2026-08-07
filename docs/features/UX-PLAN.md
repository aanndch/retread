# Retread — Ride & Leg UX Simplification Plan

This document captures the agreed simplification of the ride/leg creation flows, the phantom-stop feature for the route map, and the supporting resilience fixes. It is the working plan for the next build round. The original architecture notes live in `../architecture/PLAN.md`; this file is the UX-forward plan on top of it.

---

## 1. Goal & MVP

The product's core value is the **route map of a whole ride and its legs**. Every flow decision below serves that:

- A ride = title + **start pin**.
- A leg = date + **destination pin** + optional label/photos/note/distance.
- The map = start pin + destination pins connected by real roads (OSRM-snapped).

Location entry must be **pin-first**: GPS ("Use my location") or map selection ("Pick on map"). A free-text name alone cannot draw a route.

### Two users, one flow

| User | Start pin | Leg pin |
|------|-----------|---------|
| **A — live** | "Use my location" at trip start, ride created up front | "Use my location" (or map) at each stop, legs added over time |
| **B — catch-up** | "Pick on map", ride + leg logged in one sitting after the trip | "Pick on map" |

Both are served by a single flow: *Log a ride → continue into leg 1 → log more legs*. No UI fork.

---

## 2. Why we're changing this (current problems)

Trace of a **name-only leg** (typed name, no GPS pin) through the current code:

1. Leg saves with `location: { kind: 'named' }`, no `roadPath`.
2. **Leg detail map is empty** — `leg-detail.tsx` builds the map only from `roadPath` or `location.kind === 'gps'`; a named leg gets neither → "No map for this leg yet."
3. **Ride map silently drops the leg** — `ride-detail.tsx` builds `cumulativePath`/`segments`/`mapStops` from GPS data only. Named legs appear only in the text trail. All-named ride → "Log 2+ legs with GPS pins…" empty state; mixed ride → a broken, disjoint squiggle.
4. **One name-only leg breaks the chain** — `backfillRideRoutes` only snaps leg N when legs N−1 and N are both GPS; the break propagates downstream.
5. **Distance in GPS-route mode never computes** — auto-measure requires `location.kind === 'gps'`; stays "—" silently.
6. **No guard** — `handleStepJump`/save validate only the leg title; the user sails through and discovers the empty map later.

A name-only stop is a silent trap that destroys the MVP with zero in-flow feedback.

---

## 3. Agreed design decisions

- **Pin requirement (legs):** location entry is a single, tappable **place row** ("Choose destination →", or a pinned chip showing the stop once). Tapping it opens the **place picker** — India-biased search, tap-to-place map, and the stop name edited on the placed pin. A visible **"Use my location"** button sits on the row for the live one-tap case. A leg saved without a pin is a **phantom stop** (see below); the bypass is implicit, and the form simply renders the phantom.
- **Name field:** lives **inside the picker**, edited on the placed pin — never a separate form field, so the name never renders twice. Reverse geocode suggests it for nameless pins (offline/unknown → "Pin set"). In the picker, "**Keep 'X' as a label (no pin)**" produces a named phantom when search can't find a place.
  - **Invariant — label, never a location:** a typed name alone must never become a route anchor. `{ kind: 'named', name }` means "phantom label, not a location"; the map draws nothing from it.
- **Title:** optional — auto-derives from the stop label or **"Stop N"** at save time, so nothing is required behind a toggle.
- **Phantom points:** a pin-less leg appears on the ride map as a hollow dashed marker with dashed connectors to/from its real neighbors.
  - **Position rule:** **midpoint** between the previous and next real GPS pin — it reads as "somewhere in the middle of the uncertain stretch", and costs almost nothing because the forward scan for the next real pin is already required for the dashed connector. Trailing phantom (no next real pin): small fixed offset from the last real pin with a single dashed stub. Leading phantom with no anchor: skipped.
  - **Route across a phantom gap:** the solid road is **replaced** by the dashed connectors (reads "uncertain here").
- **Ride + first leg (merged):** "Log a ride" is a single 4-step wizard — **Start · Stop · Photos · Story** — that creates the ride and leg 1 in one save (`#/ride/{id}`). No ride→leg navigation exists; `new-leg` stays for leg 2+ from the ride page. The ride's start date is leg 1's date (home groups by first-leg date).
- **Editing existing name-only legs:** the edit flow (`#/edit?mode=edit&legId=X`) loads the leg into the same pin-first editor. If a name-only leg is opened for edit, the user can add a GPS pin. On save, the route backfill snaps retroactively and the phantom disappears from the ride map.

---

## 4. Implementation phases

### Phase 1 — "Stop N" labels

Foundational: everything downstream depends on how unnamed stops are labeled.

**`src/lib.ts`**
- Add `stopLabel(leg, index)`: returns `location.name`, else `Stop {index + 1}`.

**Consumers**
- `src/ui/ride-detail/leg-card.tsx`: replace the `[lat, lng]` / "Named" fallback with "Stop N".
- `src/ui/leg-detail.tsx`: `locationName()` falls back to "Stop N"; a real leg following an unpinned leg gets "Stop N" for its trail start.
- `src/ui/ride-detail.tsx`: map stop labels fall back to "Stop N".
- Home-card text trails stay names-only (avoid clutter).

### Phase 2 — Pin-first editor & ride→leg continuation

**`src/ui/editor/metrics-step.tsx`**
- Destination is a single tappable **place row** ("Choose destination →" / pinned chip) + a visible **"Use my location"** button. Tapping the row opens the place picker.
- Starting From (new/edit ride): the same place row + "Use my location".
- Title / Date & Time / Distance are compact **collapsible rows** (one-screen editor); the title auto-derives from the stop label or "Stop N".
- When no pin is set and user attempts to advance: show an honest inline note — "No map pin — this leg won't appear on the route map." The save proceeds (implicit bypass) but the note is visible so the user knows what they're choosing.
- Pin removal: if a GPS pin is cleared while `kmSource === 'auto'`, clear the measured `km` too (can't measure without a pin); a manually typed value stays.

**`src/ui/editor/index.tsx`**
- No new state flags needed — the form saves naturally whether or not a pin is set. The phantom-point rendering (Phase 3) handles the visual.
- No GPS request on mount — the browser asks for location only when the user taps "Use my location" (explicit consent, consistent with the destination pin; User A taps once at the trip start).
- **Ride start pin (required-but-sketchable):** ride creation asks for a start pin (GPS or map); if skipped, the first pinned leg anchors the map (the existing `cumulativePath` logic already tolerates this).

**`src/ui/editor/save-helper.ts`**
- New-ride redirect: `#/ride/{id}` → `#/edit?mode=new-leg&rideId={id}` so ride creation continues into leg 1. Leg save still returns to the ride page (FAB covers "log next leg").

**Editing existing name-only legs:**
- The edit flow (`#/edit?mode=edit&legId=X`) loads the leg into the same pin-first editor.
- If a name-only leg is opened for edit, the user can add a GPS pin via the same "Use my location" / "Pick on map" buttons.
- On save, the route backfill (Phase 4) snaps retroactively and the phantom disappears from the ride map.

### Phase 3 — Phantom points on the ride map

**`src/ui/squiggle.tsx`**
- `SquiggleStop.kind` gains `'phantom'`.
- Render phantom stops as a **hollow dashed circle** (`stroke-dasharray`) with a "~ label". Phantoms flow into the fullscreen `MapModal` for free (it forwards the same `stops`/`segments`).

**`src/ui/ride-detail.tsx`**
- New `buildRideMap(ride, legs)` walk:
  - Track `lastRealPt` (ride start pin, then each GPS leg location).
  - On a pin-less leg, find the next real GPS point; emit a **phantom stop at the midpoint** (`lastRealPt` ↔ `nextRealPt`) plus two **dashed connector segments** (`SquiggleSegment.fallback`, already renders dashed) — `lastRealPt → phantom` and `phantom → nextRealPt`.
  - **Suppress the solid `roadPath` segment that spans a phantom gap** (dashed replaces it).
  - Trailing phantom (no next real): offset a small fixed distance from `lastRealPt` with a single dashed stub.
  - Leading phantom with no anchor: skipped.
  - Phantom label = name or "Stop N"; excluded from the crowded-stops caption count.
  - Ride-map empty-state copy becomes misleading when a ride has legs but all are phantoms → adjust to "Add GPS pins to draw your route map."

### Phase 4 — Route resilience & leg-detail honesty

**`src/road.ts`**
- Rewrite `backfillRideRoutes` to track `lastKnownGps` instead of strictly using the previous leg:
  - Each GPS leg snaps from `lastKnownGps` → its location, then advances `lastKnownGps`.
  - Pin-less legs keep `roadPath: null` and **no longer wipe the routes of every subsequent leg**.

**`src/ui/leg-detail.tsx`**
- Phantom leg empty state: "This stop has no exact location — set its pin to draw it here" + a **Set Pin** CTA.
- The next real leg's map already works via the backfill change.

---

## 5. Verification

- `npm run build` after each phase.
- Manual walk (390×844): create ride (start pin) → leg 1 pinned → leg 2 name-only (no pin, phantom saves) → leg 3 pinned → ride map shows the dashed phantom at the midpoint between leg 1 and leg 3; leg 3's map still draws; home trail reads correctly. Edit leg 2, add a GPS pin, save → phantom disappears, route backfills retroactively.

---

## 6. Deferred (next round, high priority)

- **Geocode-to-pin**: typing "Manali" resolves to a GPS pin via OSM Nominatim when online. This is the single biggest UX gap — most users type a name before they open a map. Without geocoding, pin placement is forced map interaction for every stop.
- **Wizard-shape unification**: ride vs leg editor step shapes should be consistent. The ride form is a single screen; the leg form is a 3-step wizard. Aligning these (or collapsing the leg wizard to fewer steps) reduces cognitive load.
- **Reverse-geocoding pin names**: auto-label a GPS pin with the nearest town/city name so unnamed stops aren't all "Stop N."
- **"Log next leg" quick-continue screen**: currently the FAB covers this, but a lightweight inline "add another leg" prompt after saving could streamline multi-leg catch-up sessions.
- P0 distance rework is already shipped; this plan builds on it.
