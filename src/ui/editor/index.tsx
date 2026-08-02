import { useState, useEffect, useRef } from 'preact/hooks';
import { db } from '../../db';
import { compressImage } from '../../images';
import type { LocationUnion, Page } from '../../types';
import type { JSX } from 'preact';
import { backfillTripRoutes } from '../../road';
import { MetricsStep } from './metrics-step';
import { PhotosStep } from './photos-step';
import { StoryStep } from './story-step';

interface EditorProps {
  onNavigate: (route: string) => void;
}

export function Editor({ onNavigate }: EditorProps) {
  // Parse routing parameters from hash
  const hashParts = window.location.hash.split('?');
  const params = new URLSearchParams(hashParts[1] || '');
  const rawMode = params.get('mode');
  const validModes = ['new-trip', 'new-day', 'edit'] as const;
  type EditorMode = typeof validModes[number];
  const mode: EditorMode | null = validModes.includes(rawMode as EditorMode) ? (rawMode as EditorMode) : null;
  const tripIdParam = params.get('tripId');
  const pageIdParam = params.get('pageId');
  
  const tripId = tripIdParam ? parseInt(tripIdParam, 10) : null;
  const pageId = pageIdParam ? parseInt(pageIdParam, 10) : null;

  // Wizard Step State
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [titleError, setTitleError] = useState('');

  // Form State
  const [tripTitle, setTripTitle] = useState('');
  const [dayTitle, setDayTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [km, setKm] = useState<number | null>(null);
  const [odo, setOdo] = useState<number | null>(null);
  
  // Location State
  const [location, setLocation] = useState<LocationUnion | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showNamedFallback, setShowNamedFallback] = useState(false);
  const [tempPlaceName, setTempPlaceName] = useState('');

  // Start Location State (for new-trip departure pin)
  const [startLocation, setStartLocation] = useState<LocationUnion | null>(null);
  const [startGpsLoading, setStartGpsLoading] = useState(false);
  const [showStartNamedFallback, setShowStartNamedFallback] = useState(false);
  const [tempStartPlaceName, setTempStartPlaceName] = useState('');

  // Auto-capture departure GPS on mount for new trips
  useEffect(() => {
    if (mode === 'new-trip' && navigator.geolocation) {
      setStartGpsLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setStartGpsLoading(false);
          setStartLocation({
            kind: 'gps',
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            name: ''
          });
        },
        () => {
          setStartGpsLoading(false);
          setShowStartNamedFallback(true);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, [mode]);

  // Photos State
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [compressing, setCompressing] = useState(false);
  
  // App Load State
  const [loading, setLoading] = useState(mode === 'edit');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevPreviewsRef = useRef<string[]>([]);

  // Load existing data if in Edit Mode
  useEffect(() => {
    if (mode === 'edit' && pageId !== null) {
      db.pages.get(pageId).then(async (page) => {
        if (page) {
          setDate(page.date);
          setNote(page.note);
          setKm(page.km ?? null);
          setOdo(page.odo ?? null);
          setLocation(page.location ?? null);
          setDayTitle(page.title || '');
          setPhotos(page.photos || []);

          if (page.location) {
            if (page.location.kind === 'named') {
              setShowNamedFallback(true);
              setTempPlaceName(page.location.name);
            } else {
              setTempPlaceName(page.location.name || '');
            }
          }
          
          // Generate previews
          const urls = (page.photos || []).map(blob => URL.createObjectURL(blob));
          setPhotoPreviews(urls);
        }
        setLoading(false);
      }).catch(err => {
        console.error('Failed to load page for edit:', err);
        setLoading(false);
      });
    }
  }, [mode, pageId]);

  const [distanceMode, setDistanceMode] = useState<'both' | 'km' | 'odo'>('both');

  // Load existing pages of this trip to check distance configuration (KM vs ODO)
  useEffect(() => {
    let active = true;

    async function checkTripDistanceMode() {
      let resolvedTripId = tripId;
      if (resolvedTripId === null && pageId !== null) {
        const pageRecord = await db.pages.get(pageId);
        if (pageRecord) {
          resolvedTripId = pageRecord.tripId;
        }
      }

      if (resolvedTripId === null) return;

      const pages = await db.pages.where('tripId').equals(resolvedTripId).toArray();
      // Exclude the current page being edited
      const otherPages = pages.filter(p => p.id !== pageId);
      const hasKm = otherPages.some(p => p.km !== null && p.km !== undefined);
      const hasOdo = otherPages.some(p => p.odo !== null && p.odo !== undefined);

      if (active) {
        if (hasKm) {
          setDistanceMode('km');
        } else if (hasOdo) {
          setDistanceMode('odo');
        } else {
          setDistanceMode('both');
        }
      }
    }

    checkTripDistanceMode();
    return () => {
      active = false;
    };
  }, [tripId, pageId]);

  // Clean up object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      prevPreviewsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // Geolocation Handler
  const handleDropPin = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your device.');
      setShowNamedFallback(true);
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLoading(false);
        setLocation({
          kind: 'gps',
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          name: ''
        });
        setTempPlaceName('');
        setShowNamedFallback(false);
      },
      (error) => {
        console.warn('Geolocation failed:', error);
        setGpsLoading(false);
        setShowNamedFallback(true);
        setLocation(null);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handlePlaceNameChange = (name: string) => {
    setTempPlaceName(name);
    if (location && location.kind === 'gps') {
      setLocation({ ...location, name });
    } else {
      setLocation({ kind: 'named', name });
    }
  };

  const handleClearLocation = () => {
    setLocation(null);
    setTempPlaceName('');
    setShowNamedFallback(false);
  };

  // Photo uploads & compression
  const handlePhotoChange = async (e: JSX.TargetedEvent<HTMLInputElement>) => {
    const files = (e.target as HTMLInputElement).files as FileList;
    if (!files || files.length === 0) return;

    setCompressing(true);
    const newBlobs: Blob[] = [...photos];
    const newPreviews: string[] = [...photoPreviews];

    for (let i = 0; i < files.length; i++) {
      try {
        const compressedBlob = await compressImage(files[i]);
        newBlobs.push(compressedBlob);
        newPreviews.push(URL.createObjectURL(compressedBlob));
      } catch (err) {
        console.error('Image compression failed:', err);
        alert(`Failed to upload ${files[i].name}: images must be valid format.`);
      }
    }

    setPhotos(newBlobs);
    prevPreviewsRef.current = [...photoPreviews];
    setPhotoPreviews(newPreviews);
    setCompressing(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviews[index]);

    const newPhotos = photos.filter((_, i) => i !== index);
    const newPreviews = photoPreviews.filter((_, i) => i !== index);
    
    setPhotos(newPhotos);
    setPhotoPreviews(newPreviews);
  };

  const handleStepJump = (targetStep: 1 | 2 | 3) => {
    if (mode === 'new-trip' && !tripTitle.trim() && targetStep > 1) {
      setTitleError('Ride Title is required to start a new ride.');
      return;
    }
    setTitleError('');
    setStep(targetStep);
  };

  // Save Routine
  const handleSave = async (e: Event) => {
    e.preventDefault();

    if (step < 3) {
      if (mode === 'new-trip' && !tripTitle.trim()) {
        setTitleError('Ride Title is required to start a new ride.');
        setStep(1);
        return;
      }
      setStep((step + 1) as 1 | 2 | 3);
      return;
    }

    if (mode === 'new-trip' && !tripTitle.trim()) {
      setTitleError('Ride Title is required to start a new ride.');
      setStep(1);
      return;
    }

    try {
      let activeTripId = tripId;

      if (mode === 'new-trip') {
        const finalTitle = tripTitle.trim() || `Ride on ${date}`;

        // Build startLocation payload
        let startLocPayload: LocationUnion | null = null;
        if (startLocation) {
          if (startLocation.kind === 'named' && !startLocation.name.trim()) {
            startLocPayload = null;
          } else {
            startLocPayload = startLocation;
          }
        }

        activeTripId = await db.trips.add({
          title: finalTitle,
          createdAt: new Date().toISOString(),
          startLocation: startLocPayload
        }) as number;
      }

      if (activeTripId === null && mode !== 'edit') {
        throw new Error('Trip ID context is missing.');
      }

      const locationPayload = (location && (location.kind === 'named' ? location.name.trim() !== '' : true))
        ? location
        : null;

      const pageData: Partial<Page> = {
        date,
        note: note.trim(),
        photos,
        km: km !== null && !isNaN(km) ? km : null,
        odo: odo !== null && !isNaN(odo) ? odo : null,
        location: locationPayload,
        title: dayTitle.trim()
      };

      if (mode === 'edit' && pageId !== null) {
        const existingPage = await db.pages.get(pageId);
        if (!existingPage) throw new Error('Page to update was not found.');
        
        await db.pages.update(pageId, pageData);
        backfillTripRoutes(existingPage.tripId).catch(err => console.warn('Background backfill failed:', err));
        onNavigate(`#/trip/${existingPage.tripId}`);
      } else {
        await db.pages.add({
          tripId: activeTripId!,
          ...pageData
        } as Page);
        backfillTripRoutes(activeTripId!).catch(err => console.warn('Background backfill failed:', err));
        onNavigate(`#/trip/${activeTripId}`);
      }
    } catch (err) {
      console.error('Failed to save log details:', err);
      alert('Error saving details to database.');
    }
  };

  const handleCancel = () => {
    if (mode === 'edit' && pageId !== null) {
      db.pages.get(pageId).then(page => {
        if (page) onNavigate(`#/trip/${page.tripId}`);
        else onNavigate('#/');
      });
    } else if (tripId) {
      onNavigate(`#/trip/${tripId}`);
    } else {
      onNavigate('#/');
    }
  };

  let effectiveDistanceMode = distanceMode;
  if (effectiveDistanceMode === 'both') {
    if (km !== null && km !== undefined) {
      effectiveDistanceMode = 'km';
    } else if (odo !== null && odo !== undefined) {
      effectiveDistanceMode = 'odo';
    }
  }

  if (loading) {
    return <p class="loading-text">Loading log details...</p>;
  }

  if (!mode) {
    return <p class="loading-text">Invalid editor mode.</p>;
  }

  return (
    <div class="editor-container">
      <header class="editor-header">
        <h3>
          {mode === 'new-trip' && (tripTitle.trim() || 'New Ride')}
          {mode === 'new-day' && 'Add New Day'}
          {mode === 'edit' && 'Edit Day Details'}
        </h3>
      </header>

      {/* Progress Tab Indicator */}
      <div class="wizard-progress">
        <span class={`progress-step ${step === 1 ? 'active' : ''}`} onClick={() => handleStepJump(1)}>1. METRICS</span>
        <span class="progress-divider">→</span>
        <span class={`progress-step ${step === 2 ? 'active' : ''}`} onClick={() => handleStepJump(2)}>2. PHOTOS</span>
        <span class="progress-divider">→</span>
        <span class={`progress-step ${step === 3 ? 'active' : ''}`} onClick={() => handleStepJump(3)}>3. STORY</span>
      </div>

      <form onSubmit={handleSave} class="editor-form">
        {step === 1 && (
          <MetricsStep
            mode={mode}
            tripTitle={tripTitle}
            setTripTitle={setTripTitle}
            date={date}
            setDate={setDate}
            km={km}
            setKm={setKm}
            odo={odo}
            setOdo={setOdo}
            distanceMode={effectiveDistanceMode}
            location={location}
            gpsLoading={gpsLoading}
            handleDropPin={handleDropPin}
            showNamedFallback={showNamedFallback}
            tempPlaceName={tempPlaceName}
            handlePlaceNameChange={handlePlaceNameChange}
            handleClearLocation={handleClearLocation}
            dayTitle={dayTitle}
            setDayTitle={setDayTitle}
            startLocation={startLocation}
            startGpsLoading={startGpsLoading}
            showStartNamedFallback={showStartNamedFallback}
            tempStartPlaceName={tempStartPlaceName}
            onStartPlaceNameChange={(name: string) => {
              setTempStartPlaceName(name);
              setStartLocation({ kind: 'named', name });
            }}
            onClearStartLocation={() => {
              setStartLocation(null);
              setShowStartNamedFallback(false);
              setTempStartPlaceName('');
            }}
            onRetryStartGps={() => {
              if (!navigator.geolocation) {
                setShowStartNamedFallback(true);
                return;
              }
              setStartGpsLoading(true);
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  setStartGpsLoading(false);
                  setShowStartNamedFallback(false);
                  setStartLocation({
                    kind: 'gps',
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    name: ''
                  });
                },
                () => {
                  setStartGpsLoading(false);
                  setShowStartNamedFallback(true);
                },
                { enableHighAccuracy: true, timeout: 10000 }
              );
            }}
            titleError={titleError}
            setTitleError={setTitleError}
            handleCancel={handleCancel}
            handleStepJump={handleStepJump}
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
            setNote={setNote}
            handleStepJump={handleStepJump}
          />
        )}
      </form>
    </div>
  );
}
