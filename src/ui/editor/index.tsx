import { useReducer, useEffect, useRef, useCallback, useState } from 'preact/hooks';
import { db } from '../../db';
import { compressImage } from '../../images';
import { Toast, useToast } from '../../components/toast';
import { MetricsStep } from './metrics-step';
import { PhotosStep } from './photos-step';
import { StoryStep } from './story-step';
import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { MapPicker } from '../../components/map-picker';
import { saveEditorDetails } from './save-helper';
import type { LocationUnion } from '../../types';

// ==========================================
// REDUCER STATE & MERGER TYPE DEFINITION
// ==========================================

interface EditorState {
  step: 1 | 2 | 3;
  titleError: string;
  tripTitle: string;
  legTitle: string;
  date: string;
  time: string;
  note: string;
  km: number | null;
  odo: number | null;
  distanceMode: 'auto' | 'manual' | 'odo';
  startOdo: number | null;
  location: LocationUnion | null;
  startLocation: LocationUnion | null;
  gpsLoading: boolean;
  startGpsLoading: boolean;
  showMapPicker: boolean;
  mapPickerTarget: 'start' | 'location';
  fallbackCenter: [number, number] | null;
  photos: Blob[];
  photoPreviews: string[];
  compressing: boolean;
  loading: boolean;
}

const initialEditorState: EditorState = {
  step: 1,
  titleError: '',
  tripTitle: '',
  legTitle: '',
  date: new Date().toISOString().split('T')[0],
  time: '',
  note: '',
  km: null,
  odo: null,
  distanceMode: 'auto',
  startOdo: null,
  location: null,
  startLocation: null,
  gpsLoading: false,
  startGpsLoading: false,
  showMapPicker: false,
  mapPickerTarget: 'location',
  fallbackCenter: null,
  photos: [],
  photoPreviews: [],
  compressing: false,
  loading: false,
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
}

