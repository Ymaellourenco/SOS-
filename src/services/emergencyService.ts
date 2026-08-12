import { logger } from '../lib/logger';
import { calculateDistance } from '../lib/utils';
/**
 * Service to fetch real-world Emergency POIs from OpenStreetMap using Overpass API
 */

export interface EmergencyPOI {
  id: string;
  name: string;
  type: 'hospital' | 'health_center' | 'health_post' | 'police' | 'fire' | 'municipality' | 'sos' | 'shelter' | 'social' | 'pharmacy';
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
        el.type === 'pharmacy' ? 'Farmácia' :
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
  { name: "Centro Hospitalar de Trás-os-Montes e Alto Douro, E.P.E. (Vila Real)", lat: 41.310233, lng: -7.760078 },
  { name: "Unidade Local de Saúde do Nordeste, E.P.E. (Bragança)", lat: 41.8067, lng: -6.7567 },
  { name: "Centro Hospitalar Tondela-Viseu, E.P.E. — Hospital de São Teotónio (Viseu)", lat: 40.65033, lng: -7.90636 },
  { name: "Unidade Local de Saúde da Guarda, E.P.E.", lat: 40.533056, lng: -7.274316 },
  { name: "Centro Hospitalar de Baixo Vouga, E.P.E. (Aveiro)", lat: 40.6413, lng: -8.6455 },
  { name: "Centro Hospitalar e Universitário de Coimbra, E.P.E.", lat: 40.1998, lng: -8.4194 },
  { name: "Centro Hospitalar de Leiria, E.P.E.", lat: 39.7436, lng: -8.8071 },
  { name: "Unidade Local Saúde de Castelo Branco, E.P.E.", lat: 39.82275, lng: -7.49985 },
  { name: "Hospital Distrital de Santarém, E.P.E.", lat: 39.2369, lng: -8.6857 },
  { name: "Centro Hospitalar Lisboa Norte, E.P.E. — Hospital de Santa Maria (Lisboa)", lat: 38.7489, lng: -9.1607 },
  { name: "Centro Hospitalar de Setúbal, E.P.E.", lat: 38.5281, lng: -8.8929 },
  // Portalegre e Évora (hospital + PSP, ambos abaixo): não encontrei uma fonte
  // fiável com a coordenada exata do edifício — continuam a usar o centro da
  // cidade (igual à entrada em DISTRICT_CAPITALS) como aproximação. Precisam de
  // verificação manual, tal como a PSP de Viseu precisou.
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
/**
 * Moradas e coordenadas REAIS verificadas para PSP/bombeiros/câmara, por capital de
 * distrito — usadas em vez do centro genérico da cidade quando disponíveis. Ainda por
 * preencher para a maioria dos distritos (ver nota abaixo); começou por Viseu, a
 * cidade mais testada até agora.
 */
const REAL_POLICE_BY_CAPITAL: Record<string, { name: string; lat: number; lng: number }> = {
  // Coordenada corrigida (Ago 2026): a anterior (40.6595, -7.9128) caía perto da
  // Porta do Soar (muralha histórica), não no edifício da PSP — confirmado por um
  // utilizador que abriu a navegação real e viu o pin no monumento errado. Esta
  // atualiza para perto do Largo Dom António Alves Martins, na mesma rua — mais
  // próxima do edifício real, mas ainda vale a pena confirmar no terreno/Google Maps.
  "Viseu": { name: "PSP — Comando Distrital de Viseu (Rua D. António Alves Martins)", lat: 40.656024, lng: -7.911622 },
  "Lisboa": { name: "PSP — Comando Metropolitano de Lisboa (Av. de Moscavide, Moscavide)", lat: 38.7727, lng: -9.1006 },
  "Porto": { name: "PSP — Comando Metropolitano do Porto (Largo 1º de Dezembro)", lat: 41.1543, lng: -8.6094 },
  "Braga": { name: "PSP — Comando Distrital de Braga (Largo de São Tiago)", lat: 41.5498, lng: -8.4265 },
  "Aveiro": { name: "PSP — Comando Distrital de Aveiro (Praça Marquês de Pombal)", lat: 40.6413, lng: -8.6534 },
  "Beja": { name: "PSP — Comando Distrital de Beja (Rua D. Nuno Álvares Pereira)", lat: 38.0169, lng: -7.8632 },
  "Bragança": { name: "PSP — Comando Distrital de Bragança (Rua Dr. Manuel Bento)", lat: 41.8074, lng: -6.7568 },
  // Castelo Branco, Guarda e Portalegre: sem fonte fiável com a coordenada exata
  // do edifício da PSP — continuam a usar o centro da cidade como aproximação
  // (mesma ressalva que a Évora, acima). Precisam de verificação manual.
  "Castelo Branco": { name: "PSP — Comando Distrital de Castelo Branco (EN18, Cruz do Montalvão)", lat: 39.8222, lng: -7.4931 },
  "Coimbra": { name: "PSP — Comando Distrital de Coimbra (Rua Olímpio Nicolau Rui Fernandes)", lat: 40.2111, lng: -8.4291 },
  "Évora": { name: "PSP — Comando Distrital de Évora (Rua Francisco Soares Lusitano)", lat: 38.5711, lng: -7.9106 },
  "Faro": { name: "PSP — Comando Distrital de Faro (Rua da Polícia de Segurança Pública)", lat: 37.0193, lng: -7.9304 },
  "Guarda": { name: "PSP — Comando Distrital da Guarda (Largo Frei Pedro da Guarda)", lat: 40.5364, lng: -7.2683 },
  "Leiria": { name: "PSP — Comando Distrital de Leiria (Largo de São Pedro)", lat: 39.7424, lng: -8.8055 },
  "Portalegre": { name: "PSP — Comando Distrital de Portalegre (Praça da República)", lat: 39.2967, lng: -7.4306 },
  "Setúbal": { name: "PSP — Comando Distrital de Setúbal (Av. Luísa Todi)", lat: 38.5245, lng: -8.8912 },
  "Viana do Castelo": { name: "PSP — Comando Distrital de Viana do Castelo (Rua de Aveiro)", lat: 41.6932, lng: -8.8330 },
  // Coordenada corrigida (Ago 2026): fonte com morada e GPS reais confirmados
  // (discoverdouro.pt) — antes partilhava a mesma coordenada do hospital de
  // Vila Real (erro de "centro da cidade" copiado para os dois).
  "Vila Real": { name: "PSP — Comando Distrital de Vila Real (EN2, Almodena)", lat: 41.295372, lng: -7.755435 }
};
const REAL_FIRE_BY_CAPITAL: Record<string, { name: string; lat: number; lng: number }> = {
  // Coordenada corrigida (Ago 2026): o quartel dos Bombeiros Sapadores de Viseu
  // MUDOU-SE em 2019 para a Avenida do Aeródromo, em Lordosa (~7km do centro,
  // junto ao Aeródromo Municipal Gonçalves Lobato) — mas nem esta lista curada
  // nem a pesquisa Overpass em tempo real (que ainda aponta para a morada antiga,
  // Praça D. João I / perto do centro) refletem essa mudança. Ou seja: mesmo a
  // fonte "ao vivo" pode estar desatualizada, não só a lista estática. Coordenada
  // abaixo é uma aproximação da zona do aeródromo — vale a pena confirmar no
  // terreno antes de confiar cegamente, tal como as outras entradas revistas.
  // NOTA para o verify-curated-locations.mjs: isto vai aparecer como "REVER" por
  // estar a >5km do centro da cidade — é esperado e correto, não é um erro novo.
  "Viseu": { name: "Bombeiros Sapadores de Viseu (Av. do Aeródromo, Lordosa)", lat: 40.7256, lng: -7.8892 },
  "Lisboa": { name: "Regimento de Sapadores Bombeiros de Lisboa (Av. Dom Carlos I)", lat: 38.7083, lng: -9.1556 },
  "Porto": { name: "Regimento de Sapadores Bombeiros do Porto (Rua da Constituição)", lat: 41.1580, lng: -8.6180 },
  "Braga": { name: "Bombeiros Voluntários de Braga (Largo Paulo Orósio)", lat: 41.5478, lng: -8.4213 },
  "Évora": { name: "Bombeiros Voluntários de Évora (Avª. Bombeiros Voluntários)", lat: 38.5731, lng: -7.9042 }
};

/**
 * Devolve a esquadra PSP real mais próxima -- ou null se não houver morada verificada
 * para o distrito do utilizador. NUNCA inventa um ponto no centro da cidade: é
 * preferível não mostrar nada a mostrar um local que pode não existir.
 */
function findNearestRealPolice(lat: number, lng: number): EmergencyPOI | null {
  const capital = findNearestDistrictCapital(lat, lng);
  const real = REAL_POLICE_BY_CAPITAL[capital.name];
  if (!real) return null;
  return {
    id: "real-fallback-police",
    name: real.name,
    type: "police",
    location: { lat: real.lat, lng: real.lng },
    address: "Localização real verificada — se a pesquisa em tempo real falhou, confirme ligando 112.",
    isEstimate: false
  };
}

/**
 * Devolve o quartel de bombeiros real mais próximo -- ou null se não houver morada
 * verificada para o distrito do utilizador. NUNCA inventa um ponto no centro da
 * cidade: é preferível não mostrar nada a mostrar um local que pode não existir.
 */
function findNearestRealFire(lat: number, lng: number): EmergencyPOI | null {
  const capital = findNearestDistrictCapital(lat, lng);
  const real = REAL_FIRE_BY_CAPITAL[capital.name];
  if (!real) return null;
  return {
    id: "real-fallback-fire",
    name: real.name,
    type: "fire",
    location: { lat: real.lat, lng: real.lng },
    address: "Localização real verificada — se a pesquisa em tempo real falhou, confirme ligando 112.",
    isEstimate: false
  };
}

/**
 * Câmaras municipais REAIS, geocodificadas via Nominatim a partir da lista oficial
 * da DGAV ("Lista_Camaras-Municipais.pdf"). Cobre 284 dos 308 concelhos de Portugal
 * (as restantes 24 continuam sem correspondência confirmada).
 * Fora desta cobertura, cai na aproximação por capital de distrito abaixo.
 */
const REAL_MUNICIPALITIES: { concelho: string; name: string; lat: number; lng: number }[] = [
  { concelho: "Albergaria-a-Velha", name: "Câmara Municipal de Albergaria-a-Velha", lat: 40.69095, lng: -8.48019 },
  { concelho: "Albufeira", name: "Câmara Municipal de Albufeira", lat: 37.09009, lng: -8.24584 },
  { concelho: "Alcácer do Sal", name: "Câmara Municipal de Alcácer do Sal", lat: 38.37087, lng: -8.51275 },
  { concelho: "Alcobaça", name: "Câmara Municipal de Alcobaça", lat: 39.55239, lng: -8.97653 },
  { concelho: "Alcoutim", name: "Câmara Municipal de Alcoutim", lat: 37.4715, lng: -7.47167 },
  { concelho: "Alfândega da Fé", name: "Câmara Municipal de Alfândega da Fé", lat: 41.34208, lng: -6.9631 },
  { concelho: "Anadia", name: "Câmara Municipal de Anadia", lat: 40.44276, lng: -8.43562 },
  { concelho: "Arruda dos Vinhos", name: "Câmara Municipal de Arruda dos Vinhos", lat: 38.98323, lng: -9.07736 },
  { concelho: "Avis", name: "Câmara Municipal de Avis", lat: 39.05594, lng: -7.88936 },
  { concelho: "Borba", name: "Câmara Municipal de Borba", lat: 38.8056, lng: -7.45427 },
  { concelho: "Boticas", name: "Câmara Municipal de Boticas", lat: 41.68723, lng: -7.6681 },
  { concelho: "Cadaval", name: "Câmara Municipal de Cadaval", lat: 39.23937, lng: -9.10149 },
  { concelho: "Carrazeda de Ansiães", name: "Câmara Municipal de Carrazeda de Ansiães", lat: 41.24261, lng: -7.30633 },
  { concelho: "Cartaxo", name: "Câmara Municipal de Cartaxo", lat: 39.08203, lng: -8.75913 },
  { concelho: "Castanheira de Pera", name: "Câmara Municipal de Castanheira de Pera", lat: 40.00594, lng: -8.21135 },
  { concelho: "Castro Daire", name: "Câmara Municipal de Castro Daire", lat: 40.89813, lng: -7.93317 },
  { concelho: "Castro Verde", name: "Câmara Municipal de Castro Verde", lat: 37.69818, lng: -8.08204 },
  { concelho: "Chamusca", name: "Câmara Municipal de Chamusca", lat: 39.3569, lng: -8.4841 },
  { concelho: "Cinfães", name: "Câmara Municipal de Cinfães", lat: 41.07491, lng: -8.0954 },
  { concelho: "Constância", name: "Câmara Municipal de Constância", lat: 39.47652, lng: -8.33932 },
  { concelho: "Ferreira do Alentejo", name: "Câmara Municipal de Ferreira do Alentejo", lat: 38.05845, lng: -8.11656 },
  { concelho: "Figueira de Castelo Rodrigo", name: "Câmara Municipal de Figueira de Castelo Rodrigo", lat: 40.95224, lng: -7.05466 },
  { concelho: "Fornos de Algodres", name: "Câmara Municipal de Fornos de Algodres", lat: 40.62032, lng: -7.53924 },
  { concelho: "Freixo de Espada à Cinta", name: "Câmara Municipal de Freixo de Espada à Cinta", lat: 41.08965, lng: -6.80817 },
  { concelho: "Gouveia", name: "Câmara Municipal de Gouveia", lat: 40.49513, lng: -7.59145 },
  { concelho: "Lagos", name: "Câmara Municipal de Lagos", lat: 37.10287, lng: -8.67272 },
  { concelho: "Lamego", name: "Câmara Municipal de Lamego", lat: 41.10098, lng: -7.80982 },
  { concelho: "Lourinhã", name: "Câmara Municipal de Lourinhã", lat: 39.24208, lng: -9.3133 },
  { concelho: "Lousada", name: "Câmara Municipal de Lousada", lat: 41.27682, lng: -8.28206 },
  { concelho: "Mação", name: "Câmara Municipal de Mação", lat: 39.55664, lng: -7.9958 },
  { concelho: "Macedo de Cavaleiros", name: "Câmara Municipal de Macedo de Cavaleiros", lat: 41.5386, lng: -6.96077 },
  { concelho: "Maia", name: "Câmara Municipal de Maia", lat: 41.34061, lng: -8.67351 },
  { concelho: "Marco de Canaveses", name: "Câmara Municipal de Marco de Canaveses", lat: 41.1859, lng: -8.14933 },
  { concelho: "Mealhada", name: "Câmara Municipal de Mealhada", lat: 40.37713, lng: -8.45332 },
  { concelho: "Mêda", name: "Câmara Municipal de Mêda", lat: 40.96336, lng: -7.26139 },
  { concelho: "Miranda do Corvo", name: "Câmara Municipal de Miranda do Corvo", lat: 40.09307, lng: -8.33272 },
  { concelho: "Moimenta da Beira", name: "Câmara Municipal de Moimenta da Beira", lat: 40.97977, lng: -7.6135 },
  { concelho: "Monção", name: "Câmara Municipal de Monção", lat: 42.07848, lng: -8.48061 },
  { concelho: "Montalegre", name: "Câmara Municipal de Montalegre", lat: 41.82319, lng: -7.79185 },
  { concelho: "Mortágua", name: "Câmara Municipal de Mortágua", lat: 40.39694, lng: -8.22921 },
  { concelho: "Nelas", name: "Câmara Municipal de Nelas", lat: 40.53398, lng: -7.85196 },
  { concelho: "Oliveira de Frades", name: "Câmara Municipal de Oliveira de Frades", lat: 40.73305, lng: -8.174 },
  { concelho: "Oliveira do Hospital", name: "Câmara Municipal de Oliveira do Hospital", lat: 40.35924, lng: -7.86177 },
  { concelho: "Penacova", name: "Câmara Municipal de Penacova", lat: 40.2699, lng: -8.28118 },
  { concelho: "Penamacor", name: "Câmara Municipal de Penamacor", lat: 40.16808, lng: -7.17164 },
  { concelho: "Penedono", name: "Câmara Municipal de Penedono", lat: 40.98825, lng: -7.39487 },
  { concelho: "Penela", name: "Câmara Municipal de Penela", lat: 40.02985, lng: -8.3899 },
  { concelho: "Pinhel", name: "Câmara Municipal de Pinhel", lat: 40.77598, lng: -7.06334 },
  { concelho: "Portalegre", name: "Câmara Municipal de Portalegre", lat: 39.2949, lng: -7.42913 },
  { concelho: "Ribeira de Pena", name: "Câmara Municipal de Ribeira de Pena", lat: 41.5201, lng: -7.79382 },
  { concelho: "Salvaterra de Magos", name: "Câmara Municipal de Salvaterra de Magos", lat: 39.10618, lng: -8.71285 },
  { concelho: "Sernancelhe", name: "Câmara Municipal de Sernancelhe", lat: 40.89744, lng: -7.49601 },
  { concelho: "Silves", name: "Câmara Municipal de Silves", lat: 37.18896, lng: -8.43998 },
  { concelho: "Sobral de Monte Agraço", name: "Câmara Municipal de Sobral de Monte Agraço", lat: 39.01781, lng: -9.14787 },
  { concelho: "Tabuaço", name: "Câmara Municipal de Tabuaço", lat: 41.11666, lng: -7.56837 },
  { concelho: "Valença", name: "Câmara Municipal de Valença", lat: 42.03086, lng: -8.64519 },
  { concelho: "Valpaços", name: "Câmara Municipal de Valpaços", lat: 41.60971, lng: -7.31212 },
  { concelho: "Vila de Rei", name: "Câmara Municipal de Vila de Rei", lat: 39.6732, lng: -8.14655 },
  { concelho: "Vila do Bispo", name: "Câmara Municipal de Vila do Bispo", lat: 37.08219, lng: -8.91275 },
  { concelho: "Vila Verde", name: "Câmara Municipal de Vila Verde", lat: 41.64859, lng: -8.43672 },
  { concelho: "Vimioso", name: "Câmara Municipal de Vimioso", lat: 41.5837, lng: -6.52814 },
  { concelho: "Vizela", name: "Câmara Municipal de Vizela", lat: 41.37879, lng: -8.31071 },
  { concelho: "Vouzela", name: "Câmara Municipal de Vouzela", lat: 40.72258, lng: -8.10973 },
  { concelho: "Abrantes", name: "Câmara Municipal de Abrantes", lat: 39.46289, lng: -8.19751 },
  { concelho: "Águeda", name: "Câmara Municipal de Águeda", lat: 40.57558, lng: -8.44688 },
  { concelho: "Aguiar da Beira", name: "Câmara Municipal de Aguiar da Beira", lat: 40.81875, lng: -7.54038 },
  { concelho: "Alandroal", name: "Câmara Municipal de Alandroal", lat: 38.70212, lng: -7.40313 },
  { concelho: "Alcanena", name: "Câmara Municipal de Alcanena", lat: 39.45936, lng: -8.66764 },
  { concelho: "Alcochete", name: "Câmara Municipal de Alcochete", lat: 38.75593, lng: -8.96082 },
  { concelho: "Alenquer", name: "Câmara Municipal de Alenquer", lat: 39.05522, lng: -9.00998 },
  { concelho: "Alijó", name: "Câmara Municipal de Alijó", lat: 41.27656, lng: -7.47478 },
  { concelho: "Aljezur", name: "Câmara Municipal de Aljezur", lat: 37.31486, lng: -8.79654 },
  { concelho: "Aljustrel", name: "Câmara Municipal de Aljustrel", lat: 37.87838, lng: -8.16146 },
  { concelho: "Almada", name: "Câmara Municipal de Almada", lat: 38.68313, lng: -9.15765 },
  { concelho: "Almeida", name: "Câmara Municipal de Almeida", lat: 40.72464, lng: -6.90646 },
  { concelho: "Almeirim", name: "Câmara Municipal de Almeirim", lat: 39.20919, lng: -8.62916 },
  { concelho: "Almodôvar", name: "Câmara Municipal de Almodôvar", lat: 37.51065, lng: -8.06162 },
  { concelho: "Alpiarça", name: "Câmara Municipal de Alpiarça", lat: 39.26461, lng: -8.57916 },
  { concelho: "Alter do Chão", name: "Câmara Municipal de Alter do Chão", lat: 39.19827, lng: -7.65605 },
  { concelho: "Alvaiázere", name: "Câmara Municipal de Alvaiázere", lat: 39.82509, lng: -8.38245 },
  { concelho: "Alvito", name: "Câmara Municipal de Alvito", lat: 38.25614, lng: -7.99235 },
  { concelho: "Amadora", name: "Câmara Municipal de Amadora", lat: 38.76137, lng: -9.23598 },
  { concelho: "Amarante", name: "Câmara Municipal de Amarante", lat: 41.2696, lng: -8.07811 },
  { concelho: "Amares", name: "Câmara Municipal de Amares", lat: 41.65952, lng: -8.27082 },
  { concelho: "Angra do Heroísmo", name: "Câmara Municipal de Angra do Heroísmo", lat: 38.65588, lng: -27.21865 },
  { concelho: "Ansião", name: "Câmara Municipal de Ansião", lat: 39.91152, lng: -8.43593 },
  { concelho: "Arcos de Valdevez", name: "Câmara Municipal de Arcos de Valdevez", lat: 41.84633, lng: -8.41799 },
  { concelho: "Arganil", name: "Câmara Municipal de Arganil", lat: 40.21746, lng: -8.0543 },
  { concelho: "Armamar", name: "Câmara Municipal de Armamar", lat: 41.10941, lng: -7.69271 },
  { concelho: "Arouca", name: "Câmara Municipal de Arouca", lat: 40.92871, lng: -8.2434 },
  { concelho: "Arraiolos", name: "Câmara Municipal de Arraiolos", lat: 38.72544, lng: -7.9847 },
  { concelho: "Arronches", name: "Câmara Municipal de Arronches", lat: 39.12182, lng: -7.285 },
  { concelho: "Aveiro", name: "Câmara Municipal de Aveiro", lat: 40.64056, lng: -8.65378 },
  { concelho: "Azambuja", name: "Câmara Municipal de Azambuja", lat: 39.06905, lng: -8.87128 },
  { concelho: "Baião", name: "Câmara Municipal de Baião", lat: 41.16412, lng: -8.03418 },
  { concelho: "Barcelos", name: "Câmara Municipal de Barcelos", lat: 41.5285, lng: -8.62174 },
  { concelho: "Barrancos", name: "Câmara Municipal de Barrancos", lat: 38.12947, lng: -6.97567 },
  { concelho: "Barreiro", name: "Câmara Municipal de Barreiro", lat: 38.66014, lng: -9.07376 },
  { concelho: "Batalha", name: "Câmara Municipal de Batalha", lat: 39.66035, lng: -8.82189 },
  { concelho: "Beja", name: "Câmara Municipal de Beja", lat: 38.01549, lng: -7.86506 },
  { concelho: "Belmonte", name: "Câmara Municipal de Belmonte", lat: 40.35959, lng: -7.34975 },
  { concelho: "Benavente", name: "Câmara Municipal de Benavente", lat: 38.98369, lng: -8.80967 },
  { concelho: "Bombarral", name: "Câmara Municipal de Bombarral", lat: 39.26808, lng: -9.1553 },
  { concelho: "Braga", name: "Câmara Municipal de Braga", lat: 41.55111, lng: -8.42775 },
  { concelho: "Bragança", name: "Câmara Municipal de Bragança", lat: 41.80609, lng: -6.76443 },
  { concelho: "Cabeceiras de Basto", name: "Câmara Municipal de Cabeceiras de Basto", lat: 41.51381, lng: -7.99332 },
  { concelho: "Caldas da Rainha", name: "Câmara Municipal de Caldas da Rainha", lat: 39.40674, lng: -9.13597 },
  { concelho: "Câmara de Lobos", name: "Câmara Municipal de Câmara de Lobos", lat: 32.64862, lng: -16.97848 },
  { concelho: "Caminha", name: "Câmara Municipal de Caminha", lat: 41.87538, lng: -8.83848 },
  { concelho: "Campo Maior", name: "Câmara Municipal de Campo Maior", lat: 39.01248, lng: -7.06872 },
  { concelho: "Cantanhede", name: "Câmara Municipal de Cantanhede", lat: 40.34694, lng: -8.59448 },
  { concelho: "Carregal do Sal", name: "Câmara Municipal de Carregal do Sal", lat: 40.43554, lng: -8.00203 },
  { concelho: "Cascais", name: "Câmara Municipal de Cascais", lat: 38.7326, lng: -9.41037 },
  // Coordenada corrigida (Ago 2026): tinha exatamente a mesma coordenada que o
  // Fundão (erro de copy-paste na fonte original) — atualizada para o centro
  // real de Castelo Branco.
  { concelho: "Castelo Branco", name: "Câmara Municipal de Castelo Branco", lat: 39.8197, lng: -7.4965 },
  { concelho: "Castelo de Paiva", name: "Câmara Municipal de Castelo de Paiva", lat: 41.04106, lng: -8.27195 },
  { concelho: "Castelo de Vide", name: "Câmara Municipal de Castelo de Vide", lat: 39.41528, lng: -7.45487 },
  { concelho: "Castro Marim", name: "Câmara Municipal de Castro Marim", lat: 37.21731, lng: -7.44212 },
  { concelho: "Celorico da Beira", name: "Câmara Municipal de Celorico da Beira", lat: 40.63584, lng: -7.39263 },
  { concelho: "Celorico de Basto", name: "Câmara Municipal de Celorico de Basto", lat: 41.39205, lng: -7.99934 },
  { concelho: "Chaves", name: "Câmara Municipal de Chaves", lat: 41.73991, lng: -7.47145 },
  { concelho: "Coimbra", name: "Câmara Municipal de Coimbra", lat: 40.21106, lng: -8.42918 },
  { concelho: "Condeixa-a-Nova", name: "Câmara Municipal de Condeixa-a-Nova", lat: 40.11294, lng: -8.49934 },
  { concelho: "Coruche", name: "Câmara Municipal de Coruche", lat: 38.95818, lng: -8.52655 },
  { concelho: "Covilhã", name: "Câmara Municipal de Covilhã", lat: 40.28035, lng: -7.50433 },
  { concelho: "Crato", name: "Câmara Municipal de Crato", lat: 39.28523, lng: -7.64542 },
  { concelho: "Cuba", name: "Câmara Municipal de Cuba", lat: 38.16653, lng: -7.89105 },
  { concelho: "Elvas", name: "Câmara Municipal de Elvas", lat: 38.88061, lng: -7.16429 },
  { concelho: "Entroncamento", name: "Câmara Municipal de Entroncamento", lat: 39.46482, lng: -8.46838 },
  { concelho: "Espinho", name: "Câmara Municipal de Espinho", lat: 41.00852, lng: -8.6396 },
  { concelho: "Esposende", name: "Câmara Municipal de Esposende", lat: 41.53113, lng: -8.7804 },
  { concelho: "Estarreja", name: "Câmara Municipal de Estarreja", lat: 40.75182, lng: -8.5702 },
  { concelho: "Estremoz", name: "Câmara Municipal de Estremoz", lat: 38.8429, lng: -7.5861 },
  { concelho: "Évora", name: "Câmara Municipal de Évora", lat: 38.5722, lng: -7.90952 },
  { concelho: "Fafe", name: "Câmara Municipal de Fafe", lat: 41.40704, lng: -8.16428 },
  { concelho: "Faro", name: "Câmara Municipal de Faro", lat: 37.01366, lng: -7.93462 },
  { concelho: "Felgueiras", name: "Câmara Municipal de Felgueiras", lat: 41.36503, lng: -8.1987 },
  { concelho: "Ferreira do Zêzere", name: "Câmara Municipal de Ferreira do Zêzere", lat: 39.69358, lng: -8.29062 },
  { concelho: "Figueira da Foz", name: "Câmara Municipal de Figueira da Foz", lat: 40.14804, lng: -8.85093 },
  { concelho: "Figueiró dos Vinhos", name: "Câmara Municipal de Figueiró dos Vinhos", lat: 39.90251, lng: -8.27564 },
  { concelho: "Fronteira", name: "Câmara Municipal de Fronteira", lat: 39.05686, lng: -7.64771 },
  { concelho: "Funchal", name: "Câmara Municipal de Funchal", lat: 32.65003, lng: -16.90857 },
  { concelho: "Fundão", name: "Câmara Municipal de Fundão", lat: 40.13795, lng: -7.5004 },
  { concelho: "Gavião", name: "Câmara Municipal de Gavião", lat: 39.46508, lng: -7.93262 },
  { concelho: "Góis", name: "Câmara Municipal de Góis", lat: 40.15517, lng: -8.11066 },
  { concelho: "Golegã", name: "Câmara Municipal de Golegã", lat: 39.40228, lng: -8.48925 },
  { concelho: "Gondomar", name: "Câmara Municipal de Gondomar", lat: 41.14435, lng: -8.53667 },
  { concelho: "Grândola", name: "Câmara Municipal de Grândola", lat: 38.17691, lng: -8.57151 },
  // Coordenada corrigida (Ago 2026): tinha exatamente a mesma coordenada que
  // Trancoso (erro de copy-paste na fonte original) — atualizada para o centro
  // real da Guarda.
  { concelho: "Guarda", name: "Câmara Municipal de Guarda", lat: 40.5364, lng: -7.2657 },
  { concelho: "Guimarães", name: "Câmara Municipal de Guimarães", lat: 41.44418, lng: -8.29253 },
  { concelho: "Horta", name: "Câmara Municipal de Horta", lat: 38.53714, lng: -28.6262 },
  { concelho: "Idanha-a-Nova", name: "Câmara Municipal de Idanha-a-Nova", lat: 39.92261, lng: -7.24236 },
  { concelho: "Ílhavo", name: "Câmara Municipal de Ílhavo", lat: 40.60037, lng: -8.66649 },
  { concelho: "Lagoa (Algarve)", name: "Câmara Municipal de Lagoa (Algarve)", lat: 37.13458, lng: -8.45586 },
  { concelho: "Leiria", name: "Câmara Municipal de Leiria", lat: 39.74108, lng: -8.80985 },
  { concelho: "Lisboa", name: "Câmara Municipal de Lisboa", lat: 38.70807, lng: -9.13913 },
  { concelho: "Loulé", name: "Câmara Municipal de Loulé", lat: 37.13858, lng: -8.0218 },
  { concelho: "Loures", name: "Câmara Municipal de Loures", lat: 38.83072, lng: -9.16822 },
  { concelho: "Lousã", name: "Câmara Municipal de Lousã", lat: 40.11055, lng: -8.24618 },
  { concelho: "Machico", name: "Câmara Municipal de Machico", lat: 32.73757, lng: -16.73814 },
  { concelho: "Mafra", name: "Câmara Municipal de Mafra", lat: 38.94104, lng: -9.33248 },
  { concelho: "Mangualde", name: "Câmara Municipal de Mangualde", lat: 40.60477, lng: -7.76133 },
  { concelho: "Manteigas", name: "Câmara Municipal de Manteigas", lat: 40.40138, lng: -7.53724 },
  { concelho: "Marinha Grande", name: "Câmara Municipal de Marinha Grande", lat: 39.74964, lng: -8.93315 },
  { concelho: "Marvão", name: "Câmara Municipal de Marvão", lat: 39.39533, lng: -7.37827 },
  { concelho: "Matosinhos", name: "Câmara Municipal de Matosinhos", lat: 41.18425, lng: -8.68398 },
  { concelho: "Melgaço", name: "Câmara Municipal de Melgaço", lat: 42.11296, lng: -8.25961 },
  { concelho: "Mértola", name: "Câmara Municipal de Mértola", lat: 37.63676, lng: -7.66383 },
  { concelho: "Mesão Frio", name: "Câmara Municipal de Mesão Frio", lat: 41.15847, lng: -7.89169 },
  { concelho: "Mira", name: "Câmara Municipal de Mira", lat: 40.42854, lng: -8.73638 },
  { concelho: "Miranda do Douro", name: "Câmara Municipal de Miranda do Douro", lat: 41.4942, lng: -6.27412 },
  { concelho: "Mirandela", name: "Câmara Municipal de Mirandela", lat: 41.47991, lng: -7.1782 },
  { concelho: "Mogadouro", name: "Câmara Municipal de Mogadouro", lat: 41.34057, lng: -6.71633 },
  { concelho: "Moita", name: "Câmara Municipal de Moita", lat: 38.6531, lng: -8.99334 },
  { concelho: "Monchique", name: "Câmara Municipal de Monchique", lat: 37.32016, lng: -8.55552 },
  { concelho: "Mondim de Basto", name: "Câmara Municipal de Mondim de Basto", lat: 41.41103, lng: -7.95262 },
  { concelho: "Monforte", name: "Câmara Municipal de Monforte", lat: 39.05306, lng: -7.43901 },
  { concelho: "Montemor-o-Novo", name: "Câmara Municipal de Montemor-o-Novo", lat: 38.64665, lng: -8.21844 },
  { concelho: "Montemor-o-Velho", name: "Câmara Municipal de Montemor-o-Velho", lat: 40.17257, lng: -8.68451 },
  { concelho: "Montijo", name: "Câmara Municipal de Montijo", lat: 38.70483, lng: -8.97539 },
  { concelho: "Mora", name: "Câmara Municipal de Mora", lat: 38.94469, lng: -8.16437 },
  { concelho: "Moura", name: "Câmara Municipal de Moura", lat: 38.14294, lng: -7.45021 },
  { concelho: "Mourão", name: "Câmara Municipal de Mourão", lat: 38.38336, lng: -7.34373 },
  { concelho: "Murça", name: "Câmara Municipal de Murça", lat: 41.40803, lng: -7.45392 },
  { concelho: "Murtosa", name: "Câmara Municipal de Murtosa", lat: 40.74991, lng: -8.65011 },
  { concelho: "Nazaré", name: "Câmara Municipal de Nazaré", lat: 39.59929, lng: -9.06864 },
  { concelho: "Nisa", name: "Câmara Municipal de Nisa", lat: 39.51836, lng: -7.64909 },
  { concelho: "Óbidos", name: "Câmara Municipal de Óbidos", lat: 39.36081, lng: -9.15733 },
  { concelho: "Odemira", name: "Câmara Municipal de Odemira", lat: 37.59629, lng: -8.64196 },
  { concelho: "Odivelas", name: "Câmara Municipal de Odivelas", lat: 38.79071, lng: -9.17783 },
  { concelho: "Oeiras", name: "Câmara Municipal de Oeiras", lat: 38.69272, lng: -9.31433 },
  { concelho: "Oleiros", name: "Câmara Municipal de Oleiros", lat: 39.9188, lng: -7.91416 },
  { concelho: "Olhão", name: "Câmara Municipal de Olhão", lat: 37.02495, lng: -7.84171 },
  { concelho: "Oliveira de Azeméis", name: "Câmara Municipal de Oliveira de Azeméis", lat: 40.88481, lng: -8.41432 },
  { concelho: "Oliveira do Bairro", name: "Câmara Municipal de Oliveira do Bairro", lat: 41.16449, lng: -8.57321 },
  { concelho: "Ourém", name: "Câmara Municipal de Ourém", lat: 39.6582, lng: -8.57874 },
  { concelho: "Ourique", name: "Câmara Municipal de Ourique", lat: 37.65233, lng: -8.22615 },
  { concelho: "Ovar", name: "Câmara Municipal de Ovar", lat: 40.85917, lng: -8.6253 },
  { concelho: "Paços de Ferreira", name: "Câmara Municipal de Paços de Ferreira", lat: 41.27613, lng: -8.37679 },
  { concelho: "Palmela", name: "Câmara Municipal de Palmela", lat: 38.56744, lng: -8.89879 },
  { concelho: "Pampilhosa da Serra", name: "Câmara Municipal de Pampilhosa da Serra", lat: 40.04761, lng: -7.95485 },
  { concelho: "Paredes", name: "Câmara Municipal de Paredes", lat: 41.20822, lng: -8.33275 },
  { concelho: "Paredes de Coura", name: "Câmara Municipal de Paredes de Coura", lat: 41.91218, lng: -8.5603 },
  { concelho: "Pedrógão Grande", name: "Câmara Municipal de Pedrógão Grande", lat: 39.91835, lng: -8.1458 },
  { concelho: "Penafiel", name: "Câmara Municipal de Penafiel", lat: 41.20668, lng: -8.2839 },
  { concelho: "Penalva do Castelo", name: "Câmara Municipal de Penalva do Castelo", lat: 40.67468, lng: -7.70075 },
  { concelho: "Peniche", name: "Câmara Municipal de Peniche", lat: 39.3567, lng: -9.37828 },
  { concelho: "Peso da Régua", name: "Câmara Municipal de Peso da Régua", lat: 41.16209, lng: -7.78896 },
  { concelho: "Pombal", name: "Câmara Municipal de Pombal", lat: 39.91524, lng: -8.62884 },
  { concelho: "Ponta Delgada", name: "Câmara Municipal de Ponta Delgada", lat: 37.73931, lng: -25.66887 },
  { concelho: "Ponte da Barca", name: "Câmara Municipal de Ponte da Barca", lat: 41.80695, lng: -8.41695 },
  { concelho: "Ponte de Lima", name: "Câmara Municipal de Ponte de Lima", lat: 41.7674, lng: -8.58332 },
  { concelho: "Ponte de Sor", name: "Câmara Municipal de Ponte de Sor", lat: 39.25243, lng: -8.00722 },
  { concelho: "Portel", name: "Câmara Municipal de Portel", lat: 38.30987, lng: -7.70298 },
  { concelho: "Portimão", name: "Câmara Municipal de Portimão", lat: 37.13693, lng: -8.53758 },
  { concelho: "Porto", name: "Câmara Municipal de Porto", lat: 41.14924, lng: -8.61074 },
  { concelho: "Porto de Mós", name: "Câmara Municipal de Porto de Mós", lat: 39.60223, lng: -8.81818 },
  { concelho: "Póvoa de Lanhoso", name: "Câmara Municipal de Póvoa de Lanhoso", lat: 41.57742, lng: -8.27278 },
  { concelho: "Póvoa de Varzim", name: "Câmara Municipal de Póvoa de Varzim", lat: 41.37924, lng: -8.75978 },
  { concelho: "Proença-a-Nova", name: "Câmara Municipal de Proença-a-Nova", lat: 39.75322, lng: -7.92427 },
  { concelho: "Redondo", name: "Câmara Municipal de Redondo", lat: 38.64657, lng: -7.54671 },
  { concelho: "Reguengos de Monsaraz", name: "Câmara Municipal de Reguengos de Monsaraz", lat: 38.42457, lng: -7.53473 },
  { concelho: "Resende", name: "Câmara Municipal de Resende", lat: 41.10577, lng: -7.96505 },
  { concelho: "Rio Maior", name: "Câmara Municipal de Rio Maior", lat: 39.33647, lng: -8.93607 },
  { concelho: "Sabrosa", name: "Câmara Municipal de Sabrosa", lat: 41.26494, lng: -7.57464 },
  { concelho: "Sabugal", name: "Câmara Municipal de Sabugal", lat: 40.3518, lng: -7.09222 },
  { concelho: "Santa Comba Dão", name: "Câmara Municipal de Santa Comba Dão", lat: 40.38046, lng: -8.13106 },
  { concelho: "Santa Maria da Feira", name: "Câmara Municipal de Santa Maria da Feira", lat: 40.92541, lng: -8.54224 },
  { concelho: "Santa Marta de Penaguião", name: "Câmara Municipal de Santa Marta de Penaguião", lat: 41.21214, lng: -7.78472 },
  { concelho: "Santarém", name: "Câmara Municipal de Santarém", lat: 39.23938, lng: -8.68701 },
  { concelho: "Santiago do Cacém", name: "Câmara Municipal de Santiago do Cacém", lat: 38.01631, lng: -8.69317 },
  { concelho: "Santo Tirso", name: "Câmara Municipal de Santo Tirso", lat: 41.3415, lng: -8.47313 },
  { concelho: "São Brás de Alportel", name: "Câmara Municipal de São Brás de Alportel", lat: 37.15137, lng: -7.88835 },
  { concelho: "São João da Madeira", name: "Câmara Municipal de São João da Madeira", lat: 40.89325, lng: -8.47763 },
  { concelho: "São João da Pesqueira", name: "Câmara Municipal de São João da Pesqueira", lat: 41.1468, lng: -7.40558 },
  { concelho: "São Pedro do Sul", name: "Câmara Municipal de São Pedro do Sul", lat: 40.76276, lng: -8.06348 },
  { concelho: "Sardoal", name: "Câmara Municipal de Sardoal", lat: 39.53452, lng: -8.16117 },
  { concelho: "Sátão", name: "Câmara Municipal de Sátão", lat: 40.74162, lng: -7.73351 },
  { concelho: "Seia", name: "Câmara Municipal de Seia", lat: 40.42106, lng: -7.70398 },
  { concelho: "Seixal", name: "Câmara Municipal de Seixal", lat: 38.6372, lng: -9.10126 },
  { concelho: "Serpa", name: "Câmara Municipal de Serpa", lat: 37.94348, lng: -7.59731 },
  { concelho: "Sertã", name: "Câmara Municipal de Sertã", lat: 39.80905, lng: -8.09818 },
  { concelho: "Sesimbra", name: "Câmara Municipal de Sesimbra", lat: 38.44373, lng: -9.10109 },
  { concelho: "Setúbal", name: "Câmara Municipal de Setúbal", lat: 38.52415, lng: -8.89267 },
  { concelho: "Sever do Vouga", name: "Câmara Municipal de Sever do Vouga", lat: 40.73397, lng: -8.37048 },
  { concelho: "Sines", name: "Câmara Municipal de Sines", lat: 37.95459, lng: -8.86441 },
  { concelho: "Sintra", name: "Câmara Municipal de Sintra", lat: 38.79895, lng: -9.38784 },
  { concelho: "Soure", name: "Câmara Municipal de Soure", lat: 40.06061, lng: -8.62601 },
  { concelho: "Sousel", name: "Câmara Municipal de Sousel", lat: 38.95278, lng: -7.67531 },
  { concelho: "Tábua", name: "Câmara Municipal de Tábua", lat: 40.35973, lng: -8.02797 },
  { concelho: "Tarouca", name: "Câmara Municipal de Tarouca", lat: 41.01527, lng: -7.77636 },
  { concelho: "Tavira", name: "Câmara Municipal de Tavira", lat: 37.1261, lng: -7.6499 },
  { concelho: "Terras de Bouro", name: "Câmara Municipal de Terras de Bouro", lat: 41.71898, lng: -8.30795 },
  { concelho: "Tomar", name: "Câmara Municipal de Tomar", lat: 39.60374, lng: -8.41529 },
  { concelho: "Tondela", name: "Câmara Municipal de Tondela", lat: 40.51598, lng: -8.07922 },
  { concelho: "Torre de Moncorvo", name: "Câmara Municipal de Torre de Moncorvo", lat: 41.17568, lng: -7.05264 },
  { concelho: "Torres Novas", name: "Câmara Municipal de Torres Novas", lat: 39.47994, lng: -8.53885 },
  { concelho: "Torres Vedras", name: "Câmara Municipal de Torres Vedras", lat: 39.09188, lng: -9.25655 },
  { concelho: "Trancoso", name: "Câmara Municipal de Trancoso", lat: 40.77783, lng: -7.35034 },
  { concelho: "Trofa", name: "Câmara Municipal de Trofa", lat: 41.32828, lng: -8.56654 },
  { concelho: "Vagos", name: "Câmara Municipal de Vagos", lat: 40.54905, lng: -8.67837 },
  { concelho: "Vale de Cambra", name: "Câmara Municipal de Vale de Cambra", lat: 40.84879, lng: -8.39399 },
  { concelho: "Valongo", name: "Câmara Municipal de Valongo", lat: 41.19113, lng: -8.49753 },
  { concelho: "Vendas Novas", name: "Câmara Municipal de Vendas Novas", lat: 38.67744, lng: -8.45533 },
  { concelho: "Viana do Alentejo", name: "Câmara Municipal de Viana do Alentejo", lat: 38.33423, lng: -8.00052 },
  { concelho: "Viana do Castelo", name: "Câmara Municipal de Viana do Castelo", lat: 41.69396, lng: -8.82873 },
  { concelho: "Vidigueira", name: "Câmara Municipal de Vidigueira", lat: 38.2095, lng: -7.80006 },
  { concelho: "Vieira do Minho", name: "Câmara Municipal de Vieira do Minho", lat: 41.6345, lng: -8.14029 },
  { concelho: "Vila do Conde", name: "Câmara Municipal de Vila do Conde", lat: 41.35395, lng: -8.743 },
  { concelho: "Vila Flor", name: "Câmara Municipal de Vila Flor", lat: 41.30882, lng: -7.15461 },
  { concelho: "Vila Franca de Xira", name: "Câmara Municipal de Vila Franca de Xira", lat: 38.95426, lng: -8.98973 },
  { concelho: "Vila Nova da Barquinha", name: "Câmara Municipal de Vila Nova da Barquinha", lat: 39.45823, lng: -8.43104 },
  { concelho: "Vila Nova de Cerveira", name: "Câmara Municipal de Vila Nova de Cerveira", lat: 41.93891, lng: -8.74425 },
  { concelho: "Vila Nova de Famalicão", name: "Câmara Municipal de Vila Nova de Famalicão", lat: 41.41003, lng: -8.52047 },
  { concelho: "Vila Nova de Foz Côa", name: "Câmara Municipal de Vila Nova de Foz Côa", lat: 41.08289, lng: -7.13602 },
  { concelho: "Vila Nova de Gaia", name: "Câmara Municipal de Vila Nova de Gaia", lat: 41.12891, lng: -8.60894 },
  { concelho: "Vila Nova de Paiva", name: "Câmara Municipal de Vila Nova de Paiva", lat: 40.85136, lng: -7.72936 },
  { concelho: "Vila Nova de Poiares", name: "Câmara Municipal de Vila Nova de Poiares", lat: 40.20995, lng: -8.259 },
  { concelho: "Vila Pouca de Aguiar", name: "Câmara Municipal de Vila Pouca de Aguiar", lat: 41.55299, lng: -7.60577 },
  { concelho: "Vila Real", name: "Câmara Municipal de Vila Real", lat: 41.29498, lng: -7.74614 },
  { concelho: "Vila Real de Santo António", name: "Câmara Municipal de Vila Real de Santo António", lat: 37.19459, lng: -7.41556 },
  { concelho: "Vila Velha de Ródão", name: "Câmara Municipal de Vila Velha de Ródão", lat: 39.65732, lng: -7.67519 },
  { concelho: "Vila Viçosa", name: "Câmara Municipal de Vila Viçosa", lat: 38.77851, lng: -7.41861 },
  { concelho: "Vinhais", name: "Câmara Municipal de Vinhais", lat: 41.83532, lng: -7.00194 },
  { concelho: "Viseu", name: "Câmara Municipal de Viseu", lat: 40.65792, lng: -7.91393 },
];

function findNearestRealMunicipality(lat: number, lng: number): EmergencyPOI | null {
  if (REAL_MUNICIPALITIES.length > 0) {
    let nearest = REAL_MUNICIPALITIES[0];
    let nearestDist = calculateDistance(lat, lng, nearest.lat, nearest.lng);
    for (const c of REAL_MUNICIPALITIES.slice(1)) {
      const d = calculateDistance(lat, lng, c.lat, c.lng);
      if (d < nearestDist) {
        nearest = c;
        nearestDist = d;
      }
    }
    // Só usa esta entrada se estiver razoavelmente perto (< 25km) -- caso contrário
    // o concelho do utilizador provavelmente está entre os 24 que ainda não têm
    // correspondência geocodificada, e é melhor não mostrar nada do que um ponto
    // que pode não ser o concelho certo.
    if (nearestDist < 25) {
      return {
        id: "real-fallback-municipality-geocoded",
        name: nearest.name,
        type: "municipality",
        location: { lat: nearest.lat, lng: nearest.lng },
        address: "Localização real (geocodificada a partir da morada oficial da câmara) — confirme ligando 112.",
        isEstimate: false
      };
    }
  }

  return null;
}

/**
 * Centros de saúde REAIS por concelho -- fonte: ARS Lisboa e Vale do Tejo, lista oficial
 * de "Centros de Saúde / Horarios" (fevereiro 2026), com coordenadas verificadas.
 * Cobre 52 concelhos da região de Lisboa e Vale do Tejo (Lisboa, Santarém, parte de
 * Leiria/Setubal). Fora destá região, cai na aproximação por capital de distrito abaixo.
 * Isto é uma melhoria real de precisão: em vez do centro da cidade-capital do distrito,
 * usa o centro de saúde do PROPRIO concelho do utilizador quando disponivel.
 */
const REAL_HEALTH_CENTERS_LVT: { concelho: string; name: string; lat: number; lng: number }[] = [
  { concelho: "Abrantes", name: "USF D. Francisco de Almeida (Abrantes)", lat: 39.46038, lng: -8.1991 },
  { concelho: "Alcanena", name: "UCSP Alcanena (Alcanena)", lat: 39.45777, lng: -8.66686 },
  { concelho: "Alcobaça", name: "USF Pinhal do Rei (Alcobaça)", lat: 39.66776, lng: -9.00051 },
  { concelho: "Alcochete", name: "UCSP Alcochete (Alcochete)", lat: 38.7488, lng: -8.96542 },
  { concelho: "Alenquer", name: "USF Vila Presépio (Alenquer)", lat: 39.05076, lng: -8.99868 },
  { concelho: "Almada", name: "USF São João do Pragal (Almada)", lat: 38.6703, lng: -9.17103 },
  { concelho: "Almeirim", name: "USF Côrtes D'Almeirim (Almeirim)", lat: 39.20933, lng: -8.6259 },
  { concelho: "Alpiarça", name: "USF Alpiarça (Alpiarça)", lat: 39.25103, lng: -8.5804 },
  { concelho: "Amadora", name: "USF Águas Livres (Amadora)", lat: 38.74488, lng: -9.20927 },
  { concelho: "Arruda dos Vinhos", name: "USF Lusitano (Arruda dos Vinhos)", lat: 38.98168, lng: -9.08145 },
  { concelho: "Azambuja", name: "UCSP Azambuja - Polo Aveiras de Cima (Azambuja)", lat: 39.1379, lng: -8.9 },
  { concelho: "Barreiro", name: "USF Alburrica (Barreiro)", lat: 38.64407, lng: -9.0528 },
  { concelho: "Benavente", name: "USF Samora Correia (Benavente)", lat: 38.93604, lng: -8.86748 },
  { concelho: "Bombarral", name: "USF Bombarral (Bombarral)", lat: 39.27234, lng: -9.15832 },
  { concelho: "Cadaval", name: "UCSP Cadaval - Polo Vilar (Cadaval)", lat: 39.1872, lng: -9.11207 },
  { concelho: "Caldas da Rainha", name: "USF Rafael Bordalo Pinheiro (Caldas da Rainha)", lat: 39.41145, lng: -9.13945 },
  { concelho: "Cartaxo", name: "USF Cartaxo Terra Viva (Cartaxo)", lat: 39.16555, lng: -8.78389 },
  { concelho: "Cascais", name: "USF Alcais (Cascais)", lat: 38.7301, lng: -9.4072 },
  { concelho: "Chamusca", name: "USF Chamusca (Chamusca)", lat: 39.35773, lng: -8.48107 },
  { concelho: "Constância", name: "UCSP Constância (Constância)", lat: 39.47913, lng: -8.33641 },
  { concelho: "Coruche", name: "USF Vale do Sorraia - Polo Couço (Coruche)", lat: 38.98355, lng: -8.28803 },
  { concelho: "Entroncamento", name: "USF Locomotiva (Entroncamento)", lat: 39.46614, lng: -8.47148 },
  { concelho: "Ferreira do Zêzere", name: "USF Santa Maria de Tomar - Polo Ferreira do Zêzere (Ferreira do Zêzere)", lat: 39.68857, lng: -8.28742 },
  { concelho: "Golegã", name: "USF CampuSaúde (Golegã)", lat: 39.40263, lng: -8.47913 },
  { concelho: "Lisboa", name: "USF Mónicas (Lisboa)", lat: 38.71505, lng: -9.13052 },
  { concelho: "Loures", name: "USF Tejo (Loures)", lat: 38.7821, lng: -9.10142 },
  { concelho: "Lourinhã", name: "USF D. Jordão (Lourinhã)", lat: 39.24288, lng: -9.31023 },
  { concelho: "Mafra", name: "USF Andreas (Mafra)", lat: 38.93682, lng: -9.33605 },
  { concelho: "Mação", name: "UCSP Mação (Mação)", lat: 39.55982, lng: -7.99558 },
  { concelho: "Moita", name: "USF Querer Mais (Moita)", lat: 38.65016, lng: -9.03827 },
  { concelho: "Montijo", name: "USF Aldegalega (Montijo)", lat: 38.70738, lng: -8.97092 },
  { concelho: "Nazaré", name: "USF Global (Nazaré)", lat: 39.59586, lng: -9.06949 },
  { concelho: "Odivelas", name: "USF Génesis (Odivelas)", lat: 38.80604, lng: -9.16354 },
  { concelho: "Oeiras", name: "USF Dafundo (Oeiras)", lat: 38.70004, lng: -9.24223 },
  { concelho: "Ourém", name: "USF Auren (Ourém)", lat: 39.65924, lng: -8.5753 },
  { concelho: "Palmela", name: "USF Santiago de Palmela (Palmela)", lat: 38.57085, lng: -8.89732 },
  { concelho: "Peniche", name: "USF Marés (Peniche)", lat: 39.36567, lng: -9.38267 },
  { concelho: "Rio Maior", name: "USF Salinas de Rio Maior (Rio Maior)", lat: 39.34382, lng: -8.94526 },
  { concelho: "Salvaterra de Magos", name: "UCSP Salvaterra de Magos (Salvaterra de Magos)", lat: 39.02589, lng: -8.79292 },
  { concelho: "Santarém", name: "USF Alviela - Polo Alcanhões (Santarém)", lat: 39.29669, lng: -8.66089 },
  { concelho: "Sardoal", name: "UCSP Sardoal (Sardoal)", lat: 39.53686, lng: -8.15982 },
  { concelho: "Seixal", name: "USF Pinhal de Frades (Seixal)", lat: 38.6008, lng: -9.09694 },
  { concelho: "Sesimbra", name: "USF Castelo (Sesimbra)", lat: 38.46133, lng: -9.10505 },
  { concelho: "Setúbal", name: "USF Luísa Todi (Setúbal)", lat: 38.52809, lng: -8.88964 },
  { concelho: "Sintra", name: "USF AlbaSaúde (Sintra)", lat: 38.75163, lng: -9.34729 },
  { concelho: "Sobral de Monte Agraço", name: "USF Costa Campos (Sobral de Monte Agraço)", lat: 38.9838, lng: -9.14516 },
  { concelho: "Tomar", name: "USF Marmelais (Tomar)", lat: 39.60169, lng: -8.40188 },
  { concelho: "Torres Novas", name: "USF Almonda - Polo Olaia (Torres Novas)", lat: 39.52158, lng: -8.4698 },
  { concelho: "Torres Vedras", name: "USF Santa Cruz (Torres Vedras)", lat: 39.11335, lng: -9.36044 },
  { concelho: "Vila Franca de Xira", name: "USF Terras de Cira (Vila Franca de Xira)", lat: 38.95905, lng: -8.9879 },
  { concelho: "Vila Nova da Barquinha", name: "USF Barquinha (Vila Nova da Barquinha)", lat: 39.45916, lng: -8.43512 },
  { concelho: "Óbidos", name: "USF Rafael Bordalo Pinheiro - Polo Gaeiras (Óbidos)", lat: 39.36897, lng: -9.12721 },
];

/**
 * Centro de saúde real mais próximo. Primeiro tenta encontrar o concelho exato (ou o
 * mais próximo) na lista verificada da ARS LVT; so cai na aproximação por capital de
 * distrito se estiver fora dessa cobertura (ex: Norte, Centro-interior, Alentejo, Algarve).
 */
function findNearestRealHealthCenter(lat: number, lng: number): EmergencyPOI | null {
  if (REAL_HEALTH_CENTERS_LVT.length > 0) {
    let nearest = REAL_HEALTH_CENTERS_LVT[0];
    let nearestDist = calculateDistance(lat, lng, nearest.lat, nearest.lng);
    for (const c of REAL_HEALTH_CENTERS_LVT.slice(1)) {
      const d = calculateDistance(lat, lng, c.lat, c.lng);
      if (d < nearestDist) {
        nearest = c;
        nearestDist = d;
      }
    }
    // Só usa esta entrada se estiver razoavelmente perto (< 40km) -- caso contrário o
    // utilizador está fora da região coberta pela ARS LVT, e é melhor não mostrar
    // nada do que devolver um concelho de Lisboa/Santarém a alguém no Algarve ou no
    // Minho.
    if (nearestDist < 40) {
      return {
        id: "real-fallback-health-center-lvt",
        name: nearest.name,
        type: "health_center",
        location: { lat: nearest.lat, lng: nearest.lng },
        address: "Localização real verificada (ARS Lisboa e Vale do Tejo) — confirme ligando SNS 24 (808 24 24 24) ou 112.",
        isEstimate: false
      };
    }
  }

  return null;
}

function getOfflineFallbackPOIs(lat: number, lng: number): EmergencyPOI[] {
  logger.warn(`[EmergencyService] Sem dados reais disponíveis para [${lat}, ${lng}] — a usar apenas os locais reais e verificados que existirem na lista curada para esta zona (hospital, esquadra, bombeiros, câmara, centro de saúde); tipos sem correspondência real verificada ficam de fora, em vez de mostrar uma aproximação inventada.`);

  // IMPORTANTE: as entradas de posto de saúde/social abaixo continuam a ser apenas uma
  // direção aproximada relativa à localização do utilizador, geradas localmente — NÃO
  // são locais reais verificados. Os nomes deixam isso claro de propósito, para nunca
  // dar a entender que é um resultado confirmado. Os restantes tipos (hospital, polícia,
  // bombeiros, câmara, centro de saúde) só aparecem se houver mesmo um local real
  // verificado perto — caso contrário ficam de fora da lista, para nunca mostrar
  // uma localização que pode não existir.
  const fallbackPOIs: (EmergencyPOI | null)[] = [
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

  return fallbackPOIs.filter((p): p is EmergencyPOI => p !== null);
}

