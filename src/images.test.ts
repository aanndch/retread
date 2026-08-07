import { describe, it, expect } from 'vitest';
import piexif from 'piexifjs';
import { groupPhotos, readPhotoMetadata } from './images';

/**
 * A minimal valid 1x1 JPEG (SOI..EOI, no existing EXIF). `piexifjs` wraps an
 * APP1/EXIF segment into this before the start-of-scan, giving us a real JPEG
 * whose EXIF we control — the genuine exifr read path in `readPhotoMetadata`.
 */
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AZ//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AZ//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z';

const toBinStr = (u8: Uint8Array): string => {
  // Uint8Array → binary string, the byte-string format piexifjs reads/writes.
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return s;
};
const toBytes = (bin: string): Uint8Array<ArrayBuffer> => {
  // Uint8Array → binary string, the byte-string format piexifjs reads/writes.
  // Constructed on a fresh ArrayBuffer so the result is a plain (non-shared)
  // buffer that satisfies BlobPart when wrapped in a File.
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** The bare 1x1 JPEG (no EXIF) as an ArrayBuffer-backed byte array. */
function plainJpegBytes(): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(TINY_JPEG_B64, 'base64');
  const out = new Uint8Array(buf.length);
  out.set(buf);
  return out;
}

/**
 * Builds a real JPEG (with EXIF) whose DateTimeOriginal and GPS lat/lng are the
 * known values passed in. The returned bytes can be handed to a `File`.
 */
function jpegWithExif(opts: {
  date: string; // EXIF DateTimeOriginal, e.g. "2026:08:10 09:00:00"
  lat: number;
  lng: number;
}): Uint8Array<ArrayBuffer> {
  const jpegBin = toBinStr(plainJpegBytes());
  const exifStr = piexif.dump({
    '0th': {},
    Exif: { 36867: opts.date }, // 36867 = DateTimeOriginal
    GPS: {
      1: opts.lat >= 0 ? 'N' : 'S', // GPSLatitudeRef
      2: piexif.GPSHelper.degToDmsRational(Math.abs(opts.lat)), // GPSLatitude
      3: opts.lng >= 0 ? 'E' : 'W', // GPSLongitudeRef
      4: piexif.GPSHelper.degToDmsRational(Math.abs(opts.lng)), // GPSLongitude
    },
    Interop: {},
    '1st': {},
  });
  return toBytes(piexif.insert(exifStr, jpegBin));
}

function toFile(bytes: Uint8Array<ArrayBuffer>, name: string, type: string, lastModified = 1): File {
  return new File([bytes], name, { type, lastModified });
}

describe('readPhotoMetadata — EXIF extraction (real exifr path)', () => {
  it('reads DateTimeOriginal date + GPS lat/lng from a JPEG with EXIF', async () => {
    const bytes = jpegWithExif({ date: '2026:08:10 09:00:00', lat: 12.5, lng: -77.25 });
    const file = toFile(bytes, 'camp.jpg', 'image/jpeg');

    const meta = await readPhotoMetadata(file);

    expect(meta.date).not.toBeNull();
    // exifr parses the EXIF wall-clock as local time → local calendar components.
    expect(meta.date!.getFullYear()).toBe(2026);
    expect(meta.date!.getMonth()).toBe(7); // August
    expect(meta.date!.getDate()).toBe(10);
    expect(meta.date!.getHours()).toBe(9);
    expect(meta.date!.getMinutes()).toBe(0);

    // GPS comes straight out of the EXIF GPS IFD (TZ-independent, exact match).
    expect(meta.lat).toBeCloseTo(12.5, 5);
    expect(meta.lng).toBeCloseTo(-77.25, 5);
  });

  it('graceful fallback: no readable EXIF → date from file.lastModified, GPS null', async () => {
    // Arbitrary non-JPEG bytes typed as an image: exifr finds no EXIF, so the
    // reader must not throw and must fall back to file.lastModified.
    const junk = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x12, 0x34, 0x56]);
    const lastModified = new Date(2026, 7, 10, 9, 30, 15).getTime();
    const file = toFile(junk, 'bogus.jpg', 'image/jpeg', lastModified);

    const meta = await readPhotoMetadata(file);

    expect(meta.lat).toBeNull();
    expect(meta.lng).toBeNull();
    expect(meta.date).not.toBeNull();
    expect(meta.date!.getTime()).toBe(lastModified);
  });
});

describe('readPhotoMetadata — HEIC robustness', () => {
  it('a HEIC-typed file with no readable EXIF does not crash → falls back to lastModified', async () => {
    // We do not ship a real HEIC fixture: obtaining one reliably would need a
    // libheif WASM encoder (heavy, browser-oriented, unreliable under Node). The
    // contract that matters — a HEIC whose EXIF is unreadable must not throw and
    // must degrade to the file timestamp — is asserted on a HEIC-typed blob whose
    // bytes carry no parseable EXIF, which is exactly the graceful-fallback path.
    const noExifHeic = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
    const lastModified = new Date(2026, 8, 1, 7, 45, 0).getTime();
    const file = toFile(noExifHeic, 'shot.heic', 'image/heic', lastModified);

    const meta = await readPhotoMetadata(file);

    expect(meta.lat).toBeNull();
    expect(meta.lng).toBeNull();
    expect(meta.date!.getTime()).toBe(lastModified);
  });
});

describe('groupPhotos — offline / no-GPS clustering under Node', () => {
  it('clusters photos that all lack GPS by time and does not throw', async () => {
    // JPEGs with no EXIF at all → every photo's date comes from lastModified.
    const base = plainJpegBytes();
    const files = [
      toFile(base, 'a.jpg', 'image/jpeg', new Date(2026, 8, 10, 9, 0).getTime()),
      toFile(base, 'b.jpg', 'image/jpeg', new Date(2026, 8, 10, 9, 20).getTime()),
      toFile(base, 'c.jpg', 'image/jpeg', new Date(2026, 8, 10, 10, 30).getTime()), // 70min later → new leg
      toFile(base, 'd.jpg', 'image/jpeg', new Date(2026, 8, 11, 8, 0).getTime()), // next day
    ];

    const groups = await groupPhotos(files); // must resolve, never reject

    expect(groups).toHaveLength(2); // two day buckets
    expect(groups[0].date).toBe('2026-09-10');
    expect(groups[1].date).toBe('2026-09-11');
    // Day 1: 09:00+09:20 one leg, 10:30 a second (time gap > STOP_GAP_MS).
    expect(groups[0].legs).toHaveLength(2);
    expect(groups[0].legs[0].photos.map((p) => p.id)).toEqual(['a.jpg:0', 'b.jpg:1']);
    expect(groups[0].legs[1].photos.map((p) => p.id)).toEqual(['c.jpg:2']);
    expect(groups[1].legs).toHaveLength(1);
    // No GPS anywhere → legs are phantom (null pin).
    expect(groups[0].legs[0].lat).toBeNull();
    expect(groups[0].legs[0].lng).toBeNull();
  });
});
