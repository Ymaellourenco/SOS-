import { logger } from '../lib/logger';

interface GeocodeCache {
  [key: string]: string;
}

class GeocodeService {
  private cache: GeocodeCache = {};
  private pendingRequests: { [key: string]: Promise<string | null> } = {};

  private getCoordKey(lat: number, lng: number): string {
    // Use 4 decimal places for approximately 11-meter precision
    return `${lat.toFixed(4)},${lng.toFixed(4)}`;
  }

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const key = this.getCoordKey(lat, lng);

    // 1. Check if in cache
    if (this.cache[key]) {
      return this.cache[key];
    }

    // 2. Check if a request for this location is already in progress
    if (this.pendingRequests[key]) {
      return this.pendingRequests[key];
    }

    // 3. Perform the request
    const requestPromise = (async () => {
      try {
        const response = await fetch(`/api/geocode?lat=${lat}&lon=${lng}`);
        if (!response.ok) return null;
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          logger.warn("[GeocodeService] Expected JSON, got:", contentType);
          return null;
        }

        const data = await response.json();
        if (data && data.display_name) {
          const parts = data.display_name.split(',');
          // Return a human-friendly short address
          const shortAddress = parts.slice(0, 2).map((p: string) => p.trim()).join(', ');
          this.cache[key] = shortAddress;
          return shortAddress;
        }
        return null;
      } catch (error) {
        logger.warn(`[GeocodeService] Failed to reverse geocode ${key}:`, error);
        return null;
      } finally {
        delete this.pendingRequests[key];
      }
    })();

    this.pendingRequests[key] = requestPromise;
    return requestPromise;
  }

  getCachedAddress(lat: number, lng: number): string | null {
    const key = this.getCoordKey(lat, lng);
    return this.cache[key] || null;
  }
}

export const geocodeService = new GeocodeService();