export function Editor({ onNavigate }: EditorProps) {
  // Parse routing parameters from hash
  const hashParts = window.location.hash.split('?');
  const params = new URLSearchParams(hashParts[1] || '');
  const rawMode = params.get('mode');
  const validModes = ['new-trip', 'edit-trip', 'new-leg', 'edit'] as const;
  type EditorMode = typeof validModes[number];
  // Accept legacy 'new-day' URLs by mapping them to the renamed 'new-leg' mode
  const normalizedMode = rawMode === 'new-day' ? 'new-leg' : rawMode;
  const mode: EditorMode | null = validModes.includes(normalizedMode as EditorMode) ? (normalizedMode as EditorMode) : null;
  
  const tripIdParam = params.get('tripId');
  const pageIdParam = params.get('pageId');
  const tripId = tripIdParam ? parseInt(tripIdParam, 10) : null;
  const pageId = pageIdParam ? parseInt(pageIdParam, 10) : null;

  const [isClosing, setIsClosing] = useState(false);
  const { toasts, showToast, removeToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize unified merging state tree
  const [state, dispatch] = useReducer(formReducer, {
    ...initialEditorState,
    loading: mode === 'edit' || mode === 'edit-trip'
  });

  const {
    step,
    titleError,
    tripTitle,
    legTitle,
    date,
    time,
    note,
    km,
    odo,
    distanceMode,
    startOdo,
    location,
    startLocation,
    gpsLoading,
    startGpsLoading,
    showMapPicker,
    mapPickerTarget,
    fallbackCenter,
    photoPreviews,
    compressing,
    loading,
    photos,
  } = state;

  const photosRef = useRef<Blob[]>([]);
  photosRef.current = photos;
  const photoPreviewsRef = useRef<string[]>([]);
  photoPreviewsRef.current = photoPreviews;

  // Auto-capture departure GPS on mount for new trips
  useEffect(() => {
    if (mode === 'new-trip' && navigator.geolocation) {
      let active = true;
      dispatch({ startGpsLoading: true });
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (active) dispatch({
            startGpsLoading: false,
            startLocation: { kind: 'gps', lat: position.coords.latitude, lng: position.coords.longitude, name: '' }
          });
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

  // Load existing page data if editing an entry
  useEffect(() => {
    if (mode === 'edit' && pageId !== null) {
      db.pages.get(pageId).then((page) => {
        if (page) {
          const urls = (page.photos || []).map(blob => URL.createObjectURL(blob));
          dispatch({
            date: page.date,
            time: page.time || '12:00',
            note: page.note,
            km: page.km ?? null,
            odo: page.odo ?? null,
            location: page.location ?? null,
            legTitle: page.title || '',
            photos: page.photos || [],
            photoPreviews: urls,
            loading: false
          });
        } else {
          dispatch({ loading: false });
        }
      }).catch(err => {
        console.error('Failed to load page for edit:', err);
        dispatch({ loading: false });
      });
    } else if (mode === 'new-leg') {
      dispatch({ time: new Date().toTimeString().slice(0, 5) });
    }
  }, [mode, pageId]);

  // Load distance configuration and starting odometer directly from the Trip record
  useEffect(() => {
    let active = true;

    async function loadTripConfig() {
      let resolvedTripId = tripId;
      if (resolvedTripId === null && pageId !== null) {
        const pageRecord = await db.pages.get(pageId);
        if (pageRecord) resolvedTripId = pageRecord.tripId;
      }
      if (resolvedTripId === null) return;

      try {
        const tripRecord = await db.trips.get(resolvedTripId);
        if (active && tripRecord) {
          const update: Partial<EditorState> = {
            distanceMode: tripRecord.distanceMode === 'odo' ? 'odo' : tripRecord.distanceMode === 'auto' ? 'auto' : 'manual',
            startOdo: tripRecord.startOdo ?? null,
          };
          if (mode === 'edit-trip') {
            update.tripTitle = tripRecord.title;
            update.startLocation = tripRecord.startLocation ?? null;
            update.loading = false;
          }
          dispatch(update);
        }
      } catch (err) {
        console.warn('Failed to load trip distance mode config:', err);
        if (active && mode === 'edit-trip') dispatch({ loading: false });
      }
    }

    loadTripConfig();
    return () => { active = false; };
  }, [tripId, pageId]);

  // Pre-load fallback center from previous leg or start location
  useEffect(() => {
    let active = true;

    async function loadFallbackCenter() {
      let resolvedTripId = tripId;
      if (resolvedTripId === null && pageId !== null) {
        const pageRecord = await db.pages.get(pageId);
        if (pageRecord) resolvedTripId = pageRecord.tripId;
      }
      if (resolvedTripId === null) return;

      try {
        const tripRecord = await db.trips.get(resolvedTripId);
        const pages = await db.pages.where('tripId').equals(resolvedTripId).toArray();
        const sorted = [...pages].sort((a, b) => {
          const dComp = a.date.localeCompare(b.date);
          if (dComp !== 0) return dComp;
          return (a.time || '00:00').localeCompare(b.time || '00:00') || (a.id || 0) - (b.id || 0);
        });

        let foundCenter: [number, number] | null = null;
        if (mode === 'new-leg') {
          if (sorted.length > 0) {
            const lastPage = sorted[sorted.length - 1];
            if (lastPage.location?.kind === 'gps') foundCenter = [lastPage.location.lat, lastPage.location.lng];
          }
          if (!foundCenter && tripRecord?.startLocation?.kind === 'gps') {
            foundCenter = [tripRecord.startLocation.lat, tripRecord.startLocation.lng];
          }
        } else if (mode === 'edit' && pageId !== null) {
          const myIdx = sorted.findIndex(p => p.id === pageId);
          if (myIdx > 0) {
            const prevPage = sorted[myIdx - 1];
            if (prevPage.location?.kind === 'gps') foundCenter = [prevPage.location.lat, prevPage.location.lng];
          }
          if (!foundCenter && tripRecord?.startLocation?.kind === 'gps') {
            foundCenter = [tripRecord.startLocation.lat, tripRecord.startLocation.lng];
          }
        }

        if (active && foundCenter) dispatch({ fallbackCenter: foundCenter });
      } catch (err) {
        console.warn('Failed to load fallback map center:', err);
      }
    }

    loadFallbackCenter();
    return () => { active = false; };
  }, [tripId, pageId, mode]);

  // Clean up Object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => { photoPreviewsRef.current.forEach(url => URL.revokeObjectURL(url)); };
  }, []);

  if (!mode) {
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
        dispatch({ gpsLoading: false, location: { kind: 'gps', lat: pos.coords.latitude, lng: pos.coords.longitude, name: '' } });
      },
      (err) => {
        console.warn('Geolocation failed:', err);
        dispatch({ gpsLoading: false, location: null });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  const handleClearLocation = useCallback(() => {
    dispatch({ location: location && location.name ? { kind: 'named', name: location.name } : null });
  }, [location]);

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
        dispatch({ startGpsLoading: false, startLocation: { kind: 'gps', lat: pos.coords.latitude, lng: pos.coords.longitude, name: '' } });
      },
      () => {
        dispatch({ startGpsLoading: false });
        showToast('GPS auto-detect failed.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleAutoFillDistance = async () => {
    if (!fallbackCenter || location?.kind !== 'gps') return;
    dispatch({ gpsLoading: true });
    try {
      const fromGps = { lat: fallbackCenter[0], lng: fallbackCenter[1] };
      const toGps = { lat: location.lat, lng: location.lng };
      
      const { snapLeg, haversineDistance } = await import('../../road');
      const snappedPath = await snapLeg(fromGps, toGps);
      
      let totalKm = 0;
      for (let i = 1; i < snappedPath.length; i++) {
        totalKm += haversineDistance(snappedPath[i - 1], snappedPath[i]);
      }
      
      const roundedKm = Math.round(totalKm * 10) / 10;
      
      dispatch({ km: roundedKm });
    } catch (err) {
      console.error('Failed to calculate road distance:', err);
      try {
        const fromGps = { lat: fallbackCenter[0], lng: fallbackCenter[1] };
        const toGps = { lat: location.lat, lng: location.lng };
        const { haversineDistance } = await import('../../road');
        const directDist = Math.round(haversineDistance(fromGps, toGps) * 10) / 10;
        
        dispatch({ km: directDist });
      } catch (innerErr) {
        showToast('Error calculating route distance.');
      }
    } finally {
      dispatch({ gpsLoading: false });
    }
  };

  // Auto-fill distance from route whenever a GPS end pin is set in auto mode
  useEffect(() => {
    if (distanceMode === 'auto' && location?.kind === 'gps' && fallbackCenter && km === null && !gpsLoading) {
      handleAutoFillDistance();
    }
  }, [distanceMode, location, fallbackCenter, km, gpsLoading]);

  // Photo uploads & compression
  const handlePhotoChange = async (e: Event) => {
    const files = (e.target as HTMLInputElement).files as FileList;
    if (!files || files.length === 0) return;

    dispatch({ compressing: true });
    const newBlobs: Blob[] = [];
    const newPreviews: string[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const compressedBlob = await compressImage(files[i]);
        newBlobs.push(compressedBlob);
        newPreviews.push(URL.createObjectURL(compressedBlob));
      } catch (err) {
        console.error('Image compression failed:', err);
        showToast(`Failed to upload ${files[i].name}: images must be valid format.`);
      }
    }

    dispatch({
      photos: [...photosRef.current, ...newBlobs],
      photoPreviews: [...photoPreviewsRef.current, ...newPreviews],
      compressing: false
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemovePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviews[index]);
    dispatch({
      photos: photos.filter((_, i) => i !== index),
      photoPreviews: photoPreviews.filter((_, i) => i !== index)
    });
  };

  const handleStepJump = (targetStep: 1 | 2 | 3) => {
    if (mode === 'new-trip' && !tripTitle.trim() && targetStep > 1) {
      dispatch({ titleError: 'Ride Title is required to start a new ride.' });
      return;
    }
    dispatch({ titleError: '', step: targetStep });
  };

  const handleOpenMapPicker = (target: 'start' | 'location') => {
    if (!navigator.onLine) {
      showToast('You are offline. Please paste coordinates from Google Maps instead.');
      return;
    }
    dispatch({ mapPickerTarget: target, showMapPicker: true });
  };

  const handleConfirmPickerLocation = (lat: number, lng: number) => {
    if (mapPickerTarget === 'start') {
      dispatch({ startLocation: { kind: 'gps', lat, lng, name: '' } });
    } else {
      dispatch({ location: { kind: 'gps', lat, lng, name: '' } });
    }
  };

  const triggerClose = (path: string) => {
    setIsClosing(true);
    setTimeout(() => {
      onNavigate(path);
    }, 100);
  };

  // Compact Save routing delegator
  const handleSave = async (e: Event) => {
    e.preventDefault();

    if (mode === 'new-trip' || mode === 'edit-trip') {
      if (!tripTitle.trim()) {
        dispatch({ titleError: mode === 'edit-trip' ? 'Ride Title is required.' : 'Ride Title is required to start a new ride.' });
        return;
      }
    } else if (step < 3) {
      dispatch({ step: (step + 1) as 1 | 2 | 3 });
      return;
    }

    try {
      const redirectPath = await saveEditorDetails(mode, tripId, pageId, state);
      triggerClose(redirectPath);
    } catch (err) {
      showToast((err as Error).message);
    }
  };

  const handleCancel = () => {
    if (mode === 'edit' && pageId !== null) {
      triggerClose(`#/page/${pageId}`);
    } else if (mode === 'new-leg' || mode === 'edit-trip') {
      triggerClose(`#/trip/${tripId}`);
    } else {
      triggerClose('#/');
    }
  };

  return (
    <div class={`editor-container${isClosing ? ' closing' : ''}`}>
      <PageHeader
        title={
          mode === 'new-trip' ? (tripTitle.trim() || 'New Ride') :
          mode === 'edit-trip' ? 'Edit Ride Details' :
          mode === 'new-leg' ? 'Add New Leg' :
          mode === 'edit' ? 'Edit Leg Details' : ''
        }
        onBack={handleCancel}
        classType="editor"
      />

      {/* Progress Tab Indicator */}
      {mode !== 'new-trip' && mode !== 'edit-trip' && (
        <div class="wizard-progress">
          <span class={`progress-step ${step === 1 ? 'active' : ''}`} onClick={() => handleStepJump(1)}>1. METRICS</span>
          <span class="progress-divider">→</span>
          <span class={`progress-step ${step === 2 ? 'active' : ''}`} onClick={() => handleStepJump(2)}>2. PHOTOS</span>
          <span class="progress-divider">→</span>
          <span class={`progress-step ${step === 3 ? 'active' : ''}`} onClick={() => handleStepJump(3)}>3. STORY</span>
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
              {mode === 'edit-trip' ? 'Save Changes' : 'Next →'}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} class="editor-form">
          {step === 1 && (
            <MetricsStep
              mode={mode}
              tripTitle={tripTitle}
              setTripTitle={(val) => dispatch({ tripTitle: val })}
              date={date}
              setDate={(val) => dispatch({ date: val })}
              time={time}
              setTime={(val) => dispatch({ time: val })}
              km={km}
              setKm={(val) => dispatch({ km: val })}
              odo={odo}
              setOdo={(val) => dispatch({ odo: val })}
              distanceMode={distanceMode}
              setDistanceMode={(val) => dispatch({ distanceMode: val })}
              startOdo={startOdo}
              setStartOdo={(val) => dispatch({ startOdo: val })}
              location={location}
              setLocation={(val) => dispatch({ location: val })}
              gpsLoading={gpsLoading}
              handleDropPin={handleDropPin}
              handleClearLocation={handleClearLocation}
              legTitle={legTitle}
              setLegTitle={(val) => dispatch({ legTitle: val })}
              startLocation={startLocation}
              setStartLocation={(val) => dispatch({ startLocation: val })}
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
            />
          )}

          {step === 2 && (
            <PhotosStep
              photoPreviews={photoPreviews}
              fileInputRef={fileInputRef}
              compressing={compressing}
              handlePhotoChange={handlePhotoChange}
              handleRemovePhoto={handleRemovePhoto}
              handleStepJump={handleStepJump}
            />
          )}

          {step === 3 && (
            <StoryStep
              note={note}
              setNote={(val) => dispatch({ note: val })}
              handleStepJump={handleStepJump}
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

      <div class="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </div>
  );
}
