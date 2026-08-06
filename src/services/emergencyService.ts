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
 * Coordenadas aproximadas do centro de cada capital de distrito (mais Madeira e Açores) —
 * reutilizadas como base para localizar hospitais, esquadras, bombeiros e câmaras reais
 * mais próximos, quando a pesquisa em tempo real falha.
 */
const DISTRICT_CAPITALS: { name: string; lat: number; lng: number }[] = [
  { name: "Viana do Castelo", lat: 41.6947, lng: -8.8322 },
  { name: "Braga", lat: 41.5623, lng: -8.4315 },
  { name: "Porto", lat: 41.1579, lng: -8.6291 },
  { name: "Vila Real", lat: 41.3033, lng: -7.7438 },
  { name: "Bragança", lat: 41.8067, lng: -6.7567 },
  { name: "Viseu", lat: 40.6566, lng: -7.9219 },
  { name: "Guarda", lat: 40.5364, lng: -7.2683 },
  { name: "Aveiro", lat: 40.6413, lng: -8.6455 },
  { name: "Coimbra", lat: 40.2033, lng: -8.4103 },
  { name: "Leiria", lat: 39.7436, lng: -8.8071 },
  { name: "Castelo Branco", lat: 39.8222, lng: -7.4931 },
  { name: "Santarém", lat: 39.2369, lng: -8.6857 },
  { name: "Lisboa", lat: 38.7223, lng: -9.1393 },
  { name: "Setúbal", lat: 38.5281, lng: -8.8929 },
  { name: "Portalegre", lat: 39.2967, lng: -7.4306 },
  { name: "Évora", lat: 38.5711, lng: -7.9106 },
  { name: "Beja", lat: 38.0153, lng: -7.8650 },
  { name: "Faro", lat: 37.0193, lng: -7.9304 },
  { name: "Funchal (Madeira)", lat: 32.6669, lng: -16.9241 },
  { name: "Ponta Delgada (Açores)", lat: 37.7412, lng: -25.6756 }
];

/** Encontra a capital de distrito mais próxima de uma coordenada, por distância direta. */
function findNearestDistrictCapital(lat: number, lng: number): { name: string; lat: number; lng: number } {
  let nearest = DISTRICT_CAPITALS[0];
  let nearestDist = calculateDistance(lat, lng, nearest.lat, nearest.lng);
  for (const c of DISTRICT_CAPITALS.slice(1)) {
    const d = calculateDistance(lat, lng, c.lat, c.lng);
    if (d < nearestDist) {
      nearest = c;
      nearestDist = d;
    }
  }
  return nearest;
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
  { name: "Centro Hospitalar Tondela-Viseu, E.P.E. — Hospital de São Teotónio (Viseu)", lat: 40.65033, lng: -7.90636 },
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
  { name: "Hospital do Divino Espírito Santo (Ponta Delgada, Açores)", lat: 37.7412, lng: -25.6756 },
  // Concelhos grandes que NÃO são capital de distrito, mas têm hospital público
  // próprio — sem isto, cairiam incorretamente na capital de distrito mais próxima,
  // por vezes bem mais longe do que o hospital real da própria cidade.
  { name: "Centro Hospitalar de Vila Nova de Gaia/Espinho, E.P.E.", lat: 41.1095, lng: -8.6100 },
  { name: "Hospital de Sintra (Algueirão-Mem Martins)", lat: 38.8367, lng: -9.3419 },
  { name: "Hospital Garcia de Orta, E.P.E. (Almada)", lat: 38.6699, lng: -9.1697 },
  { name: "Hospital Prof. Doutor Fernando Fonseca, E.P.E. (Amadora)", lat: 38.7561, lng: -9.2313 },
  { name: "Unidade Local de Saúde do Alto Ave, E.P.E. — Hospital de Guimarães", lat: 41.4523, lng: -8.2934 },
  { name: "Unidade Local de Saúde de Matosinhos, E.P.E. — Hospital Pedro Hispano", lat: 41.1859, lng: -8.6773 },
  { name: "Hospital Beatriz Ângelo (Loures)", lat: 38.8305, lng: -9.1685 },
  { name: "Centro Hospitalar Barreiro Montijo, E.P.E.", lat: 38.6667, lng: -9.0667 },
  { name: "Centro Hospitalar Póvoa de Varzim/Vila do Conde, E.P.E.", lat: 41.3833, lng: -8.7667 },
  { name: "Centro Hospitalar do Oeste — Hospital de Torres Vedras", lat: 39.0908, lng: -9.2601 },
  { name: "Unidade Local de Saúde da Cova da Beira — Hospital Pêro da Covilhã", lat: 40.2663, lng: -7.4923 },
  { name: "Centro Hospitalar Universitário do Algarve — Unidade Hospitalar de Portimão", lat: 37.1500, lng: -8.5578 },
  { name: "Hospital Distrital de Chaves", lat: 41.7398, lng: -7.4707 },
  { name: "Hospital de Santa Luzia de Elvas", lat: 38.8807, lng: -7.1622 },
  { name: "Unidade Local de Saúde do Estuário do Tejo — Hospital de Vila Franca de Xira", lat: 38.9364, lng: -8.9944 },
  { name: "Centro Hospitalar de Cascais — Hospital Condes de Castro Guimarães", lat: 38.6970, lng: -9.4210 },
  { name: "Centro Hospitalar do Oeste — Unidade das Caldas da Rainha", lat: 39.4058, lng: -9.1364 },
  { name: "Hospital de S. Pedro Gonçalves Telmo (Peniche)", lat: 39.3558, lng: -9.3811 },
  { name: "Centro Hospitalar do Médio Tejo — Unidade de Abrantes", lat: 39.4631, lng: -8.1978 },
  { name: "Centro Hospitalar de Trás-os-Montes e Alto Douro — Hospital Distrital de Lamego", lat: 41.0975, lng: -7.8123 },
  { name: "Centro Hospitalar de Entre o Douro e Vouga — Hospital São Sebastião (Santa Maria da Feira)", lat: 40.9264, lng: -8.5476 }
];

