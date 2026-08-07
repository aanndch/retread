# Retread — HEIC/HEIF Image Support Plan

Companion to the photo pipeline. Adds support for iPhone HEIC/HEIF photo uploads, which currently fail at the browser-decode step (stock Chrome/Android can't decode HEIC). The single choke point is `compressImage` in `src/images.ts`; everything downstream stores/renders already-JPEG blobs.

Status: **scoped — P1 approved, implementation follows.**

---

## 1. Goal

Users can upload iPhone HEIC photos; they're converted to a universally-renderable JPEG and stored like any other photo. No change to display (already JPEG blobs via `URL.createObjectURL`).

## 2. Why it's needed (current behavior)

- `compressImage` (`src/images.ts:11`) decodes via `createImageBitmap`/`Image` (browser codec) then re-encodes JPEG q0.8, 1600px edge.
- HEIC (`image/heic`, `image/heif`) is **not decodable** by stock Chrome/Android; iOS Safari support for standard HEIC via `createImageBitmap` is inconsistent. So HEIC uploads hit the "Failed to upload: images must be valid format" toast on most browsers.
- `accept="image/*"` (`photos-step.tsx:44`) already lets HEIC be selected — only the decode is the barrier.

## 3. Design

- **Detect HEIC/HEIF** at the top of `compressImage` and `createThumbnail` (`src/images.ts:11`, `:96`) via `file.type` (`image/heic`/`image/heif`) or magic bytes.
- **Convert HEIC → JPEG** using `heic2any` (libheif WASM, in-browser, offline) BEFORE the existing resize/encode path, so the normal JPEG pipeline takes over. Convert once, reuse for both the full photo and the thumbnail.
- **Lazy-load** the decoder: `await import('heic2any')` only when a HEIC is detected. This is the app's first dynamic-import boundary — Vite emits it as a separate on-demand chunk, so the main bundle stays at its current size (311 KB JS / 101 KB gzip) and the ~2MB decoder downloads only when a HEIC is actually uploaded.

## 4. Bundle impact

- Current: 311 KB JS (101 KB gzip), single chunk, no code-splitting.
- With lazy `import('heic2any')`: main bundle unchanged; a separate async chunk (~2MB raw) loads only on HEIC use. **Initial load cost: ~0 KB.**

## 5. Handling & edge cases

- Conversion failure (corrupt HEIC / decode error) → fall through to the existing per-file "Failed to upload" toast, with a HEIC-specific message ("Couldn't convert this HEIC image"). Other files still process (existing loop behavior).
- Other formats need no change: JPEG/PNG/WebP work; AVIF decodes in modern browsers; GIF becomes a static frame (fine for photos).
- The `compressing: true` state already covers the conversion duration.

## 6. Phases

| Phase | Scope | Gate |
|---|---|---|
| **P1** | Add `heic2any` (lazy `import()`), detect HEIC in `images.ts`, convert → JPEG, wire into `compressImage` + `createThumbnail`; handle the HEIC-specific error message | `npm run build`; confirm a separate lazy chunk appears (bundle unchanged for main) |
| **P2** | Bundle-size verification (main chunk stays ~311 KB; lazy chunk separate), edge cases (magic-bytes fallback, corrupt file), doc the trade-off | build + manual HEIC upload |

## 7. Verification

- `npm run build` — must pass; confirm the build emits a SEPARATE lazy chunk for the decoder and the main JS chunk size is unchanged (~311 KB).
- Manual: upload a real HEIC (iPhone photo) → stores as JPEG, renders in grid/lightbox, thumbnail generated. (HEIC can't be generated headlessly without a fixture — manual or a test fixture.)
- Per the user's standing rule: no browser/headless verification scripts unless explicitly asked.

## 8. Out of scope

- Storing HEIC natively or converting on display (rejected: display would break on non-Safari).
- Server-side conversion (app is offline-first, in-browser WASM only).
- Multi-format optimization (WebP output, AVIF) — current JPEG output stays.
