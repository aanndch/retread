import { MAX_IMAGE_EDGE, IMAGE_COMPRESSION_QUALITY } from './constants';

/**
 * Compresses an uploaded image file client-side.
 * Resizes the image to have a maximum edge length of MAX_IMAGE_EDGE
 * and exports it as a IMAGE_COMPRESSION_QUALITY quality JPEG blob.
 */
export function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Check if the file is an image
    if (!file.type.startsWith('image/')) {
      return reject(new Error('File is not an image'));
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl); // Clean up memory

      let width = img.width;
      let height = img.height;

      // Calculate new dimensions maintaining aspect ratio
      if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) {
        if (width > height) {
          height = Math.round((height * MAX_IMAGE_EDGE) / width);
          width = MAX_IMAGE_EDGE;
        } else {
          width = Math.round((width * MAX_IMAGE_EDGE) / height);
          height = MAX_IMAGE_EDGE;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Failed to get 2D canvas context'));
      }

      // Draw image onto canvas
      ctx.drawImage(img, 0, 0, width, height);

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

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };

    img.src = objectUrl;
  });
}
