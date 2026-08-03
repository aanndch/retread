/**
 * gzip compress/decompress helpers using the native CompressionStream API.
 * No dependencies — Baseline since May 2023 (Chrome 80+, Safari 15.4+, Firefox 113+).
 */

export async function gzipString(str: string): Promise<Blob> {
  const encoder = new TextEncoder();
  const stream = new Blob([encoder.encode(str)]).stream();
  const compressed = stream.pipeThrough(new CompressionStream('gzip'));
  return await new Response(compressed).blob();
}

export async function gunzipBlob(blob: Blob): Promise<string> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

export async function isGzipped(blob: Blob): Promise<boolean> {
  const header = await blob.slice(0, 2).arrayBuffer();
  const bytes = new Uint8Array(header);
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}
