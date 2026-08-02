import { useState, useEffect, useRef } from 'preact/hooks';
import { db } from '../db';
import { compressImage } from '../images';
import type { LocationUnion, Page } from '../types';

interface EditorProps {
  onNavigate: (route: string) => void;
}

export function Editor({ onNavigate }: EditorProps) {
  // Parse routing parameters from hash
  const hashParts = window.location.hash.split('?');
  const params = new URLSearchParams(hashParts[1] || '');
  const mode = params.get('mode') as 'new-trip' | 'new-day' | 'edit';
  const tripIdParam = params.get('tripId');
  const pageIdParam = params.get('pageId');
  
  const tripId = tripIdParam ? parseInt(tripIdParam, 10) : null;
  const pageId = pageIdParam ? parseInt(pageIdParam, 10) : null;

  // Form State
  const [tripTitle, setTripTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [km, setKm] = useState<number | null>(null);
  const [odo, setOdo] = useState<number | null>(null);
  
  // Location State
  const [location, setLocation] = useState<LocationUnion | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showNamedFallback, setShowNamedFallback] = useState(false);
  const [tempPlaceName, setTempPlaceName] = useState('');

  // Photos State
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [compressing, setCompressing] = useState(false);
  
  // App Load State
  const [loading, setLoading] = useState(mode === 'edit');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Clean up object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      photoPreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [photoPreviews]);

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
  const handlePhotoChange = async (e: any) => {
    const files = e.target.files as FileList;
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
    setPhotoPreviews(newPreviews);
    setCompressing(false);

    // Reset file input value to allow uploading same file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (index: number) => {
    // Revoke the specific URL being removed
    URL.revokeObjectURL(photoPreviews[index]);

    const newPhotos = photos.filter((_, i) => i !== index);
    const newPreviews = photoPreviews.filter((_, i) => i !== index);
    
    setPhotos(newPhotos);
    setPhotoPreviews(newPreviews);
  };

  // Save Routine
  const handleSave = async (e: Event) => {
    e.preventDefault();

    try {
      let activeTripId = tripId;

      if (mode === 'new-trip') {
        // 1. Create the trip
        const finalTitle = tripTitle.trim() || `Ride on ${date}`;
        activeTripId = await db.trips.add({
          title: finalTitle,
          createdAt: new Date().toISOString()
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
        location: locationPayload
      };

      if (mode === 'edit' && pageId !== null) {
        // Update existing page
        const existingPage = await db.pages.get(pageId);
        if (!existingPage) throw new Error('Page to update was not found.');
        
        await db.pages.update(pageId, pageData);
        onNavigate(`#/trip/${existingPage.tripId}`);
      } else {
        // Insert new page
        await db.pages.add({
          tripId: activeTripId!,
          ...pageData
        } as Page);
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

  if (loading) {
    return <p class="loading-text">Loading log details...</p>;
  }

  return (
    <div class="editor-container">
      <header class="editor-header">
        <h3>
          {mode === 'new-trip' && 'New Ride'}
          {mode === 'new-day' && 'Add New Day'}
          {mode === 'edit' && 'Edit Day Details'}
        </h3>
      </header>

      <form onSubmit={handleSave} class="editor-form">
        {/* Trip Title (New Trip Only) */}
        {mode === 'new-trip' && (
          <div class="form-group">
            <label class="input-label">Ride Title</label>
            <input 
              type="text" 
              class="form-input" 
              placeholder="e.g. Spiti Valley Odyssey" 
              value={tripTitle}
              onInput={(e: any) => setTripTitle(e.target.value)}
            />
          </div>
        )}

        {/* Date Selector */}
        <div class="form-group">
          <label class="input-label">Date</label>
          <input 
            type="date" 
            class="form-input" 
            required 
            value={date} 
            onChange={(e: any) => setDate(e.target.value)}
          />
        </div>

        {/* Distance Metrics: KM / Odo */}
        <div class="form-row">
          <div class="form-group flex-1">
            <label class="input-label">Daily Distance (KM)</label>
            <input 
              type="number" 
              class="form-input" 
              placeholder="e.g. 120"
              value={km === null ? '' : km}
              onInput={(e: any) => setKm(e.target.value ? parseFloat(e.target.value) : null)}
            />
          </div>
          <div class="form-group flex-1">
            <label class="input-label">Odometer</label>
            <input 
              type="number" 
              class="form-input" 
              placeholder="e.g. 14320"
              value={odo === null ? '' : odo}
              onInput={(e: any) => setOdo(e.target.value ? parseFloat(e.target.value) : null)}
            />
          </div>
        </div>
        <span class="field-tip">Pick one per ride — km for daily distance, odo for odometer.</span>

        {/* Geolocation Section */}
        <div class="form-group-inline">
          <label class="input-label" style={{ marginBottom: 0 }}>Location Pin</label>
          
          {!location && !showNamedFallback ? (
            <button 
              type="button" 
              class="btn btn-secondary btn-sm btn-icon-text"
              onClick={handleDropPin}
              disabled={gpsLoading}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="location-pin-icon">
                <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span>{gpsLoading ? 'Locating...' : 'Drop Pin'}</span>
            </button>
          ) : (
            <div class="location-status">
              {location?.kind === 'gps' && (
                <div class="location-coord">
                  <span class="geo-badge">GPS</span>
                  <span>[{location.lat.toFixed(4)}, {location.lng.toFixed(4)}]</span>
                </div>
              )}
              
              <div class="location-input-row">
                <input 
                  type="text" 
                  class="form-input form-input-sm" 
                  placeholder="Place name (e.g. Rohtang Pass)"
                  value={tempPlaceName}
                  onInput={(e: any) => handlePlaceNameChange(e.target.value)}
                />
                <button type="button" class="btn-clear" onClick={handleClearLocation}>&times;</button>
              </div>
            </div>
          )}
        </div>

        {/* Photo Upload Section */}
        <div class="form-group">
          <label class="input-label">Photos</label>
          <div class="photo-uploader">
            <input 
              type="file" 
              ref={fileInputRef}
              multiple 
              accept="image/*" 
              onChange={handlePhotoChange}
              id="file-upload" 
              class="file-hidden-input"
            />
            <label for="file-upload" class="photo-upload-trigger">
              {compressing ? 'Compressing photos...' : '＋ Add Photos'}
            </label>
          </div>
          
          {photoPreviews.length > 0 && (
            <div class="photo-previews-grid">
              {photoPreviews.map((url, index) => (
                <div key={index} class="photo-preview-item">
                  <img src={url} alt="Upload preview" class="photo-preview-img" />
                  <button type="button" class="btn-photo-remove" onClick={() => handleRemovePhoto(index)}>&times;</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Note Textarea */}
        <div class="form-group">
          <label class="input-label">Ride Note</label>
          <textarea 
            class="form-textarea" 
            placeholder="Write a whisper about this ride... (roads, weather, vibes)"
            value={note}
            onInput={(e: any) => setNote(e.target.value)}
          ></textarea>
        </div>

        {/* Form Action Controls */}
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onClick={handleCancel} disabled={compressing}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={compressing}>
            Save Details
          </button>
        </div>
      </form>
    </div>
  );
}
