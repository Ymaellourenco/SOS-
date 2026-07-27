import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Alert } from '../types';
import { calculateDistance } from '../lib/utils';
import { requestNotificationPermission, sendAlertNotification } from '../lib/notifications';
import { soundService } from '../lib/soundService';
import { logger } from '../lib/logger';

const SEVERITY_LABELS = {
  high: 'Crítico',
  medium: 'Importante',
  low: 'Informativo'
};

export const useAlerts = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'prompt' | 'granted' | 'denied' | 'error'>('prompt');
  const [newlyNotified, setNewlyNotified] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());
  const watchIdRef = useRef<number | null>(null);

  const fetchAlerts = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/alerts${options?.force ? '?force=true' : ''}`);
      if (!response.ok) throw new Error('Falha ao sincronizar dados');
      const data = await response.json();
      
      const processedData = data.map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }));
      
      setAlerts(processedData);
      setLastUpdated(new Date());
      logger.log(`[SOS Mais] Alertas sincronizados: ${processedData.length}`);
    } catch (err) {
      logger.error('Error fetching alerts:', err);
      setError('Ops! Tivemos um problema a sincronizar os alertas.');
    } finally {
      setLoading(false);
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        logger.log(`[SOS Mais] Localização obtida: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`);
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationStatus('granted');
      },
      (error) => {
        logger.log(`[SOS Mais] Falha ao obter localização — código ${error.code}: ${error.message}`);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus('denied');
        } else {
          setLocationStatus('error');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    fetchAlerts();
    requestNotificationPermission();
    requestLocation();
    
    const alertInterval = setInterval(fetchAlerts, 5 * 60 * 1000);
    
    return () => {
      clearInterval(alertInterval);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [fetchAlerts, requestLocation]);

  useEffect(() => {
    if (locationStatus === 'granted' && watchIdRef.current === null) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude: lat, longitude: lng } = position.coords;
          setUserLocation(prev => {
            if (prev) {
              const distanceMoved = calculateDistance(prev.lat, prev.lng, lat, lng);
              if (distanceMoved < 1.0) return prev;
            }
            return { lat, lng };
          });
        },
        null,
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
      );
    }
  }, [locationStatus]);

  useEffect(() => {
    if (alerts.length > 0 && userLocation) {
      const NEAR_KM = 50; // mesmo raio usado na aba "Perto de Mim" (AlertList.tsx)
      const MAX_TOASTS_PER_CYCLE = 2;

      const evaluated = alerts.map(alert => ({
        alert,
        distance: calculateDistance(userLocation.lat, userLocation.lng, alert.location.lat, alert.location.lng),
        alreadyNotified: notifiedRef.current.has(alert.id)
      }));

      const withinRadius = evaluated.filter(e => e.distance <= NEAR_KM);
      logger.log(
        `[SOS Mais] Avaliação de notificações — ${evaluated.length} alertas totais, ${withinRadius.length} dentro de ${NEAR_KM}km: ` +
        withinRadius.map(e => `${e.alert.title} (${e.alert.severity}, ${e.distance.toFixed(1)}km, notificado=${e.alreadyNotified})`).join(' | ')
      );

      const candidates = evaluated
        .filter(({ alreadyNotified }) => !alreadyNotified)
        // Crítico até 50km, ou Importante até 25km — evita nunca notificar quando não há nada "high" perto.
        .filter(({ alert, distance }) =>
          (alert.severity === 'high' && distance <= NEAR_KM) ||
          (alert.severity === 'medium' && distance <= 25)
        )
        .sort((a, b) => {
          const rank = (s: string) => s === 'high' ? 0 : s === 'medium' ? 1 : 2;
          const rankDiff = rank(a.alert.severity) - rank(b.alert.severity);
          return rankDiff !== 0 ? rankDiff : a.distance - b.distance;
        });

      candidates.forEach(({ alert, distance }, index) => {
        // Marca sempre como "visto" para não voltar a ser avaliado, mas só mostra toast para os 2 mais próximos.
        notifiedRef.current.add(alert.id);
        if (index < MAX_TOASTS_PER_CYCLE) {
          sendAlertNotification(
            `[PERTO DE SI] ${SEVERITY_LABELS[alert.severity].toUpperCase()}: ${alert.title}`,
            `Localizado a ${distance.toFixed(1)}km. ${alert.description}`,
            alert.severity
          );
          setNewlyNotified(prev => new Set([...prev, alert.id]));
          setTimeout(() => {
            setNewlyNotified(prev => {
              const next = new Set(prev);
              next.delete(alert.id);
              return next;
            });
          }, 10000);
        }
      });

      // Alertas que não passaram no critério (longe ou não-críticos) também ficam marcados
      // como vistos, para não serem reavaliados a cada refresh — evita reaparecerem mais tarde.
      alerts.forEach(alert => {
        if (!notifiedRef.current.has(alert.id)) {
          notifiedRef.current.add(alert.id);
        }
      });
    }
  }, [alerts, userLocation]);

  return {
    alerts,
    loading,
    error,
    userLocation,
    locationStatus,
    fetchAlerts,
    handleRetryLocation: requestLocation,
    newlyNotified,
    lastUpdated
  };
};
