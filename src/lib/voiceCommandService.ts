import { logger } from './logger';

export class SpeechService {
  private static instance: SpeechService;
  private recognition: any = null;
  private isListening: boolean = false;
  private isActuallyStarted: boolean = false;
  private onSOSDetected: (() => void) | null = null;
  private restartTimeout: any = null;

  private constructor() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.lang = 'pt-PT';
      this.recognition.interimResults = true; // Use interim for faster response
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        this.isActuallyStarted = true;
        this.isListening = true;
        logger.log('Voice recognition active...');
      };

      this.recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript.toLowerCase();
        }

        logger.log('Voice Stream:', transcript);
        
        // Comprehensive Portuguese emergency keyword detection.
        // Usamos limites de palavra (\b) em vez de .includes() — "sos" sozinho como substring
        // dispararia com palavras normais como "nossos", "vossos", "casos", "gostosos", etc.
        const emergencyKeywords = [
          'sos mais', 
          'preciso de ajuda', 
          'ajuda-me', 
          'sos', 
          'emergência', 
          'socorro',
          'socorro imediato',
          'ajuda imediata',
          'vê-me ajudar',
          'ajuda por favor'
        ];
        
        const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matches = emergencyKeywords.some(keyword => {
          const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
          return pattern.test(transcript);
        });

        if (matches) {
          // Prevent multiple triggers in the same result stream
          // Use a simple debounce logic locally if needed, but SOSButton checks countdown too
          logger.log('SOS Trigger Detected!');
          window.dispatchEvent(new CustomEvent('emergency-voice-trigger'));
          if (this.onSOSDetected) this.onSOSDetected();
          
          // Stop and restart to clear the buffers and avoid double trigger
          this.stop();
          setTimeout(() => this.start(this.onSOSDetected!), 1000);
        }
      };

      this.recognition.onend = () => {
        this.isActuallyStarted = false;
        if (this.isListening) {
          if (this.restartTimeout) clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            if (this.isListening && !this.isActuallyStarted) {
              try {
                this.recognition.start();
              } catch (e) {
                // Silently skip if browser hasn't released the mic access yet
              }
            }
          }, 500);
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'aborted') return; // Expected when stopping manually
        logger.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this.isListening = false;
        }
      };
    }
  }

  public static getInstance(): SpeechService {
    if (!SpeechService.instance) {
      SpeechService.instance = new SpeechService();
    }
    return SpeechService.instance;
  }

  public start(callback: () => void) {
    if (!this.recognition) return;
    
    // Check if enabled in settings
    const isEnabled = localStorage.getItem('sos_mais_voice_commands') !== 'false';
    if (!isEnabled) return;

    this.onSOSDetected = callback;
    this.isListening = true;

    if (!this.isActuallyStarted) {
      try {
        this.recognition.start();
      } catch (e) {
        // Silently handle if browser thinks it already started
      }
    }
  }

  public stop() {
    this.isListening = false;
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    if (this.recognition && this.isActuallyStarted) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Already stopped
      }
    }
  }

  /**
   * Retoma a escuta em segundo plano usando o último callback registado — usado
   * depois de outra funcionalidade (ex: ditado de texto) ter pedido o microfone
   * emprestado temporariamente, já que o browser só permite um reconhecimento
   * de voz ativo de cada vez.
   */
  public resume() {
    if (!this.recognition || !this.onSOSDetected) return;
    const isEnabled = localStorage.getItem('sos_mais_voice_commands') !== 'false';
    if (!isEnabled) return;
    this.isListening = true;
    if (!this.isActuallyStarted) {
      try {
        this.recognition.start();
      } catch (e) {
        // Silently handle if browser thinks it already started
      }
    }
  }
}

export const speechService = SpeechService.getInstance();
