import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Alert } from '../../types';
import { Flame, HeartPulse, ShieldCheck, Stethoscope, MapPin, Landmark, LifeBuoy, Loader2, Pill, Search, X, Navigation2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { fetchNearbyEmergencyPOIs, EmergencyPOI } from '../../services/emergencyService';
import { logger } from '../../lib/logger';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

interface AlertMapProps {
  alerts: Alert[];
  userLocation: { lat: number; lng: number } | null;
  /** 'nearby' foca e aproxima na localização do utilizador; 'all' (Nacional) mostra sempre Portugal inteiro. */
  viewScope?: 'nearby' | 'all';
}

const POI_SVGS = {
  hospital: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08v0c.85.85 2.23.85 3.08 0L14.96 8.2a2.17 2.17 0 0 0 0-3.08v0c-.85-.85-2.23-.85-3.08 0L12 5Z"/></svg>',
  health_center: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 12.5-4 4V12l-4-4v6l-4-4"/><path d="M4.83 6.74C3.67 8.1 3 9.73 3 11.5 3 15.64 6.36 19 10.5 19s7.5-3.36 7.5-7.5c0-1.77-.7-3.4-1.83-4.76"/><rect width="18" height="18" x="3" y="3" rx="2"/></svg>',
  health_post: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  police: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
  fire: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.203 1.15-3.003L8.5 14.5Z"/></svg>',
  municipality: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="10" rx="2"/><path d="M6 10V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6"/><path d="M12 10V2"/><path d="M6 14h.01"/><path d="M10 14h.01"/><path d="M14 14h.01"/><path d="M18 14h.01"/></svg>',
  pharmacy: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>',
  sos: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
  shelter: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/><path d="m3 9 2.45-4.91A2 2 0 0 1 7.23 3h9.54a2 2 0 0 1 1.78 1.09L21 9"/></svg>',
  social: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
};

function MapController({ center, zoom, onMoveEnd }: { center: [number, number], zoom: number, onMoveEnd?: (lat: number, lng: number, radiusKm: number) => void }) {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, zoom, {
      animate: true,
      duration: 1.5
    });
  }, [center, zoom, map]);

  // Calcula um raio de pesquisa que corresponde ao que está mesmo visível no ecrã —
  // em vez de um raio fixo (que deixava a maior parte do mapa "Nacional" sem
  // nenhuma bolinha, porque 10km é praticamente invisível à escala do país inteiro).
  const boundsRadiusKm = useCallback(() => {
    const bounds = map.getBounds();
    const center = map.getCenter();
    const corner = bounds.getNorthEast();
    const distMeters = center.distanceTo(corner);
    const radiusKm = distMeters / 1000;
    return Math.min(Math.max(radiusKm, 3), 60); // entre 3km e 60km (limite também aplicado no servidor)
  }, [map]);

  useMapEvents({
    moveend: () => {
      const newCenter = map.getCenter();
      if (onMoveEnd) onMoveEnd(newCenter.lat, newCenter.lng, boundsRadiusKm());
    }
  });

  return null;
}

/**
 * Deteta um toque num ponto vazio do mapa (não numa bolinha já existente) e avisa
 * o componente principal — para a pessoa poder escolher QUALQUER ponto que veja no
 * mapa (mesmo que a nossa base de dados não o conheça) e pedir direções para lá.
 */
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

