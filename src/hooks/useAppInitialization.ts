import { useState, useEffect } from 'react';
import { requestNotificationPermission, setupMessageListener, startProximityBeacon } from '../lib/notifications';
import { speechService } from '../lib/voiceCommandService';
import { toast } from 'react-hot-toast';
import { voiceService } from '../lib/voiceService';
import { PrivacySettings } from '../components/onboarding/PrivacyCenter';

export const useAppInitialization = (activeTab: string) => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings | null>(null);

  useEffect(() => {
    // Initial Voice Greeting
    const voiceHasPlayed = sessionStorage.getItem('initial_voice_played');
    if (!voiceHasPlayed && voiceService.isEnabled() && activeTab === 'home') {
      const runVoiceSequence = async () => {
        await new Promise(r => setTimeout(r, 2000));
        voiceService.speak("Como podemos ajudar?");
        sessionStorage.setItem('initial_voice_played', 'true');
      };
      runVoiceSequence();
    }
  }, [activeTab]);

  useEffect(() => {
    // 0. Geolocation
    if ("geolocation" in navigator && !userLocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        null,
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 120000 }
      );
    }

    // 1. Storage & Settings
    const onboardingComplete = localStorage.getItem('onboarding_complete');
    if (!onboardingComplete) setShowOnboarding(true);

    const privacyAccepted = localStorage.getItem('privacy_accepted');
    if (privacyAccepted) {
      try {
        setPrivacySettings(JSON.parse(privacyAccepted));
      } catch (e) {}
    }

    // 2. Deferred Post-Boot Tasks
    const handleIdleTasks = () => {
      requestNotificationPermission().then(granted => {
        if (granted) {
          setupMessageListener();
          startProximityBeacon();
        }
      });

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }

      const commandsEnabled = localStorage.getItem('sos_mais_voice_commands') !== 'false';
      if (commandsEnabled) {
        // Alguns motores de reconhecimento de voz do browser disparam o evento de
        // deteção duas vezes seguidas para a mesma frase dita — este período de
        // segurança (3s) evita mostrar o mesmo aviso duplicado, ou disparar o ecrã
        // de emergência duas vezes por engano.
        let lastTriggerAt = 0;
        speechService.start(() => {
          const now = Date.now();
          if (now - lastTriggerAt < 3000) return;
          lastTriggerAt = now;

          toast.error('Comando de Voz: SOS Detectado!', {
            icon: '🎙️',
            duration: 4000,
            style: { borderRadius: '16px', background: '#000', color: '#fff', fontSize: '9px', fontWeight: '900' }
          });
          window.dispatchEvent(new CustomEvent('sos-activated'));
        });
      }
    };

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(handleIdleTasks, { timeout: 10000 });
    } else {
      setTimeout(handleIdleTasks, 6000);
    }
  }, []);

  return {
    showOnboarding,
    setShowOnboarding,
    userLocation,
    privacySettings,
    setPrivacySettings
  };
};
