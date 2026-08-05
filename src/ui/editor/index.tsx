import { useReducer, useEffect, useRef, useCallback, useState } from 'preact/hooks';
import { db } from '../../db';
import { compressImage, createThumbnail } from '../../images';
import { Toast, useToast } from '../../components/toast';
import { MetricsStep } from './metrics-step';
import { PhotosStep } from './photos-step';
import { StoryStep } from './story-step';
import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { MapPicker } from '../../components/map-picker';
import { CoordinatePasteModal } from '../../components/coordinate-paste-modal';
import { saveEditorDetails } from './save-helper';
import { snapLeg, haversineDistance } from '../../road';
import type { LocationUnion } from '../../types';

// ==========================================
// REDUCER STATE & MERGER TYPE DEFINITION
// ==========================================

interface EditorState {
  step: 1 | 2 | 3;
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
  odo: number | null;
  distanceMode: 'auto' | 'manual' | 'odo';
  startOdo: number | null;
  // Human-readable name of the from-point an auto-measured distance is based on.
  distanceFromLabel: string | null;
  // Last odometer reading before this leg (ride startOdo for the first leg),
  // used for the odo delta preview in the leg form.
  prevOdo: number | null;
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
  odo: null,
  distanceMode: 'auto',
  startOdo: null,
  distanceFromLabel: null,
  prevOdo: null,
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
  // Parse routing parameters from hash
  const hashParts = window.location.hash.split('?');
  const params = new URLSearchParams(hashParts[1] || '');
  const rawMode = params.get('mode');
  const validModes = ['new-ride', 'edit-ride', 'new-leg', 'edit'] as const;
  type EditorMode = typeof validModes[number];
  const mode: EditorMode | null = validModes.includes(rawMode as EditorMode) ? (rawMode as EditorMode) : null;
  
  const rideIdParam = params.get('rideId');
  const legIdParam = params.get('legId');
  const rideId = rideIdParam ? parseInt(rideIdParam, 10) : null;
  const legId = legIdParam ? parseInt(legIdParam, 10) : null;

  const [isClosing, setIsClosing] = useState(false);
  const [showArrange, setShowArrange] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toasts, showToast, removeToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // When opening an existing leg that already has a distance, do not re-measure
  // on mount (would silently overwrite the stored value). Any later pin move
  // still re-measures because the auto-fill key changes.
  const skipAutoOnMountRef = useRef(false);

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
    odo,
    distanceMode,
    startOdo,
    distanceFromLabel,
    prevOdo,
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

  // Auto-capture departure GPS on mount for new rides
  useEffect(() => {
    if (mode === 'new-ride' && navigator.geolocation) {
      let active = true;
      dispatch({ startGpsLoading: true });
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (active) {
            dispatch({
              startGpsLoading: false,
              startLocation: { kind: 'gps', lat: position.coords.latitude, lng: position.coords.longitude, name: '' }
            });
            showToast('Location captured.');
          }
        },
        () => {
          if (active) {
            dispatch({ startGpsLoading: false });
            showToast('GPS auto-detect failed.');
          }
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
      return () => { active = false; };
    }
  }, [mode]);

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
            odo: leg.odo ?? null,
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

  // Load distance configuration and starting odometer directly from the Ride record
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
            distanceMode: rideRecord.distanceMode === 'odo' ? 'odo' : rideRecord.distanceMode === 'auto' ? 'auto' : 'manual',
            startOdo: rideRecord.startOdo ?? null,
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
        const sorted = [...legs].sort((a, b) => {
          const dComp = a.date.localeCompare(b.date);
          if (dComp !== 0) return dComp;
          return (a.time || '00:00').localeCompare(b.time || '00:00') || (a.id || 0) - (b.id || 0);
        });

        let foundCenter: [number, number] | null = null;
        let fromLabel: string | null = null;
        let prevOdoVal: number | null = null;
        if (mode === 'new-leg') {
          if (sorted.length > 0) {
            const lastLeg = sorted[sorted.length - 1];
            if (lastLeg.location?.kind === 'gps') foundCenter = [lastLeg.location.lat, lastLeg.location.lng];
            if (lastLeg.location?.name) fromLabel = lastLeg.location.name;
            if (lastLeg.odo != null) prevOdoVal = lastLeg.odo;
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
            if (prevLeg.odo != null) prevOdoVal = prevLeg.odo;
          }
          if (!foundCenter && rideRecord?.startLocation?.kind === 'gps') {
            foundCenter = [rideRecord.startLocation.lat, rideRecord.startLocation.lng];
          }
        }
        if (!fromLabel && rideRecord?.startLocation?.name) fromLabel = rideRecord.startLocation.name;
        if (prevOdoVal === null && rideRecord?.startOdo != null) prevOdoVal = rideRecord.startOdo;