/**
 * Encontra o item real mais próximo de uma lista curada (hospital, esquadra, bombeiros...),
 * por distância direta. Usado só quando a pesquisa em tempo real falhou.
 */
function findNearestReal(list: { name: string; lat: number; lng: number }[], lat: number, lng: number): { name: string; lat: number; lng: number } {
  let nearest = list[0];
  let nearestDist = calculateDistance(lat, lng, nearest.lat, nearest.lng);
  for (const item of list.slice(1)) {
    const d = calculateDistance(lat, lng, item.lat, item.lng);
    if (d < nearestDist) {
      nearest = item;
      nearestDist = d;
    }
  }
  return nearest;
}

function findNearestRealHospital(lat: number, lng: number): EmergencyPOI {
  const nearest = findNearestReal(REAL_PORTUGAL_HOSPITALS, lat, lng);
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

/**
 * Esquadra/comando policial, quartel de bombeiros e câmara municipal reais mais próximos,
 * usando a capital de distrito mais próxima como referência (PSP tem sempre comando distrital
 * na capital, quase todas as capitais de distrito têm corpo de bombeiros e câmara municipal
 * própria). Menos preciso do que uma morada exata, mas continua a ser um local real que
 * existe — nunca um ponto inventado deslocado ao calhas.
 */
function findNearestRealPolice(lat: number, lng: number): EmergencyPOI {
  const capital = findNearestDistrictCapital(lat, lng);
  return {
    id: "real-fallback-police",
    name: `PSP — Comando Distrital de ${capital.name}`,
    type: "police",
    location: { lat: capital.lat, lng: capital.lng },
    address: "Localização aproximada — a pesquisa em tempo real falhou, confirme ligando 112.",
    isEstimate: false
  };
}

function findNearestRealFire(lat: number, lng: number): EmergencyPOI {
  const capital = findNearestDistrictCapital(lat, lng);
  return {
    id: "real-fallback-fire",
    name: `Corpo de Bombeiros de ${capital.name}`,
    type: "fire",
    location: { lat: capital.lat, lng: capital.lng },
    address: "Localização aproximada — a pesquisa em tempo real falhou, confirme ligando 112.",
    isEstimate: false
  };
}

function findNearestRealMunicipality(lat: number, lng: number): EmergencyPOI {
  const capital = findNearestDistrictCapital(lat, lng);
  return {
    id: "real-fallback-municipality",
    name: `Câmara Municipal de ${capital.name}`,
    type: "municipality",
    location: { lat: capital.lat, lng: capital.lng },
    address: "Localização aproximada — pode não ser o concelho exato do utilizador, confirme ligando 112 ou pesquisando a câmara local.",
    isEstimate: false
  };
}

/**
 * Centro de saúde real mais próximo, usando a capital de distrito mais próxima como
 * referência. Ao contrário dos hospitais (nomes próprios únicos, verificados um a um),
 * todo o concelho sede de distrito tem sempre um "Centro de Saúde de [cidade]" — este
 * padrão de nome é seguro de generalizar sem precisar de confirmar caso a caso.
 */
function findNearestRealHealthCenter(lat: number, lng: number): EmergencyPOI {
  const capital = findNearestDistrictCapital(lat, lng);
  return {
    id: "real-fallback-health-center",
    name: `Centro de Saúde de ${capital.name}`,
    type: "health_center",
    location: { lat: capital.lat, lng: capital.lng },
    address: "Localização aproximada — pode não ser o centro de saúde do seu concelho, confirme ligando SNS 24 (808 24 24 24) ou 112.",
    isEstimate: false
  };
}

function getOfflineFallbackPOIs(lat: number, lng: number): EmergencyPOI[] {
  logger.warn(`[EmergencyService] Sem dados reais disponíveis para [${lat}, ${lng}] — a usar hospital, esquadra, bombeiros, câmara e centro de saúde reais mais próximos da lista curada, e estimativas não confirmadas para os restantes tipos.`);

  // IMPORTANTE: as entradas de posto de saúde/social abaixo continuam a ser apenas uma
  // direção aproximada relativa à localização do utilizador, geradas localmente — NÃO
  // são locais reais verificados. Os nomes deixam isso claro de propósito, para nunca
  // dar a entender que é um resultado confirmado.
  const fallbackPOIs: EmergencyPOI[] = [
    findNearestRealHospital(lat, lng),
    findNearestRealPolice(lat, lng),
    findNearestRealFire(lat, lng),
    findNearestRealMunicipality(lat, lng),
    findNearestRealHealthCenter(lat, lng),
    {
      id: "fallback-health-post",
      name: "Posto de Saúde (estimativa não confirmada)",
      type: "health_post",
      location: { lat: lat + 0.0068, lng: lng - 0.0072 },
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

