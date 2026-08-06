import { useReducer, useEffect, useRef, useCallback, useState } from 'preact/hooks';
import { useSearchParams } from 'wouter-preact';
import { db } from '../../db';
import { compressImage, createThumbnail } from '../../images';
import { ToastHost, useToast } from '../../components/toast';
import { StartStep } from './start-step';
import { LegStep } from './leg-step';
import { EditRideStep } from './edit-ride-step';
import { PhotosStep } from './photos-step';
import { StoryStep } from './story-step';
import { StepActions } from './fields';
import { useBodyScrollLock } from '../../components/use-body-scroll-lock';
import { closeModal, openModal, useRouteQuery } from '../../components/use-route-query';
import { PageHeader } from '../../components/page-header';
import { MapPicker } from '../../components/map-picker';
import { CoordinatePasteModal } from '../../components/coordinate-paste-modal';
import { saveEditorDetails } from './save-helper';
import { snapLeg, haversineDistance } from '../../road';
import { deriveRideTitle, sortLegs } from '../../lib';
import { reverseGeocode } from './utils';
import type { LocationUnion } from '../../types';
// ==========================================
// REDUCER STATE & MERGER TYPE DEFINITION
// ==========================================

export type WizardStep = 1 | 2 | 3 | 4;

interface EditorState {
  step: WizardStep;
  titleError: string;
  rideTitle: string;
  legTitle: string;
  // Set when the user tried to advance without a pin, so the form surfaces the
  // "no map pin" note and the implicit bypass stays a conscious choice.
  mapNote: boolean;
  date: string;
  time: string;
  note: string;
  km: number | null;
  // How the current km value was produced: auto (route measurement) vs manual
  // (typed by the user). Used to keep auto-fill honest — typing stops it, and
  // a pin move re-measures even after a manual value exists.
  kmSource: 'auto' | 'manual' | null;
  distanceMode: 'auto' | 'manual';
  // Human-readable name of the from-point an auto-measured distance is based on.
  distanceFromLabel: string | null;
  location: LocationUnion | null;
  startLocation: LocationUnion | null;
  gpsLoading: boolean;
  startGpsLoading: boolean;
  showMapPicker: boolean;
  showPasteModal: boolean;
  mapPickerTarget: 'start' | 'location';
  fallbackCenter: [number, number] | null;
  photos: Blob[];
  photoThumbs: Blob[];
  photoPreviews: string[];
  compressing: boolean;
  loading: boolean;
  // Index of the photo staged as this ride's home cover, or null for none.
  coverPhotoIndex: number | null;
}

const initialEditorState: EditorState = {
  step: 1,
  titleError: '',
  rideTitle: '',
  legTitle: '',
  mapNote: false,
  date: new Date().toISOString().split('T')[0],
  time: '',
  note: '',
  km: null,
  kmSource: null,
  distanceMode: 'auto',
  distanceFromLabel: null,
  location: null,
  startLocation: null,
  gpsLoading: false,
  startGpsLoading: false,
  showMapPicker: false,
  showPasteModal: false,
  mapPickerTarget: 'location',
  fallbackCenter: null,
  photos: [],
  photoThumbs: [],
  photoPreviews: [],
  compressing: false,
  loading: false,
  coverPhotoIndex: null,
};

// Simple merging reducer (acts like this.setState)
const formReducer = (state: EditorState, action: Partial<EditorState>) => {
  const filtered = Object.fromEntries(Object.entries(action).filter(([, v]) => v !== undefined));
  return { ...state, ...filtered };
};

// ==========================================
// EDITOR VIEW COMPONENT
// ==========================================

interface EditorProps {
  onNavigate: (route: string) => void;
  onNavigateBack: (logicalParent: string | null) => void;
}

