# Retread — User Journeys

Every path a user can take through ride/leg creation, editing, and recovery. Based on the current implementation. Route hashes reference `src/constants.ts`; component behavior references the actual source.

---

## How to read this document

- **Steps** are numbered and sequential. Each step shows the screen the user sees and what changes.
- **Branches** are conditional paths (error states, edge cases, user choices).
- **Exit states** describe where the user lands after the journey completes or is abandoned.
- `[component:line]` references point to the source for verification.

---

## Entry Points

| Trigger | Location | Route |
|---------|----------|-------|
| "Log Your First Ride" button | Home empty state | `#/edit?mode=new-ride` |
| FAB "+" | Home (always visible when rides exist) | `#/edit?mode=new-ride` |
| FAB "+" | Ride detail (always visible) | `#/edit?mode=new-leg&rideId={id}` |
| "Log First Leg" button | Ride detail empty state (no legs) | `#/edit?mode=new-leg&rideId={id}` |
| "Add a leg with GPS" button | Ride detail map empty state (no map) | `#/edit?mode=new-leg&rideId={id}` |
| Edit icon | Ride detail header | `#/edit?mode=edit-ride&rideId={id}` |
| Edit icon | Leg detail header | `#/edit?mode=edit&legId={id}` |
| "Set this stop's pin" button | Leg detail (phantom legs, no map) | `#/edit?mode=edit&legId={id}` |
| "Edit This Leg" button | Leg detail (empty photo/note state) | `#/edit?mode=edit&legId={id}` |
| Search result tap | Search overlay | `#/ride/{id}` or `#/leg/{id}` (detail pages, not editor) |

---

## Journey 1: First-Time User — Create Ride → First Leg (Live)

**Persona:** User A — on the road, logging in real-time.
**Goal:** Create a ride and log the first leg while riding.

### Steps

1. **Home (empty state)**
   - App opens to Home. Ride book is empty.
   - Prominent CTA: "Log Your First Ride".

2. **Tap "Log Your First Ride"**
   - Route: `#/edit?mode=new-ride`
   - Editor opens. No GPS request yet — the browser asks for location only when the user taps "Use my location".
   - Start pin is empty until the user chooses: "Use my location" (prompts) or the place row (opens the picker).

3. **Fill ride title**
   - User types e.g. "Ladakh 2026".
   - Title is required — save blocked without it.

4. **Starting From section**
   - A single tappable place row ("Choose start →"). Tapping it opens the place picker (India-biased search + map), where the stop name is edited on the placed pin; "Use my location" sits beside the row for the live case.

5. **Distance Method**
   - Default: GPS route. User can switch to Manual.
   - If GPS route: tip says "We measure each leg between your GPS pins, along real roads."

6. **Tap "Create Ride"**
   - Save validates title. If valid, ride is written to Dexie.
   - **Redirect:** `#/edit?mode=new-leg&rideId={newRideId}` — continues straight into leg 1. `[save-helper.ts:83-84]`

7. **Leg editor opens (step 1 — Metrics)**
   - Mode: `new-leg`. Wizard shows: "1. METRICS → 2. PHOTOS → 3. STORY".
   - Date defaults to today, time auto-set to current time.
   - `fallbackCenter` loaded from ride's start pin — this is the "from" point for auto-distance.

8. **Fill leg title**
   - User types e.g. "Delhi to Manali".
   - Required — blocks advance to step 2.

9. **Set destination pin**
   - User taps "Use my location" (currently at destination).
   - GPS resolves → `GpsBadge` appears with coordinates.
   - Auto-distance fires: OSRM snaps route from start pin to destination pin. Result: "≈ 540 km · Delhi → Manali".

10. **Advance to Photos (step 2)**
    - User taps "Next: Photos →".
    - Title validated (must be non-empty). If valid, step advances.

11. **Add photos (optional)**
    - User taps "+ Add Photos", selects images from device.
    - Images compressed client-side. Preview grid appears.
    - User can tap ☆ to set cover photo.
    - Can tap "Arrange Photos" to reorder.

12. **Advance to Story (step 3)**
    - User taps "Next: Story →".

13. **Write note (optional)**
    - Textarea auto-focuses. Placeholder: "Write a whisper about this leg..."
    - User types e.g. "Smooth highway until Kullu, then ghat section with heavy trucks."

