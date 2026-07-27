import { auth } from './firebase';
import { logger } from './logger';
import { getApiBaseUrl } from './apiConfig';

export interface LiveLocationState {
  active: boolean;
  token: string | null;
  trackingUrl: string | null;
  startedAt: number | null;
}

type Listener = (state: LiveLocationState) => void;

const MAX_DURATION_MS = 3 * 60 * 60 * 1000; // 3 horas — o servidor também aplica este limite
const UPDATE_INTERVAL_MS = 20 * 1000; // atualiza a posição a cada 20s (poupa bateria/dados)

class LiveLocationService {
  private state: LiveLocationState = { active: false, token: null, trackingUrl: null, startedAt: null };
  private listeners: Set<Listener> = new Set();
  private watchId: number | null = null;
  private updateTimer: number | null = null;
  private autoStopTimer: number | null = null;
  private latestPosition: { lat: number; lng: number } | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l(this.state));
  }

  private async getAuthHeader(): Promise<Record<string, string>> {
    const token = await auth.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async start(initialLat?: number, initialLng?: number): Promise<LiveLocationState> {
    if (this.state.active) return this.state; // já ativo, não duplica
    if (!auth.currentUser) {
      logger.warn('[LiveLocation] Sem sessão iniciada — não é possível iniciar partilha contínua.');
      return this.state;
    }

    try {
      const headers = { 'Content-Type': 'application/json', ...(await this.getAuthHeader()) };
      const response = await fetch('/api/live-location/start', {
        method: 'POST',
        headers,
        body: JSON.stringify({ latitude: initialLat, longitude: initialLng })
      });
      if (!response.ok) throw new Error(`Servidor respondeu ${response.status}`);
      const data = await response.json();

      this.state = {
        active: true,
        token: data.token,
        // Nunca usar window.location.origin aqui — dentro da app nativa isso dá
        // "capacitor://localhost" ou parecido, um link que não significa nada para
        // quem o recebe por SMS. Usamos sempre o endereço real do servidor.
        trackingUrl: `${getApiBaseUrl() || window.location.origin}/track.html?token=${data.token}`,
        startedAt: Date.now()
      };
      this.notify();

      if (initialLat != null && initialLng != null) {
        this.latestPosition = { lat: initialLat, lng: initialLng };
      }

      // Segue a posição em segundo plano; só envia atualizações ao servidor de X em X segundos.
      if ('geolocation' in navigator) {
        this.watchId = navigator.geolocation.watchPosition(
          (pos) => { this.latestPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
          (err) => logger.warn('[LiveLocation] Erro a seguir posição:', err),
          { enableHighAccuracy: true, maximumAge: 15000 }
        );
      }

      this.updateTimer = window.setInterval(() => this.pushUpdate(), UPDATE_INTERVAL_MS);
      // Paragem automática ao fim de 3 horas, para nunca ficar a partilhar para sempre por engano.
      this.autoStopTimer = window.setTimeout(() => this.stop(), MAX_DURATION_MS);

      return this.state;
    } catch (error) {
      logger.error('[LiveLocation] Falha ao iniciar partilha contínua:', error);
      return this.state;
    }
  }

  private async pushUpdate() {
    if (!this.state.active || !this.state.token || !this.latestPosition) return;
    try {
      const headers = { 'Content-Type': 'application/json', ...(await this.getAuthHeader()) };
      await fetch('/api/live-location/update', {
        method: 'POST',
        headers,
        body: JSON.stringify({ token: this.state.token, latitude: this.latestPosition.lat, longitude: this.latestPosition.lng })
      });
    } catch (error) {
      logger.warn('[LiveLocation] Falha ao atualizar posição:', error);
    }
  }

  async stop() {
    if (!this.state.active) return;
    const token = this.state.token;

    if (this.watchId !== null) { navigator.geolocation.clearWatch(this.watchId); this.watchId = null; }
    if (this.updateTimer !== null) { window.clearInterval(this.updateTimer); this.updateTimer = null; }
    if (this.autoStopTimer !== null) { window.clearTimeout(this.autoStopTimer); this.autoStopTimer = null; }

    this.state = { active: false, token: null, trackingUrl: null, startedAt: null };
    this.notify();

    try {
      const headers = { 'Content-Type': 'application/json', ...(await this.getAuthHeader()) };
      await fetch('/api/live-location/stop', { method: 'POST', headers, body: JSON.stringify({ token }) });
    } catch (error) {
      logger.warn('[LiveLocation] Falha ao notificar o servidor da paragem:', error);
    }
  }

  getState() {
    return this.state;
  }
}

export const liveLocationService = new LiveLocationService();
