import { logger } from '../lib/logger';

export interface DatabricksJob {
  job_id: number;
  settings: any;
  created_time: number;
}

class DatabricksService {
  async createJob(config: any): Promise<{ job_id: number } | null> {
    try {
      const response = await fetch('/api/databricks/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!response.ok) throw new Error('Failed to create job');
      return await response.json();
    } catch (error) {
      logger.error('DatabricksService error:', error);
      return null;
    }
  }

  async listJobs(): Promise<{ jobs: DatabricksJob[] } | null> {
    try {
      const response = await fetch('/api/databricks/jobs');
      if (!response.ok) throw new Error('Failed to list jobs');
      return await response.json();
    } catch (error) {
      logger.error('DatabricksService error:', error);
      return null;
    }
  }
}

export const databricksService = new DatabricksService();
