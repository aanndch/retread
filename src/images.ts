import { MAX_IMAGE_EDGE, IMAGE_COMPRESSION_QUALITY } from './constants';

/**
 * Compresses an uploaded image file client-side.
 * Resizes the image to have a maximum edge length of MAX_IMAGE_EDGE
 * and exports it as a IMAGE_COMPRESSION_QUALITY quality JPEG blob.
 *
 * EXIF orientation is applied before encoding so portrait phone photos keep
 * their upright orientation instead of rendering sideways.
 */
export function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('File is not an image'));
    }

    const drawAndEncode = (source: CanvasImageSource, width: number, height: number) => {
      let w = width;
      let h = height;

      // Calculate new dimensions maintaining aspect ratio
      if (w > MAX_IMAGE_EDGE || h > MAX_IMAGE_EDGE) {
        if (w > h) {
          h = Math.round((h * MAX_IMAGE_EDGE) / w);
          w = MAX_IMAGE_EDGE;
        } else {
          w = Math.round((w * MAX_IMAGE_EDGE) / h);
          h = MAX_IMAGE_EDGE;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Failed to get 2D canvas context'));
      }

      // Draw image onto canvas
      ctx.drawImage(source, 0, 0, w, h);

      // Export as compressed JPEG
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas compression returned null blob'));
          }
        },
        'image/jpeg',
        IMAGE_COMPRESSION_QUALITY
      );
    };

    // Preferred path: createImageBitmap applies EXIF orientation automatically.
    // Falls back to the classic Image path for browsers without it.
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(file, { imageOrientation: 'from-image' })
        .then((bitmap) => {
          drawAndEncode(bitmap, bitmap.width, bitmap.height);
          bitmap.close();
        })
        .catch(() => loadViaImage());
    } else {
      loadViaImage();
    }

    function loadViaImage() {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl); // Clean up memory
        drawAndEncode(img, img.width, img.height);
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };

      img.src = objectUrl;
    }
  });
}

/**
 * Creates a small JPEG thumbnail (max ~THUMB_EDGE) for ride-card covers.
 * Uses the same EXIF-aware decode path as compressImage.
 */
export const THUMB_EDGE = 320;

export function createThumbnail(file: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const drawThumb = (source: CanvasImageSource, width: number, height: number) => {
      let w = width;
      let h = height;
      if (w > THUMB_EDGE || h > THUMB_EDGE) {
        if (w > h) {
          h = Math.round((h * THUMB_EDGE) / w);
          w = THUMB_EDGE;
        } else {
          w = Math.round((w * THUMB_EDGE) / h);
          h = THUMB_EDGE;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Failed to get 2D canvas context'));
      }
      ctx.drawImage(source, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas thumbnail returned null blob'))),
        'image/jpeg',
        0.72
      );
    };

    if (typeof createImageBitmap === 'function') {
      createImageBitmap(file, { imageOrientation: 'from-image' })
        .then((bitmap) => {
          drawThumb(bitmap, bitmap.width, bitmap.height);
          bitmap.close();
        })
        .catch(() => loadViaImage());
    } else {
      loadViaImage();
    }

    function loadViaImage() {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        drawThumb(img, img.width, img.height);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };
      img.src = objectUrl;
    }
  });
}