14. **Tap "Save Details"**
    - Form submits. Leg saved to Dexie with photos, note, GPS pin, auto-measured distance.
    - `backfillRideRoutes` snaps road path for this leg.
    - If cover photo selected, snapshot applied to ride's `coverBlob`.
    - Route: `#/ride/{rideId}` — returns to ride detail.

15. **Ride detail page**
    - Ride shows in timeline with 1 leg.
    - Map shows start pin → destination pin connected by OSRM road.
    - FAB "+" visible for adding more legs.

### Exit states
- **Completed:** Ride + 1 leg saved. User on ride detail.
- **Abandoned at step 1:** User taps back → `#/` (home). Ride is saved (from step 6), leg is not.
- **Abandoned at step 2/3:** User taps back → returns to previous step. Data preserved within session.
- **GPS failure:** User taps "Use my location" and GPS fails → toast "GPS auto-detect failed." Form shows empty pin buttons. User can retry or skip the pin.

---

## Journey 2: Return User — Create Ride → First Leg (Catch-up)

**Persona:** User B — logging a past trip after the fact.
**Goal:** Create a ride and log legs from memory, using map pins.

### Steps

1. **Home (has rides)**
   - User taps FAB "+".
   - Route: `#/edit?mode=new-ride`.

2. **No GPS request on mount**
   - The location prompt is deferred until the user taps "Use my location".
   - Start pin empty, pin buttons shown.

3. **Fill ride title**
   - User types e.g. "Spiti Loop 2025".

4. **Starting From**
   - Name field shown first. User types "Manali".
   - GPS pin not set yet. User taps "Pick on Map".
   - Map picker opens. User pans to Manali, taps "Confirm Location".
   - `startLocation` set to GPS coordinates + name.

