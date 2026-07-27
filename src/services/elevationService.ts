import { logger } from '../lib/logger';

export interface ElevationData {
  elevation: number;
  location: {
    lat: number;
    lng: number;
  };
  dataset: string;
}

class ElevationService {
  private cache: Map<string, ElevationData> = new Map();

  async getElevation(lat: number, lon: number, dataset: string = "test-dataset"): Promise<ElevationData | null> {
    const cacheKey = `${lat},${lon},${dataset}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) || null;
    }

    try {
      const response = await fetch(`/api/elevation?lat=${lat}&lon=${lon}&dataset=${dataset}`);
      if (!response.ok) throw new Error('Elevation fetch failed');
      
      const data = await response.json();
      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      logger.warn('Elevation service error:', error);
      return null;
    }
  }
}

export const elevationService = new ElevationService();
