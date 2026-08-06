import type { RefObject } from 'preact';
import type { JSX } from 'preact';
import { FieldCard } from '../../components/field-card';
import { PhotoArrangeSheet } from '../../components/photo-arrange-sheet';
import { StepActions } from './fields';

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
  step: 1 | 2 | 3 | 4;
  handleStepJump: (s: 1 | 2 | 3 | 4) => void;
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
  step,
  handleStepJump
}: PhotosStepProps) {
  return (
    <div class="wizard-step-content">
      <FieldCard label={`Photos${photoPreviews.length > 0 ? ` · ${photoPreviews.length}` : ''}`}>
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
      </FieldCard>

      <PhotoArrangeSheet
        isOpen={showArrange}
        photoUrls={photoPreviews}
        onSave={handleArrangeSave}
        onClose={() => setShowArrange(false)}
      />

      <StepActions
        onBack={() => handleStepJump((step - 1) as 1 | 2 | 3 | 4)}
        backDisabled={compressing}
        onNext={() => handleStepJump((step + 1) as 1 | 2 | 3 | 4)}
        nextLabel="Next: Story →"
        nextDisabled={compressing}
      />
    </div>
  );
}