const createUserIcon = () => {
  return L.divIcon({
    className: 'custom-user-icon',
    html: `
      <div class="relative">
        <div class="absolute -inset-4 bg-blue-500/30 rounded-full animate-ping"></div>
        <div class="w-5 h-5 bg-blue-600 rounded-full border-2 border-white shadow-lg relative z-10 transition-transform active:scale-150"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[28px] bg-white text-blue-600 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border border-blue-100 shadow-sm whitespace-nowrap">
          TU
        </div>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
};

export function AlertMap({ alerts, userLocation, viewScope = 'nearby' }: AlertMapProps) {
  const [poiData, setPoiData] = useState<EmergencyPOI[]>(() => {
    try {
      const saved = localStorage.getItem('sos_radar_pois');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isLoadingPois, setIsLoadingPois] = useState(false);
  // Guarda que bolinhas já foram sinalizadas nesta sessão, só para o botão mudar
  // para "Reportado ✓" e a pessoa não voltar a carregar sem querer.
  const [reportedPoiIds, setReportedPoiIds] = useState<Set<string>>(new Set());
  const [reportingPoiId, setReportingPoiId] = useState<string | null>(null);

  const reportWrongLocation = useCallback(async (poi: EmergencyPOI) => {
    setReportingPoiId(poi.id);
    try {
      await fetch('/api/report-wrong-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poiId: poi.id,
          name: poi.name,
          type: poi.type,
          lat: poi.location.lat,
          lng: poi.location.lng,
          address: poi.address || null
        })
      });
      setReportedPoiIds(prev => new Set(prev).add(poi.id));
    } catch (err) {
      logger.error('Falha ao enviar reporte de morada errada:', err);
    } finally {
      setReportingPoiId(null);
    }
  }, []);

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastPoisLocation, setLastPoisLocation] = useState<{lat: number, lng: number} | null>(null);
  const [activeLayers, setActiveLayers] = useState({
    alerts: true,
    hospitals: true,
    health_centers: true,
    health_posts: true,
    police: true,
    fire: true,
    municipalities: true,
    pharmacies: true,
    sos: true,
    shelters: true,
    social: true
  });
  const [showNearestPoints, setShowNearestPoints] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>(() => {
    return parseInt(localStorage.getItem('sos_radar_last_updated') || '0');
  });

  // --- Pesquisa livre + pin manual no mapa ---
  // A pessoa escolhe o destino, em vez de depender só dos locais que a app
  // identificou sozinha (ver pedido do utilizador: liberdade para marcar
  // qualquer ponto do mapa, ou escrever o nome de um sítio, e ser encaminhado
  // para lá diretamente).
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ name: string; address: string; lat: number; lng: number }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [customPin, setCustomPin] = useState<{ lat: number; lng: number; label: string | null; loadingLabel: boolean } | null>(null);

  const selectSearchResult = (result: { name: string; address: string; lat: number; lng: number }) => {
    setCustomPin({ lat: result.lat, lng: result.lng, label: result.name, loadingLabel: false });
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setCustomPin({ lat, lng, label: null, loadingLabel: true });
    try {
      const response = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
      const data = await response.json();
      setCustomPin({ lat, lng, label: data.label || null, loadingLabel: false });
    } catch {
      setCustomPin({ lat, lng, label: null, loadingLabel: false });
    }
  }, []);

  const center: [number, number] = useMemo(() => {
    // Nacional mostra sempre Portugal inteiro, independentemente de teres GPS ligado —
    // é isso que distingue visualmente de "Perto de Mim", que foca sempre em ti.
    if (viewScope === 'nearby' && userLocation) return [userLocation.lat, userLocation.lng];
    return [39.5, -8.0]; // Centro de Portugal
  }, [userLocation, viewScope]);

  const zoom = viewScope === 'nearby' && userLocation ? 13 : 7;

  const runSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    try {
      const biasLat = userLocation?.lat ?? center[0];
      const biasLng = userLocation?.lng ?? center[1];
      const response = await fetch(`/api/geocode-search?q=${encodeURIComponent(query)}&lat=${biasLat}&lng=${biasLng}`);
      const data = await response.json();
      if (!response.ok || !data.results) {
        setSearchError('Não foi possível pesquisar agora.');
        setSearchResults([]);
        return;
      }
      setSearchResults(data.results);
      if (data.results.length === 0) {
        setSearchError('Nenhum resultado encontrado.');
      }
    } catch (err) {
      setSearchError('Não foi possível pesquisar agora.');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [userLocation, center]);

  // Pesquisa com um pequeno atraso (debounce) enquanto a pessoa escreve, para não
  // disparar um pedido a cada letra.
  useEffect(() => {
    const timeout = setTimeout(() => runSearch(searchQuery), 500);
    return () => clearTimeout(timeout);
  }, [searchQuery, runSearch]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (poiData.length > 0) {
      localStorage.setItem('sos_radar_pois', JSON.stringify(poiData));
      const now = Date.now();
      localStorage.setItem('sos_radar_last_updated', now.toString());
      setLastUpdated(now);
    }
  }, [poiData]);

  const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2-lat1) * Math.PI / 180;
    const dLon = (lon2-lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }, []);

  const nearestPOIs = useMemo(() => {
    if (!userLocation || poiData.length === 0) return [];
    
    return poiData
      .map(poi => ({
        ...poi,
        distance: calculateDistance(userLocation.lat, userLocation.lng, poi.location.lat, poi.location.lng)
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);
  }, [userLocation, poiData, calculateDistance]);

  const openInGoogleMaps = (lat: number, lng: number, label: string) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, '_blank');
  };

  // Limite de segurança: sem isto, o mapa ia juntando bolinhas para sempre, cada vez
  // que a pessoa mexia/explorava — ao fim de algum tempo isso acumula centenas ou
  // milhares de marcadores em memória, e é isso que estava a fazer a app travar ao
  // explorar o mapa. Mantemos só os POIs mais próximos do sítio onde se está agora.
  const MAX_POIS_IN_MEMORY = 300;

  const loadPois = useCallback(async (lat: number, lng: number, radiusKm: number = 10) => {
    if (isOffline) return;
    setIsLoadingPois(true);
    try {
      const newPois = await fetchNearbyEmergencyPOIs(lat, lng, radiusKm);
      setPoiData(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const uniqueNewPois = Array.from(new Map(newPois.map(item => [item.id, item])).values());
        const filtered = uniqueNewPois.filter(p => !existingIds.has(p.id));
        const merged = [...prev, ...filtered];

        if (merged.length <= MAX_POIS_IN_MEMORY) return merged;

        // Passou do limite: descarta os que estão mais longe do centro atual,
        // não os mais antigos — assim o que se vê à volta de onde se está agora
        // nunca desaparece, só o que já ficou para trás.
        return merged
          .map(p => ({ p, dist: calculateDistance(lat, lng, p.location.lat, p.location.lng) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, MAX_POIS_IN_MEMORY)
          .map(x => x.p);
      });
    } catch (err) {
      logger.error(err);
    } finally {
      setIsLoadingPois(false);
    }
  }, [calculateDistance]);

  // Debounce ao mexer/ampliar o mapa — sem isto, arrastar ou ampliar rapidamente
  // disparava um pedido novo a cada pequeníssimo movimento, várias vezes por
  // segundo, o que também contribuía para a app engasgar.
  const moveEndTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedLoadPois = useCallback((lat: number, lng: number, radiusKm: number) => {
    if (moveEndTimeoutRef.current) clearTimeout(moveEndTimeoutRef.current);
    moveEndTimeoutRef.current = setTimeout(() => loadPois(lat, lng, radiusKm), 400);
  }, [loadPois]);

  useEffect(() => {
    return () => {
      if (moveEndTimeoutRef.current) clearTimeout(moveEndTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (userLocation) {
      if (!lastPoisLocation) {
        setLastPoisLocation(userLocation);
        // Raio inicial maior na vista "Nacional" (zoom bem afastado), pequeno na
        // vista "Perto de Mim" — evita andar a pedir 60km de raio quando já se está
        // com o zoom no bairro, e vice-versa.
        loadPois(userLocation.lat, userLocation.lng, viewScope === 'all' ? 60 : 10);
      } else {
        const dist = calculateDistance(userLocation.lat, userLocation.lng, lastPoisLocation.lat, lastPoisLocation.lng);
        // Only reload if user moved more than 2km
        if (dist > 2) {
          setLastPoisLocation(userLocation);
          loadPois(userLocation.lat, userLocation.lng, viewScope === 'all' ? 60 : 10);
        }
      }
    } else if (center) {
      // Fallback for when we don't have user location but have a map center
      loadPois(center[0], center[1], viewScope === 'all' ? 60 : 10);
    }
  }, [userLocation, center, lastPoisLocation, loadPois, calculateDistance, viewScope]);

  return (
    <div className="relative h-[390px] w-full rounded-[32px] overflow-hidden border border-slate-200 shadow-inner group z-0">
      <MapContainer 
        center={center} 
        zoom={zoom} 
        scrollWheelZoom={true}
        className="w-full h-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="bottomright" />
        
        <MapController 
          center={center} 
          zoom={zoom} 
          onMoveEnd={(lat, lng, radiusKm) => debouncedLoadPois(lat, lng, radiusKm)}
        />
        <MapClickHandler onMapClick={handleMapClick} />

        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={createUserIcon()} />
        )}

        {/* Pin escolhido pela pessoa: por pesquisa de texto, ou por tocar diretamente
            no mapa. Isto existe precisamente para a pessoa poder escolher QUALQUER
            sítio que veja no mapa, sem depender dos locais que a app identificou
            sozinha (ver pedido do utilizador nesta conversa). */}
        {customPin && (
          <Marker
            position={[customPin.lat, customPin.lng]}
            icon={L.divIcon({
              className: 'custom-pin-icon',
              html: `
                <div class="relative">
                  <div class="w-9 h-9 rounded-full bg-slate-900 border-2 border-white shadow-lg flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                </div>
              `,
              iconSize: [36, 36],
              iconAnchor: [18, 36]
            })}
          >
            <Popup>
              <div className="p-1 min-w-[180px]">
                <h4 className="text-sm font-black uppercase text-slate-900 leading-tight mb-1">
                  {customPin.loadingLabel ? 'A identificar local...' : (customPin.label || 'Local escolhido')}
                </h4>
                <p className="text-[10px] text-slate-500 mb-2">
                  {customPin.lat.toFixed(5)}, {customPin.lng.toFixed(5)}
                </p>
                <button
                  onClick={() => openInGoogleMaps(customPin.lat, customPin.lng, customPin.label || 'Destino')}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <Navigation2 className="w-3 h-3" />
                  Direções para aqui
                </button>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Dynamic Alerts */}
        {activeLayers.alerts && alerts.map(alert => (
          <Marker 
            key={alert.id} 
            position={[alert.location.lat, alert.location.lng]} 
            icon={L.divIcon({
              className: 'custom-alert-icon',
              html: `
                <div class="w-[18px] h-[18px] rounded-lg flex items-center justify-center shadow-lg border-2 border-white ${
                  alert.severity === 'high' ? 'bg-red-600' : alert.severity === 'medium' ? 'bg-orange-500' : 'bg-blue-500'
                } text-white transition-transform hover:scale-110 active:scale-95">
                  <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                </div>
              `,
              iconSize: [18, 18],
              iconAnchor: [9, 9],
              popupAnchor: [0, -9]
            })}
          >
            <Popup className="custom-popup">
              <div className="p-1 min-w-[200px]">
                <div className="flex items-center gap-2 mb-2">
                   <span className={cn(
                     "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                     alert.severity === 'high' ? "bg-red-100 text-red-700" :
                     alert.severity === 'medium' ? "bg-orange-100 text-orange-700" :
                     "bg-blue-100 text-blue-700"
                   )}>
                     {alert.severity === 'high' ? 'Crítico' : 'Informativo'}
                   </span>
                   <span className="text-[8px] font-bold text-slate-400 uppercase">
                     {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </span>
                </div>
                <h4 className="text-sm font-black uppercase text-slate-900 leading-tight mb-1">{alert.title}</h4>
                <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-3 mb-2">{alert.description}</p>
                <button 
                  onClick={() => openInGoogleMaps(alert.location.lat, alert.location.lng, alert.title)}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <MapPin className="w-3 h-3" />
                  Ir para Local
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Real Emergency POIs (OSM) */}
        {poiData.map(poi => {
          // Mapeamento explícito, um-para-um, de cada tipo de local para a sua
          // camada correspondente em activeLayers. Antes disto era calculado a
          // adivinhar o plural (ex: "police" + "s" = "polices"), o que não batia
          // certo com a chave real "police" em activeLayers — e por isso os
          // marcadores de polícia, bombeiros e SOS nunca apareciam no mapa,
          // mesmo quando os dados chegavam corretos do servidor.
          const LAYER_KEY_BY_TYPE: Record<EmergencyPOI['type'], keyof typeof activeLayers> = {
            hospital: 'hospitals',
            health_center: 'health_centers',
            health_post: 'health_posts',
            police: 'police',
            fire: 'fire',
            municipality: 'municipalities',
            pharmacy: 'pharmacies',
            sos: 'sos',
            shelter: 'shelters',
            social: 'social'
          };
          const layerKey = LAYER_KEY_BY_TYPE[poi.type];

          if (!layerKey || !activeLayers[layerKey]) return null;
          
          return (
            <Marker 
              key={poi.id}
              position={[poi.location.lat, poi.location.lng]}
              icon={L.divIcon({
                className: 'custom-poi-icon',
                html: `
                  <div class="w-4 h-4 rounded-full flex items-center justify-center shadow-md border-2 border-white ${
                    poi.type === 'hospital' ? 'bg-emerald-500' : 
                    poi.type === 'health_center' ? 'bg-teal-500' :
                    poi.type === 'health_post' ? 'bg-teal-400' :
                    poi.type === 'police' ? 'bg-indigo-600' : 
                    poi.type === 'fire' ? 'bg-red-500' :
                    poi.type === 'municipality' ? 'bg-amber-600' :
                    poi.type === 'pharmacy' ? 'bg-fuchsia-500' :
                    poi.type === 'shelter' ? 'bg-emerald-600' :
                    poi.type === 'social' ? 'bg-blue-400' :
                    'bg-slate-700'
                  } text-white">
                    ${POI_SVGS[poi.type as keyof typeof POI_SVGS]}
                  </div>
                `,
                iconSize: [18, 18],
                iconAnchor: [9, 9],
                popupAnchor: [0, -9]
              })}
            >
              <Popup className="custom-popup">
                <div className="p-2 text-center text-slate-900">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-2",
                    poi.type === 'hospital' ? "bg-emerald-100 text-emerald-600" : 
                    poi.type === 'health_center' ? "bg-teal-100 text-teal-600" :
                    poi.type === 'health_post' ? "bg-teal-50 text-teal-400" :
                    poi.type === 'police' ? "bg-indigo-100 text-indigo-600" : 
                    poi.type === 'fire' ? "bg-red-100 text-red-600" :
                    poi.type === 'municipality' ? "bg-amber-100 text-amber-600" :
                    poi.type === 'pharmacy' ? "bg-fuchsia-100 text-fuchsia-600" :
                    poi.type === 'shelter' ? "bg-emerald-100 text-emerald-700" :
                    poi.type === 'social' ? "bg-blue-100 text-blue-600" :
                    "bg-slate-100 text-slate-600"
                  )}>
                    {poi.type === 'hospital' && <HeartPulse className="w-5 h-5" />}
                    {poi.type === 'health_center' && <Stethoscope className="w-5 h-5" />}
                    {poi.type === 'health_post' && <Stethoscope className="w-4 h-4" />}
                    {poi.type === 'police' && <ShieldCheck className="w-5 h-5" />}
                    {poi.type === 'fire' && <Flame className="w-5 h-5" />}
                    {poi.type === 'municipality' && <Landmark className="w-5 h-5" />}
                    {poi.type === 'pharmacy' && <Pill className="w-5 h-5" />}
                    {poi.type === 'sos' && <LifeBuoy className="w-5 h-5" />}
                    {poi.type === 'shelter' && <MapPin className="w-5 h-5" />}
                    {poi.type === 'social' && <Landmark className="w-5 h-5 opacity-70" />}
                  </div>
                  <h4 className="text-[11px] font-black uppercase leading-tight">{poi.name}</h4>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {poi.type === 'hospital' || poi.type === 'health_center' || poi.type === 'health_post' ? 'Unidade de Saúde Médica' :
                     poi.type === 'pharmacy' ? 'Farmácia' :
                     poi.type === 'social' ? 'Apoio Social / Lar (Não Médico)' :
                     poi.type === 'municipality' ? 'Ponto Institucional' : 
                     poi.type === 'shelter' ? 'Ponto de Abrigo SOS' : 'Unidade de Emergência'}
                  </p>
                  {poi.address && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <p className="text-[8px] text-slate-500 italic line-clamp-2 leading-tight">
                        {poi.address}
                      </p>
                    </div>
                  )}
                  <button 
                    onClick={() => openInGoogleMaps(poi.location.lat, poi.location.lng, poi.name)}
                    className="w-full mt-3 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <MapPin className="w-3 h-3" />
                    Abrir Rota
                  </button>
                  {reportedPoiIds.has(poi.id) ? (
                    <p className="w-full mt-2 text-center text-[8px] font-bold text-emerald-600 uppercase tracking-widest">
                      Reportado, obrigado ✓
                    </p>
                  ) : (
                    <button
                      onClick={() => reportWrongLocation(poi)}
                      disabled={reportingPoiId === poi.id}
                      className="w-full mt-2 py-1.5 text-slate-400 hover:text-red-500 text-[8px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                    >
                      {reportingPoiId === poi.id ? 'A enviar...' : 'Sinalizar morada errada'}
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-[1000] pointer-events-none">
        <AnimatePresence>
          {isLoadingPois && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-full shadow-lg border border-white/20 flex items-center gap-2 w-fit mb-1"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="text-[8px] font-black uppercase tracking-widest">Atualizando Radar...</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-slate-900/80 backdrop-blur-md text-white px-3 py-2 rounded-xl border border-white/10 shadow-xl pointer-events-auto flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full animate-pulse",
            isOffline ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" : "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"
          )} />
          <div className="flex flex-col">
            <span className="text-[8px] font-black uppercase tracking-widest leading-none">
              {isOffline ? "Radar em Modo Cache (Offline)" : "Radar SOS Ativo em Portugal"}
            </span>
            {lastUpdated > 0 && (
              <span className="text-[6px] font-bold text-white/40 uppercase mt-0.5">
                Última Atualização: {new Date(lastUpdated).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>
      
      <style>{`
        .leaflet-container { font-family: inherit; z-index: 10; }
        .custom-popup .leaflet-popup-content-wrapper { 
          border-radius: 20px; 
          padding: 4px; 
          box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
          border: 1px solid rgba(0,0,0,0.05);
        }
        .custom-popup .leaflet-popup-content { margin: 8px; }
        .custom-popup .leaflet-popup-tip { background: white; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );
}

function LayerToggle({ label, checked, onChange, color }: { label: string, checked: boolean, onChange: () => void, color: string }) {
  return (
    <button 
      onClick={onChange}
      className={cn(
        "w-full flex items-center justify-between p-1.5 rounded-lg transition-all hover:bg-slate-50",
        !checked && "opacity-60"
      )}
    >
      <div className="flex items-center gap-1.5">
        <div className={cn("w-1.5 h-1.5 rounded-full", color)} />
        <span className="text-[8px] font-bold text-slate-600 uppercase tracking-tight">{label}</span>
      </div>
      <div className={cn(
        "w-5 h-3 rounded-full transition-colors relative",
        checked ? "bg-slate-900" : "bg-slate-200"
      )}>
        <div className={cn(
          "absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all pointer-events-none",
          checked ? "right-0.5" : "left-0.5"
        )} />
      </div>
    </button>
  );
}
