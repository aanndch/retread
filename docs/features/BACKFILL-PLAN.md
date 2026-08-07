# Retread — Backfill-First Trip Logging Plan

Redesigns ride/leg creation around the **photo dump**: upload photos from a past trip → the app builds the structured trip (legs grouped by day, dates derived from metadata, place names suggested from GPS, cover auto-set), and the user reviews/edits. Live logging still works, but backfill becomes the path of least resistance.

**Key constraint that unlocks this:** there are NO users yet — the app isn't live. We can reshape the flow freely; nothing to rewire. Design one coherent flow that makes backfill effortless and keeps live logging intact.

---

## 1. Core principle

Photo metadata (EXIF date + GPS) is a **strong hint, not gospel**. Everything derived is a suggested, editable value — never silently baked in. Camera clocks are wrong, timezones shift, edited photos lose EXIF. So: derive + suggest, always overrideable.

---

## 2. The centerpiece: photo dump → structured trip

User selects a batch of photos from a past trip:

1. **Read EXIF** for each photo (date captured `DateTimeOriginal` + GPS coords) using `exifr` (lazy-loaded like `heic2any` — keeps the bundle lean).
2. **Fallback date** when EXIF is absent: the file's `lastModified` (from the File API — reliable enough).
3. **Two-level grouping**:
   - **Day buckets** (organizational — the ride timeline already groups by day).
   - **Stop clusters within each day** → one LEG per stop. A stop = photos clustered close in time AND place; travel between stops leaves a gap. Walk the day's photos sorted by time; start a new leg when the photo is "far" from the current cluster:
     - **GPS present:** new leg when GPS moved > ~2–3 km from the cluster centroid (real move), or a huge time gap (> ~3–4 h) even at the same spot.
     - **No GPS (fallback):** new leg when the time gap > ~45–60 min.
     - Otherwise the photo joins the current stop (a dwell burst).
   - **GPS-first rule:** a long gap at the SAME place stays one stop (you never moved); a short hop to a different place is a new stop (you moved). GPS overrides time.
4. **GPS → real pins (the map)**: if a stop cluster has GPS, derive its **destination pin** = the cluster's **median GPS** (robust to a stop's photo spread — you park here, walk to the viewpoint). This populates the leg's actual location, so consecutive legs draw the **real route** on the ride map (OSRM snaps roads between pins via the existing backfill machinery). The ride's start pin = the first stop's cluster. Photos without GPS → that leg becomes a **phantom** (the app already renders those as dashed "~ Stop N" markers; the user adds a pin in Review). The pin is a suggestion — nudge/re-pick in Review.
5. **Create one ride + N legs**: each leg = a detected stop — date = the day, **pin** = the cluster's median GPS (when present), name = reverse-geocoded place (or "Stop N"), photos ordered by EXIF time, cover from the first.
6. The result is a structured, editable trip — the user reviews it in a new step. Because clustering is best-effort, the Review step must support **merge/split legs** (recover from a stop split across a gap, or two stops caught together).

## 3. Name / place suggestion

- From the SAME pin (the stop cluster's median GPS) → **reverse-geocode** (Nominatim) to suggest the place name (e.g. "Kaza"). Pin and name come from one source.
- **Online-only** (Nominatim sends coordinates — note the privacy tradeoff in the UI copy; it's opt-in by uploading). Offline → fall back to manual entry / "Stop N" (the pin still works — it's lat/lng).
- The suggested name becomes the editable leg title/destination label.

## 4. Auto cover

The first photo of the ride becomes the **cover automatically** (editable — the existing cover picker stays).

## 5. Flow change (one coherent flow, no fork)

Reshape the "Log a ride" wizard to make photos an early, powerful input:

- **Step 1 — Photos (optional):** add a batch → the app builds the day-grouped legs with derived dates + suggested names. If skipped, you fill manually (live logging: date defaults to today).
- **Step 2 — Review legs:** the new center — a day-grouped list where the user confirms/adjusts dates, names, merges/splits legs, and sets the cover. (For backfill this replaces "add one leg at a time"; for live it's a single-leg review.)
- **Step 3 — Story:** optional note.
- One path, no data-model fork: photos are the smart default; manual is the fallback.

## 6. Ride-date edit (from the "edit via first leg" gap)

Surface **"Ride date"** as an editable field on the ride page / edit-ride — it writes through to leg 1, making the (otherwise hidden) coupling visible and editable in one place. No more drilling into the first leg to change the ride's date.

---

## 7. Implementation notes

- **`exifr`** — lightweight EXIF/EXIF-GPS parser, works on blobs/ArrayBuffers; lazy-loaded so it doesn't bloat the bundle (same pattern as the HEIC decoder).
- **HEIC EXIF risk:** iPhone photos are often HEIC; the existing `heic2any` conversion to JPEG may or may not carry EXIF through. If HEIC EXIF extraction is unreliable, fall back to `file.lastModified` + manual. Flag this for P4 verification (a real iPhone photo dump is the test).
- **Grouping util:** pure function — sort + day-cluster photos → `{ day, photos, date }[]`. Unit-testable (per the lessons in AGENTS.md).
- **Reverse-geocode:** Nominatim endpoint (the app already uses OSRM for routing; this adds the geocoding counterpart), online-only, with a clear offline fallback.
- **UI:** a new Review-legs step (day-grouped, editable date/name/cover, merge/split) — reuses the existing leg-editor fields per row.

---

## 8. Phases

| Phase | Scope | Gate |
|---|---|---|
| **P1** | `exifr` (lazy) + EXIF/lastModified date read + day-grouping util → photo dump produces structured legs with dates | build + a seeded/fixture photo set (JPEG with EXIF) |
| **P2** | Reverse-geocode name suggestion (Nominatim, online) + auto cover | build + manual |
| **P3** | Review-legs UI + flow reshape (Photos-first wizard) + ride-date edit field | build + manual |
| **P4** | HEIC EXIF edge handling, offline fallback polish, verification | build + real photo dump |

---

## 9. Risks / open questions

- **HEIC EXIF extraction** reliability (P4 test).
- **Reverse-geocode privacy + offline** (Nominatim sends coords; offline falls back to manual).
- **Multi-day / multi-stop grouping** — two-level: day buckets, then stop clusters within a day (GPS distance >~2–3 km or time gap >~45–60 min starts a new leg; GPS-first, time as fallback). The clustering thresholds are tunable and the Review step supports merge/split legs.
- **Review step** — day-grouped legs with editable date/name/cover AND **merge/split legs** (best-effort clustering must be recoverable).
- **Ordering of photos within a leg** — preserve EXIF order for the leg's photo rail.

## 10. Out of scope (for now)

- Live location tracking / GPS route from the photo trail.
- Photo-to-route (squiggle from photo GPS) — a separate geo feature.
- Storing EXIF or non-JPEG originals (already normalized to JPEG).
