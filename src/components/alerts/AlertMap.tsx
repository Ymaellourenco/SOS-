import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Alert } from '../../types';
import { MapPin, Navigation2 } from 'lucide-react';
import { cn } from '../../lib/utils';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

interface AlertMapProps {
  alerts: Alert[];
  userLocation: { lat: number; lng: number } | null;
  /** 'nearby' foca e aproxima na localização do utilizador; 'all' (Nacional) mostra sempre Portugal inteiro. */
  viewScope?: 'nearby' | 'all';
}

function MapController({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  const hasCenteredRef = React.useRef(false);
  const lastZoomRef = React.useRef(zoom);

  useEffect(() => {
    // Só recentra o mapa sozinho na primeira vez (quando abre) ou quando o zoom
    // muda de propósito (ex: trocar entre "Perto de Mim" e "Nacional").
    //
    // ANTES disto, o mapa recentrava-se a CADA atualização do GPS — o que
    // acontece a cada poucos segundos enquanto o GPS está ativo. Se alguém
    // tocasse no mapa exatamente nesse instante (a explorar, a tentar marcar um
    // pin), o mapa estava a mover-se por baixo do dedo dessa pessoa: o toque
    // era registado numa posição, mas o mapa já lá não estava mais quando o
    // Leaflet calculava a coordenada — dando um pin sempre num sítio diferente
    // e sem padrão (exatamente o que foi reportado). Ao parar de recentrar
    // sozinho a cada soluço do GPS, o mapa fica quieto enquanto a pessoa o
    // explora, e só volta a mover-se quando isso é mesmo intencional.
    const isFirstRender = !hasCenteredRef.current;
    const zoomChanged = lastZoomRef.current !== zoom;

    if (isFirstRender || zoomChanged) {
      map.setView(center, zoom, {
        animate: !isFirstRender,
        duration: 1.5
      });
      hasCenteredRef.current = true;
      lastZoomRef.current = zoom;
    }
  }, [center, zoom, map]);

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
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [activeLayers] = useState({ alerts: true });
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


  const openInGoogleMaps = (lat: number, lng: number, label: string) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, '_blank');
  };

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
              iconAnchor: [18, 18]
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

      </MapContainer>

      <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-[1000] pointer-events-none">
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

