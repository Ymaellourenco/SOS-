import { logger } from '../lib/logger';

export interface AbuseIPData {
  data: {
    ipAddress: string;
    isPublic: boolean;
    ipVersion: number;
    isWhitelisted: boolean;
    abuseConfidenceScore: number;
    countryCode: string;
    usageType: string | null;
    isp: string;
    domain: string;
    hostnames: string[];
    isProxy: boolean;
    lastReportedAt: string | null;
  };
}

class CheckIpService {
  async checkIp(ip: string, maxAge: number = 90): Promise<AbuseIPData | null> {
    try {
      const response = await fetch(`/api/check-ip?ip=${encodeURIComponent(ip)}&maxAge=${maxAge}`);
      if (!response.ok) throw new Error('IP reputation check failed');
      
      return await response.json();
    } catch (error) {
      logger.warn('IP check service error:', error);
      return null;
    }
  }
}

export const checkIpService = new CheckIpService();