5. **Distance Method**
   - User switches to Manual (catch-up users often don't have GPS pins for every leg).
   - Or keeps GPS route if they plan to pin every stop.

6. **Tap "Create Ride"**
   - Ride saved. Redirect to leg editor.

7. **Leg editor opens**
   - Same as Journey 1, step 7.

8. **Fill leg title**
   - User types "Manali to Spiti via Rohtang".

9. **Set destination**
   - Name field first: user types "Kaza".
   - Then taps "Pick on Map".
   - Map picker opens centered on `fallbackCenter` (Manali, the ride start).
   - User pans to Kaza, confirms.
   - Auto-distance calculates if GPS route mode.

10. **Steps 2-3:** Same as Journey 1 (photos, note — optional).

11. **Save → ride detail.**

### Exit states
- Same as Journey 1.
- **Map picker offline:** Toast "You are offline. Please paste coordinates from Google Maps instead." Map picker doesn't open. User can type coordinates manually or skip the pin.

---

## Journey 3: Add Leg to Existing Ride (Live)

**Persona:** User A — on the road, adding a leg mid-ride.
**Goal:** Log the next leg quickly.

### Steps

1. **Ride detail page**
   - User is viewing their ride. FAB "+" is visible.
   - Taps FAB.

2. **Leg editor opens**
   - Route: `#/edit?mode=new-leg&rideId={id}`.
   - Date defaults to today, time auto-set to now.
   - `fallbackCenter` loaded from the **last GPS leg's destination** (or ride start if no legs yet).
   - `distanceFromLabel` set to the last stop's name.

3. **Fill leg title**
   - User types e.g. "Manali to Jispa".

4. **Set destination**
   - User taps "Use my location" (currently at Jispa).
   - GPS resolves. Auto-distance fires from Manali (last stop) to Jispa.

5. **Skip photos and story**
   - User taps "Next: Photos →" (step 2).
   - Taps "Next: Story →" (step 3).
   - Taps "Save Details" immediately.

6. **Leg saved → ride detail.**
   - Timeline updated with new leg.
   - Map extended with new road segment.

### Exit states
- **Completed:** Leg saved. User on ride detail with updated timeline and map.
- **Abandoned:** User taps back at any step → returns to ride detail. No leg saved.

---

## Journey 4: Add Leg to Existing Ride (Catch-up)

**Persona:** User B — logging a past leg after the trip.
**Goal:** Add a leg with name and optional pin.

### Steps

1-2. Same as Journey 3.

3. **Fill leg title**
   - User types "Jispa to Sarchu".

4. **Set destination**
   - Name field first: user types "Sarchu".
   - Taps "Pick on Map".
   - Map picker centered on last stop (Jispa). User pans to Sarchu, confirms.
   - Auto-distance calculates.

5-6. Same as Journey 3 (skip to save).

### Edge case: User doesn't pin
- User types "Sarchu" but doesn't set a GPS pin.
- Saves from step 1 or 2.
- **No blocking.** Save proceeds.
- `mapNote` shown inline: "No map pin — this leg won't appear on the route map."
- Leg saved as phantom. Appears on ride map as hollow dashed marker.

---

## Journey 5: Quick Leg (Title + Pin Only)

**Persona:** Any user — wants to log a leg fast, no frills.
**Goal:** Minimum viable leg entry.

### Steps

1. **Open leg editor** (via FAB on ride detail).

2. **Fill title.**

3. **Set GPS pin** ("Use my location" or "Pick on Map").

4. **Tap "Next: Photos →"** (step 2).

5. **Tap "Next: Story →"** (step 3).

6. **Tap "Save Details"** without writing anything.

### Notes
- Distance auto-calculated if GPS pins are set.
- Date/time auto-filled.
- Photos array empty, note empty.
- This is the minimum viable leg: title + pin + auto-distance.

---

## Journey 6: Full Leg (All Steps)

**Persona:** Any user — wants a rich entry with photos and story.
**Goal:** Complete leg with all data.

### Steps

1-4. Same as Journey 5 (title, pin, advance to step 2).

5. **Photos (step 2)**
   - Upload multiple images.
   - Compressing indicator shown during processing.
   - Preview grid with cover star and remove buttons.
   - Tap "Arrange Photos" to reorder (when 2+ photos).
   - Tap ☆ on a photo to set as ride cover.

6. **Advance to Story (step 3).**

7. **Write note.**
   - Auto-expanding textarea.
   - Placeholder: "Write a whisper about this leg..."

8. **Tap "Save Details".**

### Edge cases
- **Photo compression failure:** Toast "Failed to upload [filename]: images must be valid format." Other photos still process.
- **No photos uploaded:** Step 2 is empty. User can advance without uploading.
- **Cover photo selected:** Snapshot applied to ride's `coverBlob` on save. Visible on home page ride card.

---

## Journey 7: Edit Existing Leg — Add/Modify Data

**Persona:** Any user — correcting or enriching a saved leg.
**Goal:** Update leg data.

### Steps

1. **Leg detail page**
   - User views the leg. Taps edit icon in header.
   - Route: `#/edit?mode=edit&legId={id}`.

2. **Editor loads existing data**
   - `loading: true` shown while Dexie query runs.
   - All fields populated: title, date, time, km, location, photos, note.
   - `skipAutoOnMountRef` set to `true` if leg already has km (prevents auto-measure from overwriting).

3. **Modify fields**
   - User changes any combination: title, date, time, destination, distance, photos, note.

4. **Save**
   - On step 3, "Save Details" triggers update (not create).
   - `save-helper` calls `db.legs.update(legId, legData)`.
   - `backfillRideRoutes` re-snap if GPS pin changed.
   - Route: `#/leg/{legId}` — returns to leg detail.

### Edge case: Changing distance mode
- User switches from GPS route to Manual.
- Auto-measured km cleared. Manual input shown.
- Switches back to GPS → re-measures if both pins are set.

### Edge case: Changing GPS pin
- User clears existing pin, sets new one.
- If `kmSource === 'auto'`, auto-measured distance cleared.
- New pin triggers re-measurement.

---

## Journey 8: Edit Name-Only Leg → Add GPS Pin

**Persona:** User B — added a leg without a pin, now wants it on the map.
**Goal:** Fix a phantom leg by adding a GPS pin.

### Steps

1. **Ride detail page**
   - Phantom leg visible in timeline (no map segment).
   - Map shows hollow dashed marker for the phantom.

2. **Tap phantom leg card**
   - Leg detail opens.
   - Map section shows empty state: "This stop has no exact location — set its pin to draw it here."
   - "Set this stop's pin" button visible.

3. **Tap "Set this stop's pin"**
   - Route: `#/edit?mode=edit&legId={id}`.
   - Editor loads with existing data (title, date, time, etc.).
   - GPS pin section shows "Use my location" / "Pick on Map" buttons (no pin set yet).

4. **Set GPS pin**
   - User taps "Use my location" or "Pick on Map".
   - Pin resolves.

5. **Save**
   - Leg updated with GPS pin.
   - `backfillRideRoutes` snaps route retroactively from previous stop to this pin.
   - `autoCalcKeyRef` triggers re-measurement if in GPS mode.

6. **Return to ride detail**
   - Phantom marker gone from map.
   - Solid road segment now drawn through this stop.
   - Leg card shows the stop name (or "Stop N" if unnamed).

### Notes
- `skipAutoOnMountRef` is `false` for name-only legs (`leg.km == null`), so adding a pin triggers auto-measurement automatically.
- The backfill tracks `lastKnownGps` — adding a pin to leg 3 of 5 doesn't break legs 4-5; they were already snapped from leg 2's position.

---

## Journey 9: Phantom Leg Flow (No Pin)

**Persona:** Any user — saves a leg without setting a GPS pin.
**Goal:** Leg is saved but doesn't appear on the route map.

### Steps

1. **Open leg editor.**

2. **Fill title** (required).

3. **Don't set a GPS pin.**
   - User skips "Use my location" and "Pick on Map".
   - Inline note shown: "No map pin — this leg won't appear on the route map."

4. **Save from step 1 or 2.**
   - `mapNote` set to `true` when advancing without pin. `[index.tsx:522-524]`
   - Save proceeds (implicit bypass — no separate flag).

5. **Leg saved as phantom.**
   - `location: { kind: 'named', name: '...' }` or `null`.
   - No `roadPath`.

6. **Ride detail page**
   - Phantom leg appears in timeline as a regular card (no visual distinction).
   - Map shows hollow dashed marker at position of previous real pin (with offset).
   - Dashed connectors to/from the phantom.
   - Label: "~ Stop N" (italic, 70% opacity).

7. **Leg detail page (phantom)**
   - Map section empty state: "This stop has no exact location — set its pin to draw it here."
   - "Set this stop's pin" button → opens editor for this leg.
   - Trail still renders using `stopLabel()`.
   - Photo/note empty state: "A quiet leg — no photos or note yet." with "Edit This Leg" button.

### Recovery
- User can edit the phantom leg (Journey 8) to add a GPS pin.
- Phantom disappears from ride map after save + backfill.

---

## Journey 10: Edit Ride — Modify Title/Start/Distance Method

**Persona:** Any user — correcting ride metadata.
**Goal:** Update ride title, starting location, or distance method.

### Steps

1. **Ride detail page**
   - User taps edit icon in header.
   - Route: `#/edit?mode=edit-ride&rideId={id}`.

2. **Editor loads existing ride data**
   - `loading: true` while Dexie query runs.
   - Ride title, start location, distance mode populated.

3. **Modify fields**
   - Change title, start pin (GPS or name), or distance method.

4. **Tap "Save Changes"**
   - Ride updated in Dexie.
   - Route: `#/ride/{rideId}` — returns to ride detail.

### Edge case: Changing distance mode mid-ride
- Switching from GPS route to Manual: no effect on existing legs (they keep their stored km).

---

## Journey 11: Start Pin Skipped (New Ride)

**Edge case:** User creates a ride without setting a start pin.

### Steps

1. **Editor opens with no GPS request.**
   - The location prompt is deferred to the "Use my location" tap.

2. **User creates the ride without a pin.**
   - `startLocation` is `null`.
   - `mapNote` shown: "No start pin — your route will begin at the first pinned stop."
   - Ride saves. First leg's GPS pin becomes the effective start of the route map.

---

## Journey 12: GPS Manual Failure (Use My Location)

**Edge case:** User taps "Use my location" but GPS fails.

### Steps

1. **User taps "Use my location"** (destination or start).
   - `handleDropPin` or `onRetryStartGps` fires.
   - GPS request with `timeout: 8000` (destination) or `timeout: 10000` (start).

2. **GPS fails.**
   - Error callback: `dispatch({ gpsLoading: false, location: null })`.
   - Pin remains unset.
   - No toast (manual triggers fail silently).

3. **User sees empty pin buttons again.**
   - Can retry "Use my location" or switch to "Pick on Map".

---

## Journey 13: Offline Map Picker

**Edge case:** User tries to open map picker while offline.

### Steps

1. **User taps "Pick on Map".**
   - `handleOpenMapPicker` checks `navigator.onLine`.

2. **Offline detected.**
   - Toast: "You are offline. Please paste coordinates from Google Maps instead."
   - Map picker does not open.

3. **User options:**
   - Paste coordinates into the offline coordinate-paste modal (parsed as GPS if valid lat/lng).
   - Skip the pin (phantom flow).
   - Go online and retry.

---

## Journey 14: Validation Error — Missing Title

**Edge case:** User tries to advance or save without a title.

### Steps

1. **User fills destination, skips title.**

2. **Taps "Next: Photos →"** (step 1).
   - `handleStepJump(2)` fires.
   - `legTitle.trim()` is empty.
   - `dispatch({ titleError: 'Leg Title is required to continue.' })`.
   - Input highlighted with `.input-error` class (red border).
   - Error text shown below input.

3. **User types a title.**
   - `titleError` cleared on input.

4. **Retry advance.**
   - Now succeeds.

### Same for ride creation
- "Ride Title is required to start a new ride." on save attempt.

---

## Journey 15: Validation Error — Missing Ride Title on Save

**Edge case:** User taps "Create Ride" without a title.

### Steps

1. **User fills start pin, distance method. Skips title.**

2. **Taps "Create Ride".**
   - `handleSave` fires.
   - `rideTitle.trim()` is empty.
   - `dispatch({ titleError: 'Ride Title is required to start a new ride.' })`.
   - Input highlighted. Error text shown.
   - Save blocked.

3. **User types title, retries save.**
   - Now succeeds.

---

## Journey 16: Photo Compression Failure

**Edge case:** User uploads an invalid or corrupt image file.

### Steps

1. **User selects files.**
   - `handlePhotoChange` iterates through files.

2. **One file fails compression.**
   - `compressImage` throws.
   - Toast: "Failed to upload [filename]: images must be valid format."
   - Other valid files still compress and add to the array.

3. **Failed file excluded.**
   - `newBlobs` doesn't include the failed file.
   - User can see the valid photos in the preview grid.

---

## Journey 17: Pin Clear → Distance Reset

**Edge case:** User clears a GPS pin after auto-distance was calculated.

### Steps

1. **Auto-distance calculated.**
   - Both pins set, OSRM snapped. `km` populated, `kmSource: 'auto'`.

2. **User clears destination pin** (tap × on `GpsBadge`).
   - `handleClearLocation` fires.
   - If `kmSource === 'auto'`: `dispatch({ km: null, kmSource: null })`. Auto-measured distance cleared.
   - If `kmSource === 'manual'` (user typed a value): distance preserved. `kmSource` not cleared.

3. **Form shows empty pin buttons again.**
   - Distance input empty (or shows manually typed value).
   - User can set a new pin to re-measure.

---

## Journey 18: Unsaved Changes → Back Button

**Edge case:** User fills form, then navigates away without saving.

### Steps

1. **User fills form fields.**
   - Title, destination, photos — any combination.

2. **User taps back button** (PageHeader).
   - `handleCancel` fires.
   - 100ms fade-out, then navigation.
   - **No confirmation dialog.** All changes lost.

3. **Navigation destination:**
   - New ride: `#/` (home).
   - New leg: `#/ride/{rideId}`.
   - Edit leg: `#/leg/{legId}`.
   - Edit ride: `#/ride/{rideId}`.

### Notes
- There is no dirty-state tracking or discard confirmation. This is by design — the app prioritizes fast exit over protection.
- Photos already compressed in memory are revoked on unmount (`URL.revokeObjectURL`).

---

## Journey 19: Distance Mode Switch Mid-Form

**Edge case:** User changes distance tracking method while filling the form.

### Steps

1. **User starts in GPS route mode.**
   - Both pins set. Auto-distance: "≈ 320 km".

2. **Switches to Manual.**
   - Auto-measured `km` cleared.
   - Manual input field shown.
   - User types a value. `kmSource: 'manual'`.

3. **Switches back to GPS route.**
   - If both pins still set: re-measurement fires automatically.
   - `autoCalcKeyRef` detects the key hasn't changed (pins didn't move), but mode change resets the ref.
   - Auto-distance recalculated.

