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
    const handleIdleTasks = async () => {
      // O WebView do Android só consegue processar UM pedido de permissão de cada
      // vez — pedir notificações e microfone quase ao mesmo tempo (ou perto do
      // pedido de localização) fazia a app fechar-se sozinha, com o erro nativo
      // "Either grant() or deny() has been already called". Por isso encadeamos
      // os pedidos, um a seguir ao outro, nunca em paralelo.
      let notificationsGranted = false;
      try {
        notificationsGranted = await requestNotificationPermission();
      } catch (e) {
        // Falha a pedir notificações não deve impedir o resto de arrancar.
      }
      if (notificationsGranted) {
        setupMessageListener();
        startProximityBeacon();
      }

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }

      // Pequena pausa antes do próximo pedido de permissão (microfone), para dar
      // tempo ao Android de terminar de processar o anterior por completo.
      await new Promise(r => setTimeout(r, 1500));

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

    // requestIdleCallback pode disparar quase de imediato se o browser já estiver
    // "parado" — isso podia coincidir exatamente com o pedido de localização
    // (que dispara logo acima, sem atraso nenhum), causando a mesma colisão de
    // permissões que estamos a tentar evitar. Por isso garantimos sempre um
    // atraso mínimo (3s), mesmo quando requestIdleCallback está disponível.
    const MIN_IDLE_DELAY_MS = 3000;
    if ('requestIdleCallback' in window) {
      setTimeout(() => {
        (window as any).requestIdleCallback(handleIdleTasks, { timeout: 10000 });
      }, MIN_IDLE_DELAY_MS);
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
