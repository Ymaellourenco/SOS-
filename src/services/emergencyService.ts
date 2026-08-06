import { logger } from '../lib/logger';
import { calculateDistance } from '../lib/utils';
/**
 * Service to fetch real-world Emergency POIs from OpenStreetMap using Overpass API
 */

export interface EmergencyPOI {
  id: string;
  name: string;
  type: 'hospital' | 'health_center' | 'health_post' | 'police' | 'fire' | 'municipality' | 'sos' | 'shelter' | 'social';
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

/**
 * Lista curada de hospitais públicos (SNS) reais em Portugal — um por distrito, mais
 * Madeira e Açores. Nomes oficiais confirmados na lista pública do Infarmed
 * ("Lista de Estabelecimentos Hospitalares Públicos e Privados"). Usada como último
 * recurso apenas quando a pesquisa em tempo real (Overpass/OpenStreetMap) falha por
 * completo. Ao contrário do antigo "fallback-hospital" (uma posição inventada,
 * deslocada aleatoriamente a partir do utilizador), estes são hospitais reais com
 * nome e localização verdadeiros — nunca perfeitos ao metro, mas nunca fictícios.
 * Em emergência, um hospital real a alguns km de distância errada vale sempre mais
 * do que "não há dados" ou um ponto que não existe.
 */
const REAL_PORTUGAL_HOSPITALS: { name: string; lat: number; lng: number }[] = [
  { name: "Unidade Local de Saúde do Alto Minho, E.P.E. (Viana do Castelo)", lat: 41.6947, lng: -8.8322 },
  { name: "Hospital de Braga (Largo Carlos Amarante)", lat: 41.5623, lng: -8.4315 },
  { name: "Centro Hospitalar de São João, E.P.E. (Porto)", lat: 41.1815, lng: -8.6024 },
  { name: "Centro Hospitalar Universitário de Santo António (Porto)", lat: 41.1536, lng: -8.6103 },
  { name: "Centro Hospitalar de Trás-os-Montes e Alto Douro, E.P.E. (Vila Real)", lat: 41.3033, lng: -7.7438 },
  { name: "Unidade Local de Saúde do Nordeste, E.P.E. (Bragança)", lat: 41.8067, lng: -6.7567 },
  { name: "Centro Hospitalar Tondela-Viseu, E.P.E. — Hospital de São Teotónio (Viseu)", lat: 40.6566, lng: -7.9219 },
  { name: "Unidade Local de Saúde da Guarda, E.P.E.", lat: 40.5364, lng: -7.2683 },
  { name: "Centro Hospitalar de Baixo Vouga, E.P.E. (Aveiro)", lat: 40.6413, lng: -8.6455 },
  { name: "Centro Hospitalar e Universitário de Coimbra, E.P.E.", lat: 40.1998, lng: -8.4194 },
  { name: "Centro Hospitalar de Leiria, E.P.E.", lat: 39.7436, lng: -8.8071 },
  { name: "Unidade Local Saúde de Castelo Branco, E.P.E.", lat: 39.8222, lng: -7.4931 },
  { name: "Hospital Distrital de Santarém, E.P.E.", lat: 39.2369, lng: -8.6857 },
  { name: "Centro Hospitalar Lisboa Norte, E.P.E. — Hospital de Santa Maria (Lisboa)", lat: 38.7489, lng: -9.1607 },
  { name: "Centro Hospitalar de Setúbal, E.P.E.", lat: 38.5281, lng: -8.8929 },
  { name: "Unidade Local de Saúde do Norte Alentejano, E.P.E. (Portalegre)", lat: 39.2967, lng: -7.4306 },
  { name: "Hospital do Espírito Santo - Évora, E.P.E.", lat: 38.5711, lng: -7.9106 },
  { name: "Unidade Local de Saúde do Baixo Alentejo, E.P.E. (Beja)", lat: 38.0153, lng: -7.8650 },
  { name: "Centro Hospitalar e Universitário do Algarve, E.P.E. (Faro)", lat: 37.0367, lng: -7.9308 },
  { name: "Hospital Dr. Nélio Mendonça (Funchal, Madeira)", lat: 32.6483, lng: -16.9153 },
  { name: "Hospital do Divino Espírito Santo (Ponta Delgada, Açores)", lat: 37.7412, lng: -25.6756 }
];

/**
 * Encontra o hospital real mais próximo desta lista curada, por distância direta.
 * Usado só quando a pesquisa em tempo real falhou — nunca substitui a pesquisa real
 * quando esta funciona, porque a lista tem só ~20 hospitais principais (não todos).
 */
function findNearestRealHospital(lat: number, lng: number): EmergencyPOI {
  let nearest = REAL_PORTUGAL_HOSPITALS[0];
  let nearestDist = calculateDistance(lat, lng, nearest.lat, nearest.lng);
  for (const h of REAL_PORTUGAL_HOSPITALS.slice(1)) {
    const d = calculateDistance(lat, lng, h.lat, h.lng);
    if (d < nearestDist) {
      nearest = h;
      nearestDist = d;
    }
  }
  return {
    id: "real-fallback-hospital",
    name: nearest.name,
    type: "hospital",
    location: { lat: nearest.lat, lng: nearest.lng },
    address: "Localização aproximada do hospital — a pesquisa em tempo real falhou, confirme a morada exata ligando 112 ou pesquisando o nome.",
    // Não é isEstimate: é um hospital real, só que a posição é a do hospital em si
    // (não confirmada por uma pesquisa Overpass ao minuto). Continua a ser dado real,
    // ao contrário da antiga estimativa deslocada aleatoriamente.
    isEstimate: false
  };
}

function getOfflineFallbackPOIs(lat: number, lng: number): EmergencyPOI[] {
  logger.warn(`[EmergencyService] Sem dados reais disponíveis para [${lat}, ${lng}] — a usar o hospital público real mais próximo da lista curada, e estimativas não confirmadas para os restantes tipos.`);

  // IMPORTANTE: estas posições (exceto o hospital, ver acima) são apenas uma direção
  // aproximada relativa à localização do utilizador, geradas localmente — NÃO são locais
  // reais verificados. Os nomes deixam isso claro de propósito, para nunca dar a entender
  // que é um resultado confirmado.
  const fallbackPOIs: EmergencyPOI[] = [
    findNearestRealHospital(lat, lng),
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

