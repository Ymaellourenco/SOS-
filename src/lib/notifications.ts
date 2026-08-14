import { getToken, onMessage } from 'firebase/messaging';
import { signInAnonymously } from 'firebase/auth';
import { getMessagingSafe, auth } from './firebase';
import { soundService } from './soundService';
import { logger } from './logger';

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    logger.warn('Este browser não suporta notificações');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (e) {
      logger.error('Falha ao pedir permissão de notificação:', e);
    }
  }

  return false;
}

export async function getFCMToken() {
  const messaging = await getMessagingSafe();
  if (!messaging) return null;
  
  try {
    if (typeof Notification === 'undefined') return null;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const token = await getToken(messaging, {
      vapidKey: (import.meta as any).env.VITE_FIREBASE_VAPID_KEY
    });

    if (token) {
      localStorage.setItem('fcm_token', token);
      logger.log('FCM Token:', token);
      // Registar o dispositivo para receber avisos de perigo perto não devia exigir
      // conta nenhuma — ser avisado de um incêndio próximo é segurança básica, não
      // uma funcionalidade "premium". Se a pessoa não tem sessão iniciada a sério,
      // inicia sessão anónima (sem pedir nada à pessoa, sem dados pessoais) só para
      // termos um identificador válido a que associar o token e a localização.
      let uid = auth.currentUser?.uid;
      if (!uid) {
        try {
          const anonUser = await signInAnonymously(auth);
          uid = anonUser.user.uid;
        } catch (e) {
          logger.error('Falha ao iniciar sessão anónima para notificações:', e);
        }
      }
      if (uid) {
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (position) => registerTokenWithBackend(uid!, token, position.coords.latitude, position.coords.longitude),
            () => registerTokenWithBackend(uid!, token),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
          );
        } else {
          registerTokenWithBackend(uid, token);
        }
      }
      return token;
    }
  } catch (error) {
    logger.error('Erro ao obter token FCM:', error);
  }
  return null;
}

export async function setupMessageListener() {
  const messaging = await getMessagingSafe();
  if (!messaging) return;
  
  onMessage(messaging, (payload) => {
    logger.log('Mensagem em foreground recebida:', payload);
    if (payload.notification) {
      sendAlertNotification(
        payload.notification.title || 'ALERTA',
        payload.notification.body || '',
        'high'
      );
    }
  });
}

// Web Bluetooth Beacon for Offline Proximity
export async function startProximityBeacon() {
  if (!('bluetooth' in navigator)) {
    logger.warn('Bluetooth não suportado.');
    return;
  }
  // This is a placeholder for experimental web bluetooth advertising
  logger.log('Proximity Beacon pronto.');
}

export function sendAlertNotification(
  title: string, 
  body: string, 
  severity: 'high' | 'medium' | 'low' = 'low'
) {
  if (typeof Notification === 'undefined') return;

  if (Notification.permission === 'granted') {
    const vibrationPattern = severity === 'high' 
      ? [500, 110, 500, 110, 450, 110, 200, 110, 170, 40, 450, 110, 200, 110, 170, 40] 
      : severity === 'medium' 
        ? [200, 100, 200]
        : [50];
    
    if ('vibrate' in navigator) {
      navigator.vibrate(vibrationPattern);
    }
    
    // Play high-quality sound based on severity
    soundService.play(severity);

    window.dispatchEvent(new CustomEvent('emergency-notification-sent', { 
      detail: { title, body, severity } 
    }));

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          body,
          icon: '/logo192.png',
          badge: '/logo192.png',
          vibrate: vibrationPattern,
          tag: 'emergency-alert',
          renotify: true,
          requireInteraction: true,
          data: { url: '/' },
          silent: false,
        } as any);
      });
    } else {
      new Notification(title, {
        body,
        tag: 'emergency-alert',
        requireInteraction: true
      } as any);
    }
  }
}

export function playNotificationPreview(soundUrl: string) {
  // Use the high severity sound as a "system check"
  return soundService.play('high');
}

/**
 * Obtém o ID token atual do Firebase Auth para provar a identidade ao backend.
 * Sem sessão iniciada, devolve null — os pedidos protegidos falham de forma segura.
 */
async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const idToken = await auth.currentUser?.getIdToken();
    return idToken ? { 'Authorization': `Bearer ${idToken}` } : {};
  } catch {
    return {};
  }
}

/**
 * Registers device token on the server
 */
export async function registerTokenWithBackend(userId: string, token: string, latitude?: number, longitude?: number) {
  try {
    const authHeader = await getAuthHeader();
    const response = await fetch('/api/notifications/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        userId,
        token,
        ...(typeof latitude === 'number' && typeof longitude === 'number' ? { latitude, longitude } : {}),
        deviceType: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 
                    /Android/i.test(navigator.userAgent) ? 'android' : 'web'
      })
    });
    return await response.json();
  } catch (error) {
    logger.error('Failed to register token with backend:', error);
    return null;
  }
}

/**
 * Triggers a real SOS alert via backend (notifies emergency contacts)
 */
export async function triggerSOS(userId: string, latitude: number, longitude: number, address?: string, emergencyType?: string, message?: string) {
  try {
    const authHeader = await getAuthHeader();
    const response = await fetch('/api/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        userId,
        latitude,
        longitude,
        address,
        emergencyType,
        message
      })
    });
    const data = await response.json();
    logger.log('SOS backend response:', data);
    return data;
  } catch (error) {
    logger.error('Failed to trigger SOS on backend:', error);
    return null;
  }
}
