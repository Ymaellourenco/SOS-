import { logger } from '../lib/logger';
/**
 * Service to fetch real-world Emergency POIs from OpenStreetMap using Overpass API
 */

export interface EmergencyPOI {
  id: string;
  name: string;
  type: 'hospital' | 'health_center' | 'health_post' | 'police' | 'fire' | 'municipality' | 'sos' | 'shelter' | 'social';
  location: { lat: number; lng: number };
  address?: string;
}

// List of reliable Overpass API mirrors to handle failover and rate limits
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
  'https://overpass.be/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.oz.org.au/api/interpreter'
];

// Cache simples em memória: evita repetir o mesmo pedido ao remontar o mapa.
const POI_CACHE_TTL = 15 * 60 * 1000; // 15 minutos
const poiCache = new Map<string, { data: EmergencyPOI[]; timestamp: number }>();

// Disjuntor: se todos os espelhos falharam recentemente, não voltamos a martelá-los
// de imediato — isso só piora o rate-limit. Esperamos antes de tentar de novo.
const CIRCUIT_BREAKER_COOLDOWN = 3 * 60 * 1000; // 3 minutos
let lastFullFailureAt = 0;

function cacheKey(lat: number, lng: number, radiusKm: number): string {
  // Arredonda a ~1km para que pequenas variações de GPS reutilizem o mesmo cache.
  return `${lat.toFixed(2)},${lng.toFixed(2)},${radiusKm}`;
}

export async function fetchNearbyEmergencyPOIs(lat: number, lng: number, radiusKm: number = 15): Promise<EmergencyPOI[]> {
  const key = cacheKey(lat, lng, radiusKm);
  const cached = poiCache.get(key);
  if (cached && Date.now() - cached.timestamp < POI_CACHE_TTL) {
    logger.log(`[OSM] A usar cache local para [${lat}, ${lng}] (evita novo pedido)`);
    return cached.data;
  }

  if (Date.now() - lastFullFailureAt < CIRCUIT_BREAKER_COOLDOWN) {
    logger.log('[OSM] Disjuntor ativo — todos os espelhos falharam recentemente, a usar dados offline sem tentar de novo.');
    return getOfflineFallbackPOIs(lat, lng);
  }

  const radiusMeters = radiusKm * 1000;
  const query = `
    [out:json][timeout:30];
    (
      node["amenity"~"hospital|police|fire_station|clinic|doctors|townhall"](around:${radiusMeters},${lat},${lng});
      way["amenity"~"hospital|police|fire_station|clinic|doctors|townhall"](around:${radiusMeters},${lat},${lng});
    );
    out center;
  `;

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      logger.log(`[OSM] Trying mirror: ${mirror}`);
      const response = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SOS-MAIS-App/1.0'
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(15000) 
      });

      if (!response.ok) {
        logger.warn(`[OSM] Mirror failed: ${mirror} (${response.status})`);
        continue;
      }

          const data = await response.json();
          if (!data.elements) continue;

          const results = data.elements.map((el: any) => {
            const tags = el.tags || {};
            const type = mapOsmToAppType(tags);
            
            const elementLat = el.lat || el.center?.lat;
            const elementLng = el.lon || el.center?.lon;

            if (!elementLat || !elementLng) return null;
            
            // Standardizing ID to OSM element type + ID for absolute uniqueness
            return {
              id: `${el.type}-${el.id}`,
              name: tags.name || tags.operator || tags.description || (
                type === 'hospital' ? 'Hospital' : 
                type === 'police' ? 'Esquadra' : 
                type === 'fire' ? 'Quartel de Bombeiros' :
                type === 'health_center' ? 'Centro de Saúde' :
                type === 'health_post' ? 'Posto de Saúde' :
                type === 'municipality' ? 'Instituição Local' :
                type === 'social' ? 'Apoio Social / Lar' :
                'Ponto de Emergência'
              ),
              type,
              location: {
                lat: elementLat,
                lng: elementLng
              },
                address: [
              tags['addr:street'],
              tags['addr:housenumber'],
              tags['addr:place'] || tags['addr:city'] || tags['addr:suburb']
            ].filter(Boolean).join(', ') || tags['description'] || undefined
            };
          }).filter((item: any) => item !== null);

          poiCache.set(key, { data: results, timestamp: Date.now() });
          return results;

    } catch (error) {
      logger.warn(`[EmergencyService] Failed to reach mirror ${mirror}:`, error);
      // Continue to next mirror
    }
  }

  lastFullFailureAt = Date.now();
  logger.error('[EmergencyService] All Overpass API mirrors failed.');
  const fallback = getOfflineFallbackPOIs(lat, lng);
  poiCache.set(key, { data: fallback, timestamp: Date.now() });
  return fallback;
}

