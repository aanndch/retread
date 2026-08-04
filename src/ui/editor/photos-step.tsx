import type { RefObject } from 'preact';
import type { JSX } from 'preact';
import { Button } from '../../components/button';
import { PhotoArrangeSheet } from '../../components/photo-arrange-sheet';

interface PhotosStepProps {
  photoPreviews: string[];
  fileInputRef: RefObject<HTMLInputElement>;
  compressing: boolean;
  handlePhotoChange: (e: JSX.TargetedEvent<HTMLInputElement>) => void;
  handleRemovePhoto: (idx: number) => void;
  handleSetCover: (idx: number) => void;
  coverPhotoIndex: number | null;
  showArrange: boolean;
  setShowArrange: (open: boolean) => void;
  handleArrangeSave: (order: number[]) => void;
  handleStepJump: (s: 1 | 2 | 3) => void;
}

export function PhotosStep({
  photoPreviews,
  fileInputRef,
  compressing,
  handlePhotoChange,
  handleRemovePhoto,
  handleSetCover,
  coverPhotoIndex,
  showArrange,
  setShowArrange,
  handleArrangeSave,
  handleStepJump
}: PhotosStepProps) {
  return (
    <div class="wizard-step-content">
      <div class="form-group">
        <label class="input-label">Media Uploads</label>
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
                <button
                  type="button"
                  class={`btn-cover${coverPhotoIndex === index ? ' active' : ''}`}
                  aria-label={coverPhotoIndex === index ? 'Remove as ride cover' : 'Set as ride cover'}
                  title={coverPhotoIndex === index ? 'Ride cover' : 'Set as ride cover'}
                  onClick={() => handleSetCover(index)}
                >
                  {coverPhotoIndex === index ? '★' : '☆'}
                </button>
                <button type="button" class="btn-photo-remove" aria-label="Remove photo" onClick={() => handleRemovePhoto(index)}>&times;</button>
              </div>
            ))}
          </div>
        )}
        {photoPreviews.length > 1 && (
          <div class="photo-arrange-row">
            <button type="button" class="btn-arrange" onClick={() => setShowArrange(true)}>
              Arrange Photos
            </button>
            <span class="field-tip">Tap ☆ on a photo to make it this ride's cover.</span>
          </div>
        )}
      </div>

      <PhotoArrangeSheet
        isOpen={showArrange}
        photoUrls={photoPreviews}
        onSave={handleArrangeSave}
        onClose={() => setShowArrange(false)}
      />

      {/* Step 2 Actions */}
      <div class="form-actions">
        <Button variant="secondary" onClick={() => handleStepJump(1)} disabled={compressing}>
          ← Back
        </Button>
        <Button variant="primary" onClick={() => handleStepJump(3)} disabled={compressing}>
          Next: Story →
        </Button>
      </div>
    </div>
  );
}
