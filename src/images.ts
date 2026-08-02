/**
 * Compresses an uploaded image file client-side.
 * Resizes the image to have a maximum edge length of 1600px
 * and exports it as a 80% quality JPEG blob.
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
      const maxEdge = 1600;

      // Calculate new dimensions maintaining aspect ratio
      if (width > maxEdge || height > maxEdge) {
        if (width > height) {
          height = Math.round((height * maxEdge) / width);
          width = maxEdge;
        } else {
          width = Math.round((width * maxEdge) / height);
          height = maxEdge;
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
        0.8 // 80% quality
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };

    img.src = objectUrl;
  });
}