        if (active) dispatch({ fallbackCenter: foundCenter, distanceFromLabel: fromLabel, prevOdo: prevOdoVal });
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

  // Geolocation Handler
  const handleDropPin = useCallback(() => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your device.');
      return;
    }
    dispatch({ gpsLoading: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Keep any name the user already typed; GPS auto-detect only moves the pin.
        dispatch({ gpsLoading: false, mapNote: false, location: { kind: 'gps', lat: pos.coords.latitude, lng: pos.coords.longitude, name: location?.name || '' } });
      },
      (err) => {
        console.warn('Geolocation failed:', err);
        dispatch({ gpsLoading: false, location: null });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [location]);

  const handleClearLocation = useCallback(() => {
    const next: LocationUnion | null = location && location.name ? { kind: 'named', name: location.name } : null;
    dispatch({
      location: next,
      // A removed pin means no route to measure; only a manually typed value survives.
      ...(kmSource === 'auto' ? { km: null, kmSource: null } : {}),
    });
  }, [location, kmSource]);

  const onClearStartLocation = () => {
    dispatch({ startLocation: startLocation && startLocation.name ? { kind: 'named', name: startLocation.name } : null });
  };

  const onRetryStartGps = () => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your device.');
      return;
    }
    dispatch({ startGpsLoading: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Keep any name the user already typed; GPS auto-detect only moves the pin.
        dispatch({ startGpsLoading: false, mapNote: false, startLocation: { kind: 'gps', lat: pos.coords.latitude, lng: pos.coords.longitude, name: startLocation?.name || '' } });
      },
      () => {
        dispatch({ startGpsLoading: false });
        showToast('GPS auto-detect failed.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Auto-measure a leg's distance along roads between the previous stop (or
  // ride start) and the destination pin. Uses a tight OSRM budget so the form
  // never stalls: one attempt per host, short timeout, straight-line fallback.
  const handleAutoFillDistance = async () => {
    if (!fallbackCenter || location?.kind !== 'gps') return;
    dispatch({ gpsLoading: true });
    try {
      const fromGps = { lat: fallbackCenter[0], lng: fallbackCenter[1] };
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
        const fromGps = { lat: fallbackCenter[0], lng: fallbackCenter[1] };
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
    if (location?.kind !== 'gps' || !fallbackCenter || gpsLoading) return;
    const key = `${fallbackCenter[0]},${fallbackCenter[1]}|${location.lat},${location.lng}`;
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
    setShowArrange(false);
  };

  // Stage a photo as the ride cover. Persisted on save via save-helper.
  const handleSetCover = (index: number) => {
    dispatch({ coverPhotoIndex: coverPhotoIndex === index ? null : index });
  };

  const handleStepJump = (targetStep: 1 | 2 | 3) => {
    if (mode === 'new-ride' && !rideTitle.trim() && targetStep > 1) {
      dispatch({ titleError: 'Ride Title is required to start a new ride.' });
      return;
    }
    if ((mode === 'new-leg' || mode === 'edit') && !legTitle.trim() && targetStep > 1) {
      dispatch({ titleError: 'Leg Title is required to continue.' });
      return;
    }
    // Advancing without a pin is the implicit "save without a map" bypass; flag
    // it so the form shows the consequence instead of hiding it.
    if (mode === 'new-ride' && startLocation?.kind !== 'gps') dispatch({ mapNote: true });
    if ((mode === 'new-leg' || mode === 'edit') && location?.kind !== 'gps') dispatch({ mapNote: true });
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

  const handleConfirmPickerLocation = (lat: number, lng: number, name?: string) => {
    if (mapPickerTarget === 'start') {
      dispatch({ mapNote: false, startLocation: { kind: 'gps', lat, lng, name: name || startLocation?.name || '' } });
    } else {
      dispatch({ mapNote: false, location: { kind: 'gps', lat, lng, name: name || location?.name || '' } });
    }
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

    if (mode === 'new-ride' || mode === 'edit-ride') {
      if (!rideTitle.trim()) {
        dispatch({ titleError: mode === 'edit-ride' ? 'Ride Title is required.' : 'Ride Title is required to start a new ride.' });
        return;
      }
    } else if ((mode === 'new-leg' || mode === 'edit') && !legTitle.trim()) {
      dispatch({ titleError: 'Leg Title is required to save.' });
      return;
    } else if (step < 3) {
      if (location?.kind !== 'gps') dispatch({ mapNote: true });
      dispatch({ step: (step + 1) as 1 | 2 | 3 });
      return;
    }

    // Final save without a pin is the implicit bypass; flag it for the note.
    if (mode === 'new-ride' && startLocation?.kind !== 'gps') dispatch({ mapNote: true });
    if ((mode === 'new-leg' || mode === 'edit') && location?.kind !== 'gps') dispatch({ mapNote: true });

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

      {/* Mode title */}
      <h2 class="page-heading">
        {mode === 'new-ride' ? 'New Ride' :
         mode === 'edit-ride' ? 'Edit Ride Details' :
         mode === 'new-leg' ? 'Log a Leg' :
         'Edit Leg Details'}
      </h2>
      {mode === 'new-leg' && (
        <p class="field-tip" style={{ marginTop: '-4px', marginBottom: 'var(--spacing-sm)' }}>A leg is a stretch between two stops. Add photos and notes along the way.</p>
      )}

      {/* Progress Tab Indicator */}
      {mode !== 'new-ride' && mode !== 'edit-ride' && (
        <div class="wizard-progress">
          <span class={`progress-step ${step === 1 ? 'active' : ''}`} onClick={() => handleStepJump(1)}>1. Details</span>
          <span class="progress-divider">→</span>
          <span class={`progress-step ${step === 2 ? 'active' : ''}`} onClick={() => handleStepJump(2)}>2. Photos</span>
          <span class="progress-divider">→</span>
          <span class={`progress-step ${step === 3 ? 'active' : ''}`} onClick={() => handleStepJump(3)}>3. Note</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '300px' }}>
          <div style={{ padding: '60px 0', textAlign: 'center', flex: 1 }}>
            <p class="loading-text" style={{ margin: 0 }}>Loading details...</p>
          </div>
          <div class="form-actions">
            <Button variant="secondary" onClick={handleCancel} disabled>Cancel</Button>
            <Button variant="primary" disabled>
              {mode === 'edit-ride' ? 'Save Changes' : 'Next →'}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} class="editor-form">
          {step === 1 && (
            <MetricsStep
              mode={mode}
              rideTitle={rideTitle}
              setRideTitle={(val) => dispatch({ rideTitle: val })}
              date={date}
              setDate={(val) => dispatch({ date: val })}
              time={time}
              setTime={(val) => dispatch({ time: val })}
              km={km}
              onKmChange={(val) => dispatch({ km: val, kmSource: 'manual' })}
              kmSource={kmSource}
              distanceFromLabel={distanceFromLabel}
              prevOdo={prevOdo}
              odo={odo}
              setOdo={(val) => dispatch({ odo: val })}
              distanceMode={distanceMode}
              setDistanceMode={(val) => dispatch({ distanceMode: val })}
              startOdo={startOdo}
              setStartOdo={(val) => dispatch({ startOdo: val })}
              location={location}
              setLocation={(val) => dispatch({ location: val, ...(val?.kind === 'gps' ? { mapNote: false } : {}) })}
              gpsLoading={gpsLoading}
              handleDropPin={handleDropPin}
              handleClearLocation={handleClearLocation}
              mapNote={mapNote}
              legTitle={legTitle}
              setLegTitle={(val) => dispatch({ legTitle: val })}
              startLocation={startLocation}
              setStartLocation={(val) => dispatch({ startLocation: val, ...(val?.kind === 'gps' ? { mapNote: false } : {}) })}
              startGpsLoading={startGpsLoading}
              onClearStartLocation={onClearStartLocation}
              onRetryStartGps={onRetryStartGps}
              titleError={titleError}
              setTitleError={(val) => dispatch({ titleError: val })}
              handleCancel={handleCancel}
              handleStepJump={handleStepJump}
              onOpenMapPicker={handleOpenMapPicker}
              fallbackCenter={fallbackCenter}
              onAutoFillDistance={handleAutoFillDistance}
              saving={saving}
            />
          )}

          {step === 2 && (
            <PhotosStep
              photoPreviews={photoPreviews}
              fileInputRef={fileInputRef}
              compressing={compressing}
              handlePhotoChange={handlePhotoChange}
              handleRemovePhoto={handleRemovePhoto}
              handleSetCover={handleSetCover}
              coverPhotoIndex={coverPhotoIndex}
              showArrange={showArrange}
              setShowArrange={setShowArrange}
              handleArrangeSave={handleArrangeSave}
              handleStepJump={handleStepJump}
            />
          )}

          {step === 3 && (
            <StoryStep
              note={note}
              setNote={(val) => dispatch({ note: val })}
              handleStepJump={handleStepJump}
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
        onConfirm={handleConfirmPickerLocation}
        onClose={() => dispatch({ showPasteModal: false })}
      />

      <div class="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </div>
  );
}
