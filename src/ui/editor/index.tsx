import { useState, useEffect, useRef } from 'preact/hooks';
import { db } from '../../db';
import { compressImage } from '../../images';
import { Toast, useToast } from '../../components/toast';
import type { LocationUnion, Page } from '../../types';
import type { JSX } from 'preact';
import { backfillTripRoutes } from '../../road';
import { MetricsStep } from './metrics-step';
import { PhotosStep } from './photos-step';
import { StoryStep } from './story-step';
import { Button } from '../../components/button';

export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  // 1. Match standard coordinates: e.g. "31.2245, 77.3456"
  const coordRegex = /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/;
  const match = text.match(coordRegex);
  if (match) {
    return {
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2])
    };
  }

  // 2. Match Google Maps URL coordinates: e.g. "@31.2245,77.3456"
  const urlRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
  const urlMatch = text.match(urlRegex);
  if (urlMatch) {
    return {
      lat: parseFloat(urlMatch[1]),
      lng: parseFloat(urlMatch[2])
    };
  }

  return null;
}

const loadLeaflet = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).L) {
      resolve();
      return;
    }

    // Load Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Load Leaflet JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.appendChild(script);
  });
};

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
  const [distanceMode, setDistanceMode] = useState<'km' | 'odo'>('km');
  const [startOdo, setStartOdo] = useState<number | null>(null);
  
  // Location State
  const [location, setLocation] = useState<LocationUnion | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [startLocation, setStartLocation] = useState<LocationUnion | null>(null);
  const [startGpsLoading, setStartGpsLoading] = useState(false);
  const { toasts, showToast, removeToast } = useToast();

  // Map Picker Modal State
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapPickerTarget, setMapPickerTarget] = useState<'start' | 'dest'>('dest');
  const pickerMapRef = useRef<any>(null);
  const [fallbackCenter, setFallbackCenter] = useState<[number, number] | null>(null);

  // Pre-load fallback center from previous leg or start location
  useEffect(() => {
    let active = true;

    async function loadFallbackCenter() {
      let resolvedTripId = tripId;
      if (resolvedTripId === null && pageId !== null) {
        const pageRecord = await db.pages.get(pageId);
        if (pageRecord) {
          resolvedTripId = pageRecord.tripId;
        }
      }

      if (resolvedTripId === null) return;

      try {
        const tripRecord = await db.trips.get(resolvedTripId);
        const pages = await db.pages.where('tripId').equals(resolvedTripId).toArray();
        const sorted = [...pages].sort((a, b) => a.date.localeCompare(b.date) || (a.id || 0) - (b.id || 0));

        let foundCenter: [number, number] | null = null;

        if (mode === 'new-day') {
          if (sorted.length > 0) {
            const lastPage = sorted[sorted.length - 1];
            if (lastPage.location?.kind === 'gps') {
              foundCenter = [lastPage.location.lat, lastPage.location.lng];
            }
          }
          if (!foundCenter && tripRecord?.startLocation?.kind === 'gps') {
            foundCenter = [tripRecord.startLocation.lat, tripRecord.startLocation.lng];
          }
        } else if (mode === 'edit' && pageId !== null) {
          const myIdx = sorted.findIndex(p => p.id === pageId);
          if (myIdx > 0) {
            const prevPage = sorted[myIdx - 1];
            if (prevPage.location?.kind === 'gps') {
              foundCenter = [prevPage.location.lat, prevPage.location.lng];
            }
          }
          if (!foundCenter && tripRecord?.startLocation?.kind === 'gps') {
            foundCenter = [tripRecord.startLocation.lat, tripRecord.startLocation.lng];
          }
        }

        if (active && foundCenter) {
          setFallbackCenter(foundCenter);
        }
      } catch (err) {
        console.warn('Failed to load fallback map center:', err);
      }
    }

    loadFallbackCenter();
    return () => {
      active = false;
    };
  }, [tripId, pageId, mode]);

  const handleOpenMapPicker = async (target: 'start' | 'dest') => {
    if (!navigator.onLine) {
      showToast('You are offline. Please paste coordinates from Google Maps instead.');
      return;
    }
    try {
      await loadLeaflet();
      setMapPickerTarget(target);
      setShowMapPicker(true);
    } catch (err) {
      console.warn('Failed to load Leaflet library:', err);
      showToast('Failed to load map picker.');
      setShowMapPicker(false);
    }
  };

  const initializeMap = (el: HTMLDivElement | null) => {
    if (!el) return;
    if (!(window as any).L) return;
    const L = (window as any).L;

    let initialCenter: [number, number] = [31.1048, 77.1734];
    if (mapPickerTarget === 'start') {
      if (startLocation?.kind === 'gps') {
        initialCenter = [startLocation.lat, startLocation.lng];
      }
    } else {
      if (location?.kind === 'gps') {
        initialCenter = [location.lat, location.lng];
      } else if (fallbackCenter) {
        initialCenter = fallbackCenter;
      }
    }

    try {
      if (pickerMapRef.current) {
        pickerMapRef.current.remove();
      }
    } catch (err) {
      console.warn('Failed to remove existing map instance:', err);
    }

    const map = L.map(el, {
      zoomControl: true
    }).setView(initialCenter, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    pickerMapRef.current = map;
  };

  useEffect(() => {
    if (!showMapPicker && pickerMapRef.current) {
      try {
        pickerMapRef.current.remove();
      } catch (err) {
        console.warn('Failed to clean up map instance:', err);
      }
      pickerMapRef.current = null;
    }
  }, [showMapPicker]);

  const handleConfirmPickerLocation = (e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    try {
      if (!pickerMapRef.current) {
        console.warn('Map reference is not initialized');
        return;
      }
      
      const center = pickerMapRef.current.getCenter();
      if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') {
        throw new Error('Invalid center coordinates from Map Picker');
      }

      if (mapPickerTarget === 'start') {
        setStartLocation({
          kind: 'gps',
          lat: center.lat,
          lng: center.lng,
          name: ''
        });
      } else {
        setLocation({
          kind: 'gps',
          lat: center.lat,
          lng: center.lng,
          name: ''
        });
      }
    } catch (err) {
      console.error('Failed to confirm map picker pin:', err);
      showToast('Error setting coordinates from map.');
    } finally {
      setShowMapPicker(false);
    }
  };

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

  // Load distance configuration and starting odometer directly from the Trip record
  useEffect(() => {
    let active = true;

    async function loadTripConfig() {
      let resolvedTripId = tripId;
      if (resolvedTripId === null && pageId !== null) {
        const pageRecord = await db.pages.get(pageId);
        if (pageRecord) {
          resolvedTripId = pageRecord.tripId;
        }
      }

      if (resolvedTripId === null) return;

      try {
        const tripRecord = await db.trips.get(resolvedTripId);
        if (active && tripRecord) {
          if (tripRecord.distanceMode) {
            setDistanceMode(tripRecord.distanceMode);
          }
          if (tripRecord.startOdo !== undefined) {
            setStartOdo(tripRecord.startOdo);
          }
        }
      } catch (err) {
        console.warn('Failed to load trip distance mode config:', err);
      }
    }

    loadTripConfig();
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
      showToast('Geolocation is not supported by your device.');
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
      },
      (error) => {
        console.warn('Geolocation failed:', error);
        setGpsLoading(false);
        setLocation(null);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleClearLocation = () => {
    setLocation(null);
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
        showToast(`Failed to upload ${files[i].name}: images must be valid format.`);
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

    if (mode === 'new-trip') {
      if (!tripTitle.trim()) {
        setTitleError('Ride Title is required to start a new ride.');
        return;
      }

      try {
        const finalTitle = tripTitle.trim();

        // Build startLocation payload
        let startLocPayload: LocationUnion | null = null;
        if (startLocation) {
          if (startLocation.kind === 'named' && !startLocation.name.trim()) {
            startLocPayload = null;
          } else {
            startLocPayload = startLocation;
          }
        }

        const newTripId = await db.trips.add({
          title: finalTitle,
          createdAt: new Date().toISOString(),
          startLocation: startLocPayload,
          distanceMode,
          startOdo: distanceMode === 'odo' ? (startOdo !== null && !isNaN(startOdo) ? startOdo : 0) : null
        }) as number;

        onNavigate(`#/trip/${newTripId}`);
      } catch (err) {
        console.error('Failed to create trip:', err);
        showToast('Error saving details to database.');
      }
      return;
    }

    if (step < 3) {
      setStep((step + 1) as 1 | 2 | 3);
      return;
    }

    try {
      let activeTripId = tripId;

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
      showToast('Error saving details to database.');
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
      {mode !== 'new-trip' && (
        <div class="wizard-progress">
          <span class={`progress-step ${step === 1 ? 'active' : ''}`} onClick={() => handleStepJump(1)}>1. METRICS</span>
          <span class="progress-divider">→</span>
          <span class={`progress-step ${step === 2 ? 'active' : ''}`} onClick={() => handleStepJump(2)}>2. PHOTOS</span>
          <span class="progress-divider">→</span>
          <span class={`progress-step ${step === 3 ? 'active' : ''}`} onClick={() => handleStepJump(3)}>3. STORY</span>
        </div>
      )}

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
            distanceMode={distanceMode}
            setDistanceMode={setDistanceMode}
            startOdo={startOdo}
            setStartOdo={setStartOdo}
            location={location}
            gpsLoading={gpsLoading}
            handleDropPin={handleDropPin}
            handleClearLocation={handleClearLocation}
            dayTitle={dayTitle}
            setDayTitle={setDayTitle}
            startLocation={startLocation}
            startGpsLoading={startGpsLoading}
            onClearStartLocation={() => {
              setStartLocation(null);
            }}
            onRetryStartGps={() => {
              if (!navigator.geolocation) {
                showToast('Geolocation is not supported by your device.');
                return;
              }
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
                  showToast('GPS auto-detect failed.');
                },
                { enableHighAccuracy: true, timeout: 10000 }
              );
            }}
            titleError={titleError}
            setTitleError={setTitleError}
            handleCancel={handleCancel}
            handleStepJump={handleStepJump}
            onOpenMapPicker={handleOpenMapPicker}
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

      {/* Map Picker Modal Backdrop & Overlay */}
      {showMapPicker && (
        <div class="modal-backdrop" style={{ zIndex: 3000 }} onClick={() => setShowMapPicker(false)}>
          <div class="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: 0, overflow: 'hidden', width: '100%', maxWidth: '480px' }}>
            <div class="map-picker-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid var(--color-ink-muted)' }}>
              <h4 style={{ margin: 0 }}>Pick Location</h4>
              <button 
                type="button" 
                class="btn-clear" 
                onClick={() => setShowMapPicker(false)} 
                style={{ fontSize: '20px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--color-ink)' }}
              >
                &times;
              </button>
            </div>
            
            <div style={{ position: 'relative', width: '100%', height: '350px' }}>
              <div 
                ref={initializeMap} 
                id="picker-map-el" 
                style={{ width: '100%', height: '100%', background: 'var(--color-paper-dim)' }}
              ></div>
              
              {/* Crosshair indicator in center */}
              <div 
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 2000,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="15" cy="15" r="4" stroke="var(--color-green)" stroke-width="2" fill="var(--color-paper)" />
                  <line x1="15" y1="0" x2="15" y2="10" stroke="var(--color-green)" stroke-width="2" />
                  <line x1="15" y1="20" x2="15" y2="30" stroke="var(--color-green)" stroke-width="2" />
                  <line x1="0" y1="15" x2="10" y2="15" stroke="var(--color-green)" stroke-width="2" />
                  <line x1="20" y1="15" x2="30" y2="15" stroke="var(--color-green)" stroke-width="2" />
                </svg>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', padding: '16px', background: 'var(--color-paper-dim)', borderTop: '1px solid var(--color-ink-muted)' }}>
              <Button 
                variant="secondary" 
                style={{ flex: 1 }} 
                onClick={() => setShowMapPicker(false)}
              >
                Cancel
              </Button>
              <Button 
                variant="primary" 
                style={{ flex: 1 }} 
                onClick={handleConfirmPickerLocation}
              >
                Confirm Pin
              </Button>
            </div>
          </div>
        </div>
      )}

      <div class="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </div>
  );
}
