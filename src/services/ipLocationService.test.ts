import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchApproximateLocation } from './ipLocationService';

describe('fetchApproximateLocation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns data from the primary provider (ipwho.is) when it succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, latitude: 40.66, longitude: -7.91, city: 'Viseu', postal: '3500-000' }),
    }));

    const result = await fetchApproximateLocation();

    expect(result).toEqual({ lat: 40.66, lon: -7.91, city: 'Viseu', postal: '3500-000' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the secondary provider (ipapi.co) when the primary fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false }) // ipwho.is fails
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ latitude: 38.72, longitude: -9.14, city: 'Lisboa' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchApproximateLocation();

    expect(result).toEqual({ lat: 38.72, lon: -9.14, city: 'Lisboa', postal: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when both providers fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const result = await fetchApproximateLocation();

    expect(result).toBeNull();
  });

  it('treats ipwho.is success:false as a failure and still tries the fallback', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: false }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ latitude: 41.15, longitude: -8.61, city: 'Porto' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchApproximateLocation();

    expect(result?.city).toBe('Porto');
  });
});