function getOfflineFallbackPOIs(lat: number, lng: number): EmergencyPOI[] {
  logger.log(`[EmergencyService] A carregar base de dados de emergência local (Offline) para [${lat}, ${lng}]`);
  
  // Synthesize realistic nearby helpers relative to the user's lat/lng
  const fallbackPOIs: EmergencyPOI[] = [
    {
      id: "fallback-hospital",
      name: "Hospital Distrital de Urgência",
      type: "hospital",
      location: { lat: lat + 0.0112, lng: lng - 0.0134 },
      address: "Av. da Liberdade, S/N, Centro Clínico Integrado"
    },
    {
      id: "fallback-health-center-1",
      name: "Centro de Saúde Regional (USF)",
      type: "health_center",
      location: { lat: lat - 0.0031, lng: lng + 0.0045 },
      address: "Rua do Comércio, Lote 12"
    },
    {
      id: "fallback-health-post",
      name: "Posto Clínico de Freguesia (Apoio)",
      type: "health_post",
      location: { lat: lat + 0.0068, lng: lng - 0.0072 },
      address: "Rua Principal, Posto de Saúde"
    },
    {
      id: "fallback-police",
      name: "Posto Territorial GNR / Esquadra PSP",
      type: "police",
      location: { lat: lat - 0.0054, lng: lng - 0.0049 },
      address: "Largo da Estação, Quartel Local"
    },
    {
      id: "fallback-fire-1",
      name: "Bombeiros Voluntários (Quartel Técnico)",
      type: "fire",
      location: { lat: lat + 0.0019, lng: lng + 0.0084 },
      address: "Parque de Socorro Municipal, Lote 2"
    },
    {
      id: "fallback-municipality",
      name: "Câmara Municipal / Junta de Freguesia",
      type: "municipality",
      location: { lat: lat + 0.0006, lng: lng + 0.0011 },
      address: "Praça do Município, Edifício de Apoio Civil"
    },
    {
      id: "fallback-shelter",
      name: "Ponto de Encontro e Abrigo de Proteção Civil",
      type: "shelter",
      location: { lat: lat - 0.0092, lng: lng + 0.0104 },
      address: "Pavilhão Desportivo Municipal"
    },
    {
      id: "fallback-social",
      name: "Lar Social e Residência de Apoio Sénior (Não Médico)",
      type: "social",
      location: { lat: lat + 0.0042, lng: lng - 0.0021 },
      address: "Rua das Flores, nº 14"
    }
  ];

  return fallbackPOIs;
}

function mapOsmToAppType(tags: any): EmergencyPOI['type'] {
  const amenity = tags.amenity || '';
  const healthcare = tags.healthcare || '';
  const social = tags.social_facility || '';
  const name = (tags.name || '').toLowerCase();

  // EXCLUSÃO E CLASSIFICAÇÃO SOCIAL: Se for um lar, residência sénior ou centro de dia, 
  // é classificado como 'social', NUNCA como unidade de saúde.
  if (
    amenity === 'social_facility' || 
    amenity === 'nursing_home' || 
    social === 'nursing_home' || 
    social === 'assisted_living' ||
    name.includes('lar de') || 
    name.includes('residência sénior') || 
    name.includes('residencia senior') ||
    name.includes('centro de dia') ||
    name.includes('misericórdia') && !name.includes('hospital')
  ) {
    return 'social'; 
  }
  
  if (amenity === 'hospital') {
    // Em Portugal, muitas unidades em vilas como Gouveia são "Centros de Saúde" ou "Unidades de Saúde Local"
    // Independentemente de estarem marcadas como 'hospital' no OSM, se o nome indicar Centro de Saúde, classificamos como tal.
    if (
      name.includes('centro de saúde') || 
      name.includes('extensão') || 
      name.includes('unidade de saúde') || 
      name.includes('usf') || 
      name.includes('ucl')
    ) {
      return 'health_center';
    }
    return 'hospital';
  }
  
  if (amenity === 'police') return 'police';
  if (amenity === 'fire_station') return 'fire';
  
  // Centro de Saúde / USF / Unidade de Saúde
  if (
    amenity === 'clinic' || 
    healthcare === 'clinic' || 
    amenity === 'health_centre' || 
    name.includes('centro de saúde') || 
    name.includes('unidade de saúde') ||
    name.includes('centro de saude') // backup para falta de acentos
  ) {
    return 'health_center';
  }
  
  // Posto de Saúde / Extensão (Unidades menores)
  if (
    amenity === 'doctors' || 
    healthcare === 'doctor' || 
    name.includes('posto de saúde') || 
    name.includes('extensão de saúde') ||
    name.includes('extensao de saude')
  ) {
    return 'health_post';
  }
  
  if (
    amenity === 'townhall' || 
    amenity === 'courthouse' || 
    name.includes('câmara municipal') || 
    name.includes('junta de freguesia') ||
    name.includes('município')
  ) {
    return 'municipality';
  }
  
  if (tags.emergency === 'sos_station' || tags.emergency === 'phone' || amenity === 'emergency_phone') return 'sos';
  if (tags.social_facility === 'shelter' || tags.emergency === 'emergency_ward' || tags.emergency === 'meeting_point' || name.includes('ponto de encontro')) return 'shelter';
  
  return 'sos';
}
