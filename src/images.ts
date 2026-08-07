import { MAX_IMAGE_EDGE, IMAGE_COMPRESSION_QUALITY } from './constants';

/**
 * Error message used when a HEIC/HEIF file cannot be converted to JPEG.
 * The editor's per-file upload catch surfaces this verbatim for HEIC files
 * while keeping the generic "images must be valid format" toast for others.
 */
export const HEIC_CONVERT_ERROR = "Couldn't convert this HEIC image.";

// ISO BMFF file-type brands that identify a HEIC/HEIF container. These live at
// bytes 4-11 of the header (after the 4-byte box size), e.g. `ftypheic`, so the
// file's own MIME type is a shortcut but the magic bytes are the reliable check.
const HEIC_BRANDS = ['ftypheic', 'ftypheix', 'ftypmif1', 'ftypmsf1'];

/**
 * Detects whether a blob is a HEIC/HEIF image. Prefers the declared MIME type,
 * falling back to the ISO-BMFF `ftyp` brand at bytes 4-11 for files whose type
 * is generic (e.g. `image/heif` or an empty type from some pickers).
 */
async function isHeic(blob: Blob): Promise<boolean> {
  if (blob.type === 'image/heic' || blob.type === 'image/heif') return true;
  try {
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (head.byteLength < 12) return false;
    const brand = new TextDecoder().decode(head.subarray(4, 12));
    return HEIC_BRANDS.some((sig) => brand === sig);
  } catch {
    return false;
  }
}

/**
 * Returns a JPEG blob that the existing decode+resize+encode path can consume.
 * Non-HEIC blobs pass through untouched. HEIC/HEIF blobs are converted to JPEG
 * here, before resize/encode, using `heic2any` (libheif WASM, in-browser,
 * offline). The decoder is lazy-loaded via dynamic `import()` so the main bundle
 * stays lean and the ~2MB decoder chunk downloads only on the first HEIC upload.
 * `heic2any` can return a single Blob or a Blob[] (multiple frames); the first
 * frame is used when an array is returned. Conversion failures throw a clear,
 * HEIC-specific error that the upload loop reports for that one file only.
 */
async function toDecodableBlob(blob: Blob): Promise<Blob> {
  if (!(await isHeic(blob))) return blob;
  try {
    const heic2any = (await import('heic2any')).default;
    const result = await heic2any({
      blob,
      toType: 'image/jpeg',
      quality: IMAGE_COMPRESSION_QUALITY
    });
    return Array.isArray(result) ? result[0] : result;
  } catch {
    throw new Error(HEIC_CONVERT_ERROR);
  }
}

/**
 * Compresses an uploaded image file client-side.
 * Resizes the image to have a maximum edge length of MAX_IMAGE_EDGE
 * and exports it as a IMAGE_COMPRESSION_QUALITY quality JPEG blob.
 *
 * EXIF orientation is applied before encoding so portrait phone photos keep
 * their upright orientation instead of rendering sideways.
 *
 * HEIC/HEIF files are first converted to JPEG (via the lazy-loaded `heic2any`
 * decoder) and the resulting JPEG runs through the same resize/encode path, so
 * iPhone photos respect MAX_IMAGE_EDGE exactly like any other image.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File is not an image');
  }

  const blob = await toDecodableBlob(file);

  return new Promise((resolve, reject) => {
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
      createImageBitmap(blob, { imageOrientation: 'from-image' })
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
      const objectUrl = URL.createObjectURL(blob);

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

export async function createThumbnail(file: Blob): Promise<Blob> {
  const blob = await toDecodableBlob(file);

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
      createImageBitmap(blob, { imageOrientation: 'from-image' })
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
      const objectUrl = URL.createObjectURL(blob);
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
