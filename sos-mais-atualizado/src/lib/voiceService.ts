import { logger } from './logger';
export class VoiceService {
  private static instance: VoiceService;
  private enabled: boolean = false;
  private synth: SpeechSynthesis | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private isSpeakingState: boolean = false;
  private listeners: ((speaking: boolean) => void)[] = [];

  private constructor() {
    if (typeof window !== 'undefined') {
      if ('speechSynthesis' in window) {
        this.synth = window.speechSynthesis;
        this.loadVoice();
        if (this.synth.onvoiceschanged !== undefined) {
          this.synth.onvoiceschanged = () => this.loadVoice();
        }
      }
      
      const saved = localStorage.getItem('sos_mais_voice_guidance');
      this.enabled = saved === null ? true : saved === 'true';
    }
  }

  public static getInstance(): VoiceService {
    if (!VoiceService.instance) {
      VoiceService.instance = new VoiceService();
    }
    return VoiceService.instance;
  }

  private loadVoice() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();

    // Lista de nomes comuns de vozes femininas portuguesas nos motores mais usados (Google, Microsoft, Apple)
    const femaleNameHints = ['female', 'mulher', 'maria', 'joana', 'fernanda', 'helena', 'raquel', 'catarina', 'luciana', 'paulina'];
    const isLikelyFemale = (v: SpeechSynthesisVoice) =>
      femaleNameHints.some(hint => v.name.toLowerCase().includes(hint));

    const ptPTVoices = voices.filter(v => v.lang === 'pt-PT' || v.lang === 'pt_PT' || v.lang.startsWith('pt-PT'));
    const ptVoices = voices.filter(v => v.lang.startsWith('pt'));

    this.voice =
      ptPTVoices.find(isLikelyFemale) ||      // 1. Voz feminina pt-PT (ideal)
      ptPTVoices[0] ||                         // 2. Qualquer voz pt-PT
      ptVoices.find(isLikelyFemale) ||         // 3. Voz feminina pt (Brasil ou outro)
      ptVoices[0] ||                           // 4. Qualquer voz pt
      voices[0];                               // 5. Última opção: qualquer voz disponível
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    localStorage.setItem('sos_mais_voice_guidance', String(enabled));
    if (enabled) {
      this.speak('Guia de voz ativado em português de Portugal.');
    } else {
      this.stop();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  public subscribe(listener: (speaking: boolean) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private setSpeaking(val: boolean) {
    this.isSpeakingState = val;
    this.listeners.forEach(l => l(val));
  }

  private cleanTextForSpeech(text: string): string {
    if (!text) return "";
    
    // 1. Remove markdown characters, hashtags, asterisks, brackets, and special formatting symbols
    let cleaned = text
      .replace(/\*\*\*/g, '')          // Removes ***
      .replace(/\*\*/g, '')            // Removes **
      .replace(/\*/g, '')              // Removes *
      .replace(/___/g, '')             // Removes ___
      .replace(/__/g, '')              // Removes __
      .replace(/_/g, '')               // Removes _
      .replace(/###/g, '')             // Removes ###
      .replace(/##/g, '')              // Removes ##
      .replace(/#/g, '')               // Removes #
      .replace(/`/g, '')               // Removes backticks
      .replace(/  +/g, ' ')            // Collapses multiple spaces
      .trim();

    // 2. Expand common abbreviations to ensure flawless Portuguese phonetics under pressure
    cleaned = cleaned
      .replace(/\bUSF\b/g, "Unidade de Saúde Familiar")
      .replace(/\bGNR\b/g, "G.N.R.")
      .replace(/\bPSP\b/g, "P.S.P.")
      .replace(/\bSOS\b/g, "S.O.S.")
      .replace(/\bGPS\b/g, "G.P.S.")
      .replace(/\bTTS\b/g, "sintetizador de voz")
      .replace(/\bpt-PT\b/g, "Português de Portugal");

    return cleaned;
  }

  private speakWithLocalBrowser(text: string) {
    logger.log("A usar voz do sistema local (offline/gratuita).");
    if (!this.synth) return;
    const cleaned = this.cleanTextForSpeech(text);
    const utterance = new SpeechSynthesisUtterance(cleaned);
    if (this.voice) {
      utterance.voice = this.voice;
    }
    utterance.lang = 'pt-PT';
    // SOS+ Core mandate: 0.80x speed
    utterance.rate = 0.80;
    utterance.pitch = 1.05;
    
    utterance.onstart = () => this.setSpeaking(true);
    utterance.onend = () => this.setSpeaking(false);
    utterance.onerror = () => this.setSpeaking(false);
    
    this.synth.speak(utterance);
  }

  public async speak(text: string) {
    if (!this.enabled) return;

    this.stop();
    const cleanedText = this.cleanTextForSpeech(text);
    this.speakWithLocalBrowser(cleanedText);
  }

  public stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.setSpeaking(false);
  }
}

export const voiceService = VoiceService.getInstance();
