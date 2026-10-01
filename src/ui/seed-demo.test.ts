import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadDemoPhoto } from './seed-demo';

describe('loadDemoPhoto', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('loads photo when fetch returns ok', async () => {
    const mockBlob = new Blob(['test-jpeg-bytes'], { type: 'image/jpeg' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => mockBlob,
    });

    const result = await loadDemoPhoto('mountains-800x600.jpg');
    expect(result).toBe(mockBlob);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('tries fallback candidates and returns first successful blob', async () => {
    const mockBlob = new Blob(['success-bytes'], { type: 'image/jpeg' });
    let attempts = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) return { ok: false, status: 404 };
      return { ok: true, blob: async () => mockBlob };
    });

    const result = await loadDemoPhoto('valley-800x450.jpg');
    expect(result).toBe(mockBlob);
    expect(attempts).toBe(2);
  });

  it('falls back to generated graphic blob when all network fetches fail', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const result = await loadDemoPhoto('road-900x600.jpg', 'Offline Road', '#4a5d4e');
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/svg+xml');
    const text = await result.text();
    expect(text).toContain('OFFLINE ROAD');
  });
});
