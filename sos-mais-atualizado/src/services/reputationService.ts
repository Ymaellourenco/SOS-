import { logger } from '../lib/logger';

export interface WOTReputation {
  target: string;
  reputation: number;
  confidence: number;
  categories: {
    id: number;
    name: string;
  }[];
}

class ReputationService {
  async checkDomains(domains: string[]): Promise<WOTReputation[] | null> {
    if (domains.length === 0) return [];
    
    try {
      const targets = domains.join(',');
      const response = await fetch(`/api/reputation?targets=${encodeURIComponent(targets)}`);
      
      if (!response.ok) throw new Error('Reputation fetch failed');
      
      const data = await response.json();
      return data;
    } catch (error) {
      logger.warn('Reputation service error:', error);
      return null;
    }
  }
}

export const reputationService = new ReputationService();
