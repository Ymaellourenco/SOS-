import { logger } from '../lib/logger';
/**
 * ipLocationService
 *
 * Single source of truth for approximate (IP-based) location lookups.
 * Used as a fast fallback while precise GPS is still acquiring a fix,
 * or when geolocation permission is unavailable.
 *
 * Consolidated from several ad-hoc provider lists that used to be
 * duplicated across components (ipwho.is, ipapi.co, freeipapi.com,
 * bigdatacloud, ip2location, locationiq, theipapi, geokeo...).
 * We now use exactly one primary provider and one fallback.
 */

export interface IPLocationResult {
  lat: number;
  lon: number;
  city: string;
  postal?: string;
}

const TIMEOUT_MS = 3000;

async function tryIpwhoIs(): Promise<IPLocationResult | null> {
  const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.success || !data.latitude || !data.longitude) return null;
  return {
    lat: data.latitude,
    lon: data.longitude,
    city: data.city || 'Portugal',
    postal: data.postal || undefined,
  };
}

async function tryIpapiCo(): Promise<IPLocationResult | null> {
  const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.latitude || !data.longitude) return null;
  return {
    lat: data.latitude,
    lon: data.longitude,
    city: data.city || 'Portugal',
    postal: data.postal || undefined,
  };
}

/**
 * Returns an approximate location based on the device's IP address.
 * Tries the primary provider first, then a single fallback. Returns
 * null if both fail (caller should rely on GPS or show "unknown").
 */
export async function fetchApproximateLocation(): Promise<IPLocationResult | null> {
  try {
    const primary = await tryIpwhoIs();
    if (primary) return primary;
  } catch (err) {
    logger.warn('[ipLocationService] primary provider failed', err);
  }

  try {
    const fallback = await tryIpapiCo();
    if (fallback) return fallback;
  } catch (err) {
    logger.warn('[ipLocationService] fallback provider failed', err);
  }

  return null;
}