---

## Journey 20: Backfill After Pin Addition

**Edge case:** Adding a GPS pin to a name-only leg retroactively fixes the route.

### Steps

1. **Ride with legs: Leg 1 (pinned), Leg 2 (phantom), Leg 3 (pinned).**
   - Ride map: solid road Leg 1 → Leg 2 (phantom, dashed connectors) → Leg 3.
   - Leg 3's road path was snapped from Leg 1's position (phantom in between didn't advance `lastKnownGps`).

2. **User edits Leg 2, adds GPS pin.**
   - Saves. Leg 2 now has `location.kind === 'gps'`.

3. **`backfillRideRoutes` runs.**
   - `lastKnownGps` starts from ride start (or Leg 1's pin).
   - Leg 1: already snapped, skipped.
   - Leg 2: now GPS-pinned. Snaps from Leg 1 → Leg 2. `lastKnownGps` advances to Leg 2.
   - Leg 3: already snapped from Leg 1's position, but now `lastKnownGps` is Leg 2. Re-snaps from Leg 2 → Leg 3.
   - All road paths updated.

4. **Ride detail refreshed.**
   - Phantom marker gone.
   - Solid road: Leg 1 → Leg 2 → Leg 3.
   - Map complete.

---

## Journey 22: Search → Navigate to Ride/Leg

**Edge case:** User finds content via search, not via home page.

### Steps

1. **User opens search overlay** (from home page).
   - Types a query. Results appear.

2. **Taps a ride result.**
   - Search overlay closes.
   - Route: `#/ride/{id}`.
   - Ride detail page loads.

3. **Taps a leg result.**
   - Route: `#/leg/{id}`.
   - Leg detail page loads.

### Notes
- Search results navigate to detail pages, not the editor.
- User must use edit icons or FABs on detail pages to enter the editor.
- `navDepthRef` tracks search → detail navigation for proper back-button behavior.

---

## Journey 23: Ride Delete

**Edge case:** User deletes an entire ride.

### Steps

1. **Ride detail page**
   - User taps delete icon in header.
   - `ConfirmModal` appears: "Delete Ride Logbook? This will permanently delete [title] and all of its legs."

2. **User confirms.**
   - All legs deleted from Dexie.
   - Ride deleted from Dexie.
   - Cover blob revoked.
   - `backfillRideRoutes` not needed (ride is gone).
   - Route: `#/` (home).

### Notes
- No undo. Destructive action with confirmation modal.
- Google Drive auto-sync will eventually reflect the deletion.

---

## Journey 24: Leg Delete

**Edge case:** User deletes a single leg from a ride.

### Steps

1. **Leg detail page**
   - User taps delete icon in header.
   - `ConfirmModal` appears.

2. **User confirms.**
   - Leg deleted from Dexie.
   - Photos and thumbnails not explicitly revoked (browser GC handles it).
   - `backfillRideRoutes(rideId)` runs — remaining legs re-snapped.
   - Route: `#/ride/{rideId}`.

### Notes
- Deleting a middle leg: subsequent legs re-snap from the new previous leg (thanks to `lastKnownGps` tracking).
- Deleting the only leg: ride map returns to empty state ("Log 2+ legs with GPS pins...").

---

## Journey 25: Multiple Rapid Saves (Auto-Sync)

**Edge case:** User creates multiple legs in quick succession.

### Steps

1. **User creates Leg 1. Save triggers `scheduleAutoSync()`.**
   - Debounce timer set: 5 seconds.

2. **Within 5 seconds, user creates Leg 2. Save triggers `scheduleAutoSync()` again.**
   - Previous debounce timer cleared.
   - New 5-second timer set.

3. **After 5 seconds of inactivity.**
   - `performAutoSync()` fires.
   - Reads all rides/legs from Dexie.
   - Serializes to JSON, compresses with gzip.
   - Uploads single backup to Google Drive (overwrites previous autosync file).

### Notes
- Only one upload per debounce window, regardless of how many saves happened.
- If offline during the window: sync skipped silently. Will try on next save when online.
- If no access token: sync skipped silently.

---

## Journey 26: Edit Ride — Change Start Pin

**Edge case:** User changes the ride's departure pin after legs exist.

### Steps

1. **Ride detail → edit ride.**
   - Existing `startLocation` shown in GpsBadge.

2. **User clears start pin, sets new one.**
   - Or uses "Pick on Map" to move it.

3. **Save.**
   - Ride's `startLocation` updated.
   - `backfillRideRoutes` runs. Leg 1 re-snaps from new start pin.
   - If first leg was a phantom, it doesn't affect the chain (phantom doesn't advance `lastKnownGps`).

### Notes
- Changing the start pin doesn't affect legs that were already snapped — they only re-snap if their `roadPath` is missing/short or endpoints drifted.

---

## Journey 27: Wizard Step Jump (Click Tab)

**Edge case:** User clicks a wizard progress tab to jump steps.

### Steps

1. **User is on step 1 (Metrics).**
   - Clicks "3. STORY" tab.
   - `handleStepJump(3)` fires.

2. **Validation: title must be non-empty.**
   - If title empty: error shown, step doesn't change.
   - If title filled: step jumps to 3 directly.

3. **User is on step 3 (Story).**
   - Clicks "1. METRICS" tab.
   - `handleStepJump(1)` fires. No validation needed (going backward).
   - Step jumps to 1. All form data preserved.

### Notes
- Steps are non-destructive — jumping forward/backward preserves all form state.
- Only forward jumps past step 1 require title validation.

---

## Journey 28: Photo Arrange and Cover Selection

**Edge case:** User reorders photos and changes cover after initial selection.

### Steps

1. **User uploads 4 photos on step 2.**

2. **Sets photo 3 as cover** (tap ☆).
   - `coverPhotoIndex: 2` (0-indexed).

3. **Taps "Arrange Photos".**
   - `PhotoArrangeSheet` opens. Draft order shown.
   - User moves photo 1 to position 3.
   - Draft order: [2, 3, 0, 1].

4. **Taps Save on arrange sheet.**
   - `handleArrangeSave([2, 3, 0, 1])` fires.
   - Photos, thumbnails, previews reordered.
   - `coverPhotoIndex` remapped: old index 2 → new index 0.
   - Sheet closes.

5. **Cover star now on photo at index 0** (which was originally photo 3).

### Notes
- Cover index is remapped during reorder to maintain the correct photo.
- If cover photo is removed (`handleRemovePhoto`), `coverPhotoIndex` becomes `null`.

---

## Journey 29: Map Picker — Set Pin by Panning

**Edge case:** User uses the map picker to set a precise location.

### Steps

1. **User taps "Pick on Map".**
   - `handleOpenMapPicker` checks online status.
   - If offline: toast, picker doesn't open.
   - If online: `showMapPicker: true`, `mapPickerTarget` set.

2. **Map picker opens full-screen.**
   - Leaflet map with CartoDB Voyager tiles.
   - Crosshair in center marks the selected point.
   - Initial center: existing pin, or `fallbackCenter` (previous stop), or default (India).

3. **User pans/zooms map.**
   - Crosshair stays centered. Map moves under it.
   - User positions desired location under crosshair.

4. **Taps "Confirm Location".**
   - `onConfirm(lat, lng)` fires.
   - `handleConfirmPickerLocation` sets `location` (or `startLocation`) to GPS coordinates.
   - Any existing name preserved.

5. **Picker closes.**
   - `GpsBadge` appears in form with coordinates.
   - Auto-distance fires if applicable.

---

## Journey 30: Keyboard Navigation (Accessibility)

**Edge case:** User navigates the editor using keyboard only.

### Steps

1. **Tab through form fields.**
   - Title input → Date input → Time input → Name input → GPS buttons → Distance toggle → Distance input.

2. **Focus-visible ring shown** (`:focus-visible` CSS).
   - Green outline on focused element.

3. **Submit with Enter.**
   - Form `onSubmit` fires `handleSave`.
   - Same behavior as clicking "Save Details".

4. **Wizard tabs keyboard accessible.**
   - Tabs are clickable `<span>` elements. Focusable via tab key.
   - Enter/Space activates step jump.

### Notes
- No ARIA roles on wizard tabs (potential accessibility improvement).
- Map picker has keyboard panning via Leaflet defaults.
