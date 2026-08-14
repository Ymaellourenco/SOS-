import { logger } from '../lib/logger';
/**
 * Service to fetch real-world Emergency POIs from OpenStreetMap using Overpass API
 */

export interface EmergencyPOI {
  id: string;
  name: string;
  type: 'hospital' | 'health_center' | 'health_post' | 'police' | 'fire' | 'municipality' | 'pharmacy' | 'parish_council' | 'sos' | 'shelter' | 'social';
  location: { lat: number; lng: number };
  address?: string;
  /** true quando não há dados reais confirmados — é uma posição aproximada, não um local verificado. */
  isEstimate?: boolean;
  /** true se for um hospital privado — usado para priorizar hospitais públicos (SNS) em emergências. */
  isPrivate?: boolean;
}

// Cache simples em memória: evita repetir o mesmo pedido ao remontar o mapa.
const POI_CACHE_TTL = 15 * 60 * 1000; // 15 minutos
const poiCache = new Map<string, { data: EmergencyPOI[]; timestamp: number }>();

function cacheKey(lat: number, lng: number, radiusKm: number): string {
  // Arredonda a ~1km para que pequenas variações de GPS reutilizem o mesmo cache.
  return `${lat.toFixed(2)},${lng.toFixed(2)},${radiusKm}`;
}

export async function fetchNearbyEmergencyPOIs(lat: number, lng: number, radiusKm: number = 15): Promise<EmergencyPOI[]> {
  // Antes de admitir "sem dados", tenta raios cada vez maiores — em zonas mais
  // rurais, o hospital mais próximo pode estar a 40-50km, não só 15km. Nunca
  // inventamos um resultado, mas procuramos mesmo a sério antes de desistir.
  const radiiToTry = [...new Set([radiusKm, radiusKm * 2, radiusKm * 4, 60])].filter(r => r <= 60).sort((a, b) => a - b);

  for (let i = 0; i < radiiToTry.length; i++) {
    const results = await fetchNearbyEmergencyPOIsAtRadius(lat, lng, radiiToTry[i]);
    const hasRealResults = results.length > 0 && !results.every(r => r.isEstimate);
    if (hasRealResults || i === radiiToTry.length - 1) {
      return results;
    }
    logger.log(`[EmergencyService] Nada confirmado a ${radiiToTry[i]}km — a tentar um raio maior antes de desistir.`);
  }
  return fetchNearbyEmergencyPOIsAtRadius(lat, lng, radiusKm);
}

async function fetchNearbyEmergencyPOIsAtRadius(lat: number, lng: number, radiusKm: number): Promise<EmergencyPOI[]> {
  const key = cacheKey(lat, lng, radiusKm);
  const cached = poiCache.get(key);
  if (cached && Date.now() - cached.timestamp < POI_CACHE_TTL) {
    logger.log(`[OSM] A usar cache local para [${lat}, ${lng}] (evita novo pedido)`);
    return cached.data;
  }

  try {
    // Pede ao nosso próprio servidor, que trata do Overpass do lado de lá — sem CORS,
    // sem espelhos bloqueados pelo browser, sem martelar 5-9 servidores a partir daqui.
    const response = await fetch(`/api/emergency-pois?lat=${lat}&lng=${lng}&radius=${radiusKm}`, {
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Servidor respondeu ${response.status}`);
    const data = await response.json();

    if (!data.elements || data.elements.length === 0) {
      if (data.allMirrorsFailed || data.circuitBreakerActive) {
        logger.warn('[EmergencyService] O servidor não conseguiu dados reais — a usar base offline.');
      }
      const fallback = getOfflineFallbackPOIs(lat, lng);
      poiCache.set(key, { data: fallback, timestamp: Date.now() });
      return fallback;
    }

    const results: EmergencyPOI[] = data.elements.map((el: any) => ({
      ...el,
      name: el.name || (
        el.type === 'hospital' ? 'Hospital' :
        el.type === 'police' ? 'Esquadra' :
        el.type === 'fire' ? 'Quartel de Bombeiros' :
        el.type === 'health_center' ? 'Centro de Saúde' :
        el.type === 'health_post' ? 'Posto de Saúde' :
        el.type === 'municipality' ? 'Instituição Local' :
        el.type === 'social' ? 'Apoio Social / Lar' :
        'Ponto de Emergência'
      )
    }));

    poiCache.set(key, { data: results, timestamp: Date.now() });
    return results;
  } catch (error) {
    logger.warn('[EmergencyService] Falha ao contactar o servidor para pontos de emergência:', error);
    const fallback = getOfflineFallbackPOIs(lat, lng);
    poiCache.set(key, { data: fallback, timestamp: Date.now() });
    return fallback;
  }
}

function getOfflineFallbackPOIs(lat: number, lng: number): EmergencyPOI[] {
  logger.warn(`[EmergencyService] Sem dados reais disponíveis para [${lat}, ${lng}] — a devolver ESTIMATIVAS não confirmadas.`);

  // IMPORTANTE: estas posições são apenas uma direção aproximada relativa à localização do
  // utilizador, geradas localmente — NÃO são locais reais verificados. Os nomes deixam isso
  // claro de propósito, para nunca dar a entender que é um resultado confirmado.
  const fallbackPOIs: EmergencyPOI[] = [
    {
      id: "fallback-hospital",
      name: "Hospital mais próximo (estimativa não confirmada)",
      type: "hospital",
      location: { lat: lat + 0.0112, lng: lng - 0.0134 },
      address: "Sem dados confirmados — ligue 112 para confirmar o local exato",
      isEstimate: true
    },
    {
      id: "fallback-health-center-1",
      name: "Centro de Saúde (estimativa não confirmada)",
      type: "health_center",
      location: { lat: lat - 0.0031, lng: lng + 0.0045 },
      address: "Sem dados confirmados — ligue 112 ou SNS 24 para confirmar o local exato",
      isEstimate: true
    },
    {
      id: "fallback-health-post",
      name: "Posto de Saúde (estimativa não confirmada)",
      type: "health_post",
      location: { lat: lat + 0.0068, lng: lng - 0.0072 },
      address: "Sem dados confirmados",
      isEstimate: true
    },
    {
      id: "fallback-police",
      name: "Esquadra/Posto policial (estimativa não confirmada)",
      type: "police",
      location: { lat: lat - 0.0054, lng: lng - 0.0049 },
      address: "Sem dados confirmados — ligue 112 para confirmar o local exato",
      isEstimate: true
    },
    {
      id: "fallback-fire-1",
      name: "Bombeiros (estimativa não confirmada)",
      type: "fire",
      location: { lat: lat + 0.0019, lng: lng + 0.0084 },
      address: "Sem dados confirmados — ligue 112 para confirmar o local exato",
      isEstimate: true
    },
    {
      id: "fallback-municipality",
      name: "Câmara Municipal / Proteção Civil (estimativa não confirmada)",
      type: "municipality",
      location: { lat: lat + 0.0006, lng: lng + 0.0011 },
      address: "Sem dados confirmados",
      isEstimate: true
    },
    {
      id: "fallback-shelter",
      name: "Possível ponto de encontro (estimativa não confirmada)",
      type: "shelter",
      location: { lat: lat - 0.0092, lng: lng + 0.0104 },
      address: "Sem dados confirmados",
      isEstimate: true
    },
    {
      id: "fallback-social",
      name: "Apoio social (estimativa não confirmada)",
      type: "social",
      location: { lat: lat + 0.0042, lng: lng - 0.0021 },
      address: "Sem dados confirmados",
      isEstimate: true
    }
  ];

  return fallbackPOIs;
}

