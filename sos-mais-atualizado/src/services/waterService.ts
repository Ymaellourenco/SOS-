import { logger } from '../lib/logger';

export interface WaterData {
  water: boolean;
  latitude: number;
  longitude: number;
}

class WaterService {
  async isWater(lat: number, lon: number): Promise<boolean | null> {
    try {
      const response = await fetch(`/api/is-water?lat=${lat}&lon=${lon}`);
      if (!response.ok) throw new Error('Water check failed');
      
      const data = await response.json();
      return data.water;
    } catch (error) {
      logger.warn('Water service error:', error);
      return null;
    }
  }
}

export const waterService = new WaterService();
