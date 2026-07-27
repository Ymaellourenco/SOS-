import { logger } from './logger';

/**
 * SoundService handles high-quality UI audio cues for the application.
 */

export type SoundSeverity = 'high' | 'medium' | 'low';

const SOUNDS: Record<SoundSeverity, string> = {
  high: 'https://cdn.freesound.org/previews/568/568169_7433034-lq.mp3', // Industrial/Professional alert chime
  medium: 'https://cdn.freesound.org/previews/352/352661_4019029-lq.mp3', // Information ping
  low: 'https://cdn.freesound.org/previews/234/234524_4111306-lq.mp3' // Subtle UI feedback
};

class SoundService {
  private audioCache: Map<string, HTMLAudioElement> = new Map();
  private enabled: boolean = true;
  private volume: number = 0.6;

  constructor() {
    // Preload sounds
    if (typeof window !== 'undefined') {
      Object.values(SOUNDS).forEach(url => {
        const audio = new Audio(url);
        audio.preload = 'auto';
        this.audioCache.set(url, audio);
      });
    }
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
  }

  public async play(severity: SoundSeverity) {
    if (!this.enabled || typeof window === 'undefined') return;

    try {
      const url = SOUNDS[severity];
      let audio = this.audioCache.get(url);
      
      if (!audio) {
        audio = new Audio(url);
        this.audioCache.set(url, audio);
      }

      // Clone or reset to allow overlapping sounds
      const playInstance = audio.cloneNode() as HTMLAudioElement;
      playInstance.volume = this.volume;
      
      // High severity might need higher volume or loop? 
      // User said "non-intrusive", so we'll keep it as a clear cue.
      if (severity === 'high') {
        playInstance.volume = Math.min(1, this.volume * 1.5);
      }

      await playInstance.play();
    } catch (error) {
      logger.warn('Failed to play alert sound:', error);
    }
  }
}

export const soundService = new SoundService();