export function Editor({ onNavigate, onNavigateBack }: EditorProps) {
  // Parse routing parameters from the in-hash query (`#/edit?mode=...`).
  const [searchParams] = useSearchParams();
  const rawMode = searchParams.get('mode');
  const validModes = ['new-ride', 'edit-ride', 'new-leg', 'edit'] as const;
  type EditorMode = typeof validModes[number];
  const mode: EditorMode | null = validModes.includes(rawMode as EditorMode) ? (rawMode as EditorMode) : null;

  const rideIdParam = searchParams.get('rideId');
  const legIdParam = searchParams.get('legId');
  const rideId = rideIdParam ? parseInt(rideIdParam, 10) : null;
  const legId = legIdParam ? parseInt(legIdParam, 10) : null;

  const [isClosing, setIsClosing] = useState(false);
  // Photo-arrange sheet: the ?modal=arrange query param on the host route
  // (#/edit?mode=…&modal=arrange) drives the sheet, so system Back dismisses
  // it cleanly.
  const { modal } = useRouteQuery();
  const showArrange = modal === 'arrange';
  useBodyScrollLock(showArrange);
  const openArrange = () => openModal('arrange');
  const closeArrange = () => closeModal('arrange');
  const [saving, setSaving] = useState(false);
  const { toasts, showToast, removeToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // When opening an existing leg that already has a distance, do not re-measure
  // on mount (would silently overwrite the stored value). Any later pin move
  // still re-measures because the auto-fill key changes.
  const skipAutoOnMountRef = useRef(false);

  // Wizard length depends on mode: a new ride runs Start → Stop → Photos →
  // Story (4 steps); a new leg / leg edit runs Stop → Photos → Story (3).
  const lastStep: WizardStep = mode === 'new-ride' ? 4 : 3;
  const stepNames = mode === 'new-ride'
    ? ['Start', 'Stop', 'Photos', 'Story']
    : ['Details', 'Photos', 'Note'];

  // Initialize unified merging state tree
  const [state, dispatch] = useReducer(formReducer, {
    ...initialEditorState,
    loading: mode === 'edit' || mode === 'edit-ride'
  });

  const {
    step,
    titleError,
    rideTitle,
    legTitle,
    mapNote,
    date,
    time,
    note,
    km,
    kmSource,
    distanceMode,
    distanceFromLabel,
    location,
    startLocation,
    gpsLoading,
    startGpsLoading,
    showMapPicker,
    showPasteModal,
    mapPickerTarget,
    fallbackCenter,
    photoPreviews,
    compressing,
    loading,
    photos,
    photoThumbs,
    coverPhotoIndex,
  } = state;

  const photosRef = useRef<Blob[]>([]);
  photosRef.current = photos;
  const photoThumbsRef = useRef<Blob[]>([]);
  photoThumbsRef.current = photoThumbs;
  const photoPreviewsRef = useRef<string[]>([]);
  photoPreviewsRef.current = photoPreviews;

  // Latest pin state readable inside async callbacks (reverse geocode, name to
  // pin) so a stale closure can never clobber a pin the user set meanwhile.
  const locationRef = useRef(location);
  locationRef.current = location;
  const startLocationRef = useRef(startLocation);
  startLocationRef.current = startLocation;

  // Load existing leg data when editing a leg
  useEffect(() => {
    if (mode === 'edit' && legId !== null) {
      skipAutoOnMountRef.current = true;
      db.legs.get(legId).then((leg) => {
        if (leg) {
          skipAutoOnMountRef.current = leg.km != null;
          const urls = (leg.photos || []).map(blob => URL.createObjectURL(blob));
          dispatch({
            date: leg.date,
            time: leg.time || '12:00',
            note: leg.note,
            km: leg.km ?? null,
            kmSource: leg.km != null ? 'manual' : null,
            location: leg.location ?? null,
            legTitle: leg.title || '',
            photos: leg.photos || [],
            photoThumbs: leg.photoThumbs || [],
            photoPreviews: urls,
            loading: false
          });
        } else {
          dispatch({ loading: false });
        }
      }).catch(err => {
        console.error('Failed to load leg for edit:', err);
        dispatch({ loading: false });
      });
    } else if (mode === 'new-leg') {
      dispatch({ time: new Date().toTimeString().slice(0, 5) });
    }
  }, [mode, legId]);

  // Load distance configuration directly from the Ride record
  useEffect(() => {
    let active = true;

    async function loadRideConfig() {
      let resolvedRideId = rideId;
      if (resolvedRideId === null && legId !== null) {
        const legRecord = await db.legs.get(legId);
        if (legRecord) resolvedRideId = legRecord.rideId;
      }
      if (resolvedRideId === null) return;

      try {
        const rideRecord = await db.rides.get(resolvedRideId);
        if (active && rideRecord) {
          const update: Partial<EditorState> = {
            // Legacy 'odo' rides fall back to manual.
            distanceMode: rideRecord.distanceMode === 'manual' ? 'manual' : 'auto',
          };
          if (mode === 'edit-ride') {
            update.rideTitle = rideRecord.title;
            update.startLocation = rideRecord.startLocation ?? null;
            update.loading = false;
          }
          dispatch(update);
        }
      } catch (err) {
        console.warn('Failed to load ride distance mode config:', err);
        if (active && mode === 'edit-ride') dispatch({ loading: false });
      }
    }

    loadRideConfig();
    return () => { active = false; };
  }, [rideId, legId]);

  // Pre-load fallback center from previous leg or start location
  useEffect(() => {
    let active = true;

    async function loadFallbackCenter() {
      let resolvedRideId = rideId;
      if (resolvedRideId === null && legId !== null) {
        const legRecord = await db.legs.get(legId);
        if (legRecord) resolvedRideId = legRecord.rideId;
      }
      if (resolvedRideId === null) return;

      try {
        const rideRecord = await db.rides.get(resolvedRideId);
        const legs = await db.legs.where('rideId').equals(resolvedRideId).toArray();
        const sorted = sortLegs(legs);

        let foundCenter: [number, number] | null = null;
        let fromLabel: string | null = null;
        if (mode === 'new-leg') {
          if (sorted.length > 0) {
            const lastLeg = sorted[sorted.length - 1];
            if (lastLeg.location?.kind === 'gps') foundCenter = [lastLeg.location.lat, lastLeg.location.lng];
            if (lastLeg.location?.name) fromLabel = lastLeg.location.name;
          }
          if (!foundCenter && rideRecord?.startLocation?.kind === 'gps') {
            foundCenter = [rideRecord.startLocation.lat, rideRecord.startLocation.lng];
          }
        } else if (mode === 'edit' && legId !== null) {
          const myIdx = sorted.findIndex(l => l.id === legId);
          if (myIdx > 0) {
            const prevLeg = sorted[myIdx - 1];
            if (prevLeg.location?.kind === 'gps') foundCenter = [prevLeg.location.lat, prevLeg.location.lng];
            if (prevLeg.location?.name) fromLabel = prevLeg.location.name;
          }
          if (!foundCenter && rideRecord?.startLocation?.kind === 'gps') {
            foundCenter = [rideRecord.startLocation.lat, rideRecord.startLocation.lng];
          }
        }
        if (!fromLabel && rideRecord?.startLocation?.name) fromLabel = rideRecord.startLocation.name;

        if (active) dispatch({ fallbackCenter: foundCenter, distanceFromLabel: fromLabel });
      } catch (err) {
        console.warn('Failed to load fallback map center:', err);
      }
    }

    loadFallbackCenter();
    return () => { active = false; };
  }, [rideId, legId, mode]);

  // Clean up Object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => { photoPreviewsRef.current.forEach(url => URL.revokeObjectURL(url)); };
  }, []);

  if (!mode) {
    // The hash may have already left the editor while the App is still fading
    // the outgoing view out (Android back / forward). In that window there is
    // no valid mode to render, but it's not an error — keep the closing
    // container so the exit transition stays smooth.
    const stillEditorRoute = window.location.hash.startsWith('#/edit');
    if (isClosing || !stillEditorRoute) {
      return <div class="editor-container" />;
    }
    return <p class="loading-text">Invalid editor mode.</p>;
  }

  // Best-effort: fill a nameless pin with a reverse-geocoded place name. Silent
  // and editable — only applied if the pin still has no name when it resolves.
  const suggestNameForPin = useCallback(async (lat: number, lng: number, target: 'start' | 'location') => {
    const name = await reverseGeocode(lat, lng);
    if (!name) return;
    const current = target === 'start' ? startLocationRef.current : locationRef.current;
    if (current?.kind === 'gps' && !current.name) {
      if (target === 'start') dispatch({ startLocation: { ...current, name } });
      else dispatch({ location: { ...current, name } });
    }
  }, []);

  // Auto-fill the leg title from the destination label whenever one exists and
  // the user hasn't typed a custom title yet.
  useEffect(() => {
    if ((mode === 'new-leg' || mode === 'edit' || mode === 'new-ride') && !legTitle.trim() && location?.name) {
      dispatch({ legTitle: location.name });
    }
  }, [location?.name, legTitle, mode]);

  // Geolocation detect shared by the leg and ride-start pins: moves the pin (or
  // start) to the device position, keeping any name the user already typed, and
  // reverse-geocodes a name only when the pin is still nameless. Error handling
  // differs per target, so the caller supplies onError.
  const gpsDetect = useCallback((target: 'start' | 'location', timeout: number, onError?: (err: GeolocationPositionError) => void) => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your device.');
      return;
    }
    if (target === 'start') dispatch({ startGpsLoading: true });
    else dispatch({ gpsLoading: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const name = (target === 'start' ? startLocation?.name : location?.name) || '';
        if (target === 'start') {
          dispatch({ startGpsLoading: false, mapNote: false, startLocation: { kind: 'gps', lat: pos.coords.latitude, lng: pos.coords.longitude, name } });
        } else {
          dispatch({ gpsLoading: false, mapNote: false, location: { kind: 'gps', lat: pos.coords.latitude, lng: pos.coords.longitude, name } });
        }
        suggestNameForPin(pos.coords.latitude, pos.coords.longitude, target);
      },
      (err) => {
        if (target === 'start') {
          dispatch({ startGpsLoading: false });
        } else {
          console.warn('Geolocation failed:', err);
          dispatch({ gpsLoading: false, location: null });
        }
        onError?.(err);
      },
      { enableHighAccuracy: true, timeout }
    );
  }, [location, startLocation]);

  const handleDropPin = useCallback(() => {
    gpsDetect('location', 8000);
  }, [gpsDetect]);

  const handleClearLocation = useCallback(() => {
    dispatch({
      location: null,
      // A removed pin means no route to measure; only a manually typed value survives.
      ...(kmSource === 'auto' ? { km: null, kmSource: null } : {}),
    });
  }, [kmSource]);

  const onClearStartLocation = () => {
    dispatch({ startLocation: null });
  };

  const onRetryStartGps = () => {
    gpsDetect('start', 10000, () => showToast('GPS auto-detect failed.'));
  };

  // The "from" point for measuring a leg's distance. On a new ride the ride
  // doesn't exist in the DB yet, so fall back to the in-form start pin instead
  // of the loaded fallbackCenter (which only resolves for existing rides/legs).
  const legFromCenter: [number, number] | null =
    fallbackCenter ?? (startLocation?.kind === 'gps' ? [startLocation.lat, startLocation.lng] : null);
  const legFromLabel =
    distanceFromLabel ?? (startLocation?.kind === 'gps' && startLocation.name ? startLocation.name : null);

  // Auto-measure a leg's distance along roads between the previous stop (or
  // ride start) and the destination pin. Uses a tight OSRM budget so the form
  // never stalls: one attempt per host, short timeout, straight-line fallback.
  const handleAutoFillDistance = async () => {
    if (!legFromCenter || location?.kind !== 'gps') return;
    dispatch({ gpsLoading: true });
    try {
      const fromGps = { lat: legFromCenter[0], lng: legFromCenter[1] };
      const toGps = { lat: location.lat, lng: location.lng };

      const snappedPath = await snapLeg(fromGps, toGps, { timeoutMs: 8000, maxAttempts: 0 });

      let totalKm = 0;
      for (let i = 1; i < snappedPath.length; i++) {
        totalKm += haversineDistance(snappedPath[i - 1], snappedPath[i]);
      }

      const roundedKm = Math.round(totalKm * 10) / 10;

      dispatch({ km: roundedKm, kmSource: 'auto' });
    } catch (err) {
      console.error('Failed to calculate road distance:', err);
      try {
        const fromGps = { lat: legFromCenter[0], lng: legFromCenter[1] };
        const toGps = { lat: location.lat, lng: location.lng };
        const directDist = Math.round(haversineDistance(fromGps, toGps) * 10) / 10;

        dispatch({ km: directDist, kmSource: 'auto' });
      } catch (innerErr) {
        showToast('Error calculating route distance.');
      }
    } finally {
      dispatch({ gpsLoading: false });
    }
  };

  // Key of the last auto-measurement (from+to coords). A pin change — or the
  // first pin being set — produces a new key and re-measures; editing the value
  // by hand leaves the key unchanged, so a typed number is not clobbered.
  const autoCalcKeyRef = useRef<string | null>(null);

  // Auto-fill distance from the route whenever a GPS end pin is set or moved in
  // GPS-route mode. Leaving auto mode resets the key so re-entering re-measures.
  useEffect(() => {
    if (distanceMode !== 'auto') {
      autoCalcKeyRef.current = null;
      return;
    }
    if (location?.kind !== 'gps' || !legFromCenter || gpsLoading) return;
    const key = `${legFromCenter[0]},${legFromCenter[1]}|${location.lat},${location.lng}`;
    if (autoCalcKeyRef.current !== key) {
      autoCalcKeyRef.current = key;
      if (skipAutoOnMountRef.current) {
        skipAutoOnMountRef.current = false;
        return;
      }
      handleAutoFillDistance();
    }
  }, [distanceMode, location, fallbackCenter, gpsLoading]);

  // Photo uploads & compression
  const handlePhotoChange = async (e: Event) => {
    const files = (e.target as HTMLInputElement).files as FileList;
    if (!files || files.length === 0) return;

    dispatch({ compressing: true });
    const newBlobs: Blob[] = [];
    const newThumbs: Blob[] = [];
    const newPreviews: string[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const compressedBlob = await compressImage(files[i]);
        newBlobs.push(compressedBlob);
        newThumbs.push(await createThumbnail(compressedBlob));
        newPreviews.push(URL.createObjectURL(compressedBlob));
      } catch (err) {
        console.error('Image compression failed:', err);
        showToast(`Failed to upload ${files[i].name}: images must be valid format.`);
      }
    }

    dispatch({
      photos: [...photosRef.current, ...newBlobs],
      photoThumbs: [...photoThumbsRef.current, ...newThumbs],
      photoPreviews: [...photoPreviewsRef.current, ...newPreviews],
      compressing: false
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemovePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviews[index]);
    dispatch({
      photos: photos.filter((_, i) => i !== index),
      photoThumbs: photoThumbs.filter((_, i) => i !== index),
      photoPreviews: photoPreviews.filter((_, i) => i !== index)
    });
  };

  // Apply the order from the shared arrange sheet: order holds indices into the
  // current arrays, so reindex photos/thumbs/previews and remap the cover index.
  const handleArrangeSave = (order: number[]) => {
    const reorder = <T,>(arr: T[]) => order.map((i) => arr[i]).filter(Boolean);
    dispatch({
      photos: reorder(photos),
      photoThumbs: reorder(photoThumbs),
      photoPreviews: reorder(photoPreviews),
      coverPhotoIndex: coverPhotoIndex === null ? null : order.indexOf(coverPhotoIndex),
    });
    closeArrange();
  };

  // Stage a photo as the ride cover. Persisted on save via save-helper.
  const handleSetCover = (index: number) => {
    dispatch({ coverPhotoIndex: coverPhotoIndex === index ? null : index });
  };

  // Advancing (or finally saving) without a pin is the implicit "save without a
  // map" bypass; flag it so the form shows the consequence instead of hiding it.
  // `final` covers the whole-form save, where the step check is irrelevant.
  const flagPinNote = (final = false) => {
    if (mode === 'new-ride' && step === 1 && startLocation?.kind !== 'gps') dispatch({ mapNote: true });
    if (mode === 'new-ride' && step === 2 && location?.kind !== 'gps') dispatch({ mapNote: true });
    if ((mode === 'new-leg' || mode === 'edit') && (final || step === 1) && location?.kind !== 'gps') dispatch({ mapNote: true });
  };

  const handleStepJump = (targetStep: WizardStep) => {
    // Advancing without a pin is the implicit "save without a map" bypass; flag
    // it so the form shows the consequence instead of hiding it. The pin that
    // matters depends on which step is being left.
    flagPinNote();
    dispatch({ titleError: '', step: targetStep });
  };

  const handleOpenMapPicker = (target: 'start' | 'location') => {
    dispatch({ mapPickerTarget: target });
    if (!navigator.onLine) {
      // The map needs a network; offer the paste-coordinates fallback instead.
      dispatch({ showPasteModal: true });
      return;
    }
    dispatch({ showMapPicker: true });
  };

  // From the map picker: a placed pin (or null when the user chose "keep as a
  // label"), plus the stop name edited in the modal.
  const handleConfirmPickerLocation = (pin: { lat: number; lng: number } | null, name: string) => {
    const target = mapPickerTarget;
    const existing = target === 'start' ? startLocation : location;
    if (pin) {
      if (target === 'start') {
        dispatch({ mapNote: false, startLocation: { kind: 'gps', lat: pin.lat, lng: pin.lng, name: name || existing?.name || '' } });
      } else {
        dispatch({ mapNote: false, location: { kind: 'gps', lat: pin.lat, lng: pin.lng, name: name || existing?.name || '' } });
      }
      if (!name && !existing?.name) suggestNameForPin(pin.lat, pin.lng, target);
    } else {
      // "Keep as a label (no pin)" — a named phantom.
      const named = name ? { kind: 'named' as const, name } : null;
      if (target === 'start') dispatch({ mapNote: false, startLocation: named });
      else dispatch({ mapNote: false, location: named });
    }
  };

  // From the offline coordinate-paste modal: always a real pin.
  const handlePasteLocation = (lat: number, lng: number) => {
    handleConfirmPickerLocation({ lat, lng }, '');
  };

  // Cancel closes back to the page's logical parent (pops in-app history when
  // possible). Save moves forward to the created/edited page (pushes). Both
  // share the same exit fade, so the nav function is passed in.
  const triggerClose = (nav: (path: string) => void, path: string) => {
    setIsClosing(true);
    setTimeout(() => {
      nav(path);
    }, 100);
  };

  // Compact Save routing delegator
  const handleSave = async (e: Event) => {
    e.preventDefault();
    if (saving) return;

    if (mode === 'edit-ride') {
      if (!rideTitle.trim()) {
        dispatch({ titleError: 'Ride Title is required.' });
        return;
      }
    } else if (mode !== 'new-ride' && mode !== 'new-leg' && mode !== 'edit') {
      return;
    } else if (step < lastStep) {
      // Advance the wizard; flag the pin note for the step being left.
      flagPinNote();
      dispatch({ step: (step + 1) as WizardStep });
      return;
    }

    // Final save without a pin is the implicit bypass; flag it for the note.
    flagPinNote(true);

    setSaving(true);
    try {
      const redirectPath = await saveEditorDetails(mode, rideId, legId, state);
      triggerClose(onNavigate, redirectPath);
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (mode === 'edit' && legId !== null) {
      triggerClose(onNavigateBack, `#/leg/${legId}`);
    } else if (mode === 'new-leg' || mode === 'edit-ride') {
      triggerClose(onNavigateBack, `#/ride/${rideId}`);
    } else {
      triggerClose(onNavigateBack, '#/');
    }
  };

  return (
    <div class="editor-container">
      <PageHeader onBack={handleCancel} />

      {/* Compact step dots for the wizards */}
      {mode !== 'edit-ride' && (
        <div class="wizard-dots" aria-label="Steps">
          <span class="wizard-dots-label">
            {stepNames[step - 1]}
          </span>
          <span class="wizard-dots-group">
            {stepNames.map((name, i) => {
              const n = (i + 1) as WizardStep;
              return (
                <button
                  key={n}
                  type="button"
                  class={`wizard-dot${step === n ? ' active' : ''}`}
                  aria-label={`${name} step`}
                  aria-current={step === n ? 'step' : undefined}
                  onClick={() => handleStepJump(n)}
                />
              );
            })}
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '300px' }}>
          <div style={{ padding: '60px 0', textAlign: 'center', flex: 1 }}>
            <p class="loading-text" style={{ margin: 0 }}>Loading details...</p>
          </div>
          <StepActions
            onBack={handleCancel}
            backLabel="Cancel"
            backDisabled
            nextLabel={mode === 'edit-ride' ? 'Save Changes' : 'Next →'}
            nextDisabled
          />
        </div>
      ) : (
        <form onSubmit={handleSave} class="editor-form">
          {mode === 'edit-ride' ? (
            <EditRideStep
              rideTitle={rideTitle}
              setRideTitle={(val) => dispatch({ rideTitle: val })}
              startLocation={startLocation}
              startGpsLoading={startGpsLoading}
              onClearStartLocation={onClearStartLocation}
              onRetryStartGps={onRetryStartGps}
              onOpenMapPicker={handleOpenMapPicker}
              mapNote={mapNote}
              titleError={titleError}
              setTitleError={(val) => dispatch({ titleError: val })}
              handleCancel={handleCancel}
              saving={saving}
            />
          ) : mode === 'new-ride' && step === 1 ? (
            <StartStep
              rideTitle={rideTitle}
              setRideTitle={(val) => dispatch({ rideTitle: val })}
              autoRideTitle={deriveRideTitle(date)}
              startLocation={startLocation}
              startGpsLoading={startGpsLoading}
              onClearStartLocation={onClearStartLocation}
              onRetryStartGps={onRetryStartGps}
              onOpenMapPicker={handleOpenMapPicker}
              mapNote={mapNote}
              titleError={titleError}
              setTitleError={(val) => dispatch({ titleError: val })}
              handleCancel={handleCancel}
              handleStepJump={handleStepJump}
              saving={saving}
            />
          ) : step === lastStep - 2 ? (
            <LegStep
              date={date}
              setDate={(val) => dispatch({ date: val })}
              time={time}
              setTime={(val) => dispatch({ time: val })}
              km={km}
              onKmChange={(val) => dispatch({ km: val, kmSource: 'manual' })}
              kmSource={kmSource}
              distanceFromLabel={legFromLabel}
              location={location}
              gpsLoading={gpsLoading}
              handleDropPin={handleDropPin}
              handleClearLocation={handleClearLocation}
              mapNote={mapNote}
              legTitle={legTitle}
              setLegTitle={(val) => dispatch({ legTitle: val })}
              autoTitle={location?.name || 'Auto'}
              distanceMode={distanceMode}
              setDistanceMode={(val) => dispatch({ distanceMode: val })}
              titleError={titleError}
              setTitleError={(val) => dispatch({ titleError: val })}
              step={step}
              handleCancel={handleCancel}
              handleStepJump={handleStepJump}
              onOpenMapPicker={handleOpenMapPicker}
              fallbackCenter={legFromCenter}
              onAutoFillDistance={handleAutoFillDistance}
              saving={saving}
            />
          ) : step === lastStep - 1 ? (
            <PhotosStep
              photoPreviews={photoPreviews}
              fileInputRef={fileInputRef}
              compressing={compressing}
              handlePhotoChange={handlePhotoChange}
              handleRemovePhoto={handleRemovePhoto}
              handleSetCover={handleSetCover}
              coverPhotoIndex={coverPhotoIndex}
              showArrange={showArrange}
              setShowArrange={(open) => (open ? openArrange() : closeArrange())}
              handleArrangeSave={handleArrangeSave}
              step={step}
              handleStepJump={handleStepJump}
            />
          ) : (
            <StoryStep
              note={note}
              setNote={(val) => dispatch({ note: val })}
              step={step}
              handleStepJump={handleStepJump}
              saveLabel={mode === 'new-ride' ? 'Log This Ride' : 'Save Details'}
              saving={saving}
            />
          )}
        </form>
      )}

      {/* Map Picker Modal Backdrop & Overlay */}
      <MapPicker
        isOpen={showMapPicker}
        initialLocation={mapPickerTarget === 'start' ? startLocation : location}
        fallbackCenter={fallbackCenter}
        onConfirm={handleConfirmPickerLocation}
        onClose={() => dispatch({ showMapPicker: false })}
        showToast={showToast}
      />

      {/* Offline fallback: paste raw coordinates when the map can't load */}
      <CoordinatePasteModal
        isOpen={showPasteModal}
        targetLabel={mapPickerTarget === 'start' ? 'Start point' : 'Destination'}
        onConfirm={handlePasteLocation}
        onClose={() => dispatch({ showPasteModal: false })}
      />

      <ToastHost toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
