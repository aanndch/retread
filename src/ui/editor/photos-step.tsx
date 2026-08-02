import type { RefObject } from 'preact';
import type { JSX } from 'preact';
import { Button } from '../../components/button';

interface PhotosStepProps {
  photoPreviews: string[];
  fileInputRef: RefObject<HTMLInputElement>;
  compressing: boolean;
  handlePhotoChange: (e: JSX.TargetedEvent<HTMLInputElement>) => void;
  handleRemovePhoto: (idx: number) => void;
  handleStepJump: (s: 1 | 2 | 3) => void;
}

export function PhotosStep({
  photoPreviews,
  fileInputRef,
  compressing,
  handlePhotoChange,
  handleRemovePhoto,
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
                <button type="button" class="btn-photo-remove" aria-label="Remove photo" onClick={() => handleRemovePhoto(index)}>&times;</button>
              </div>
            ))}
          </div>
        )}
      </div>

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
