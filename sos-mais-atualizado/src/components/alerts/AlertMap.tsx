import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Alert } from '../../types';
import { Flame, HeartPulse, ShieldCheck, Stethoscope, MapPin, Landmark, LifeBuoy, Loader2 } from 'lucide-react';
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
  hospital: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08v0c.85.85 2.23.85 3.08 0L14.96 8.2a2.17 2.17 0 0 0 0-3.08v0c-.85-.85-2.23-.85-3.08 0L12 5Z"/></svg>',
  health_center: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 12.5-4 4V12l-4-4v6l-4-4"/><path d="M4.83 6.74C3.67 8.1 3 9.73 3 11.5 3 15.64 6.36 19 10.5 19s7.5-3.36 7.5-7.5c0-1.77-.7-3.4-1.83-4.76"/><rect width="18" height="18" x="3" y="3" rx="2"/></svg>',
  health_post: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  police: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
  fire: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.203 1.15-3.003L8.5 14.5Z"/></svg>',
  municipality: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="10" rx="2"/><path d="M6 10V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6"/><path d="M12 10V2"/><path d="M6 14h.01"/><path d="M10 14h.01"/><path d="M14 14h.01"/><path d="M18 14h.01"/></svg>',
  sos: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
  shelter: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/><path d="m3 9 2.45-4.91A2 2 0 0 1 7.23 3h9.54a2 2 0 0 1 1.78 1.09L21 9"/></svg>',
  social: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
};

function MapController({ center, zoom, onMoveEnd }: { center: [number, number], zoom: number, onMoveEnd?: (lat: number, lng: number) => void }) {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, zoom, {
      animate: true,
      duration: 1.5
    });
  }, [center, zoom, map]);

  useMapEvents({
    moveend: () => {
      const newCenter = map.getCenter();
      if (onMoveEnd) onMoveEnd(newCenter.lat, newCenter.lng);
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
    sos: true,
    shelters: true,
    social: true
  });
  const [showNearestPoints, setShowNearestPoints] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>(() => {
    return parseInt(localStorage.getItem('sos_radar_last_updated') || '0');
  });

  const center: [number, number] = useMemo(() => {
    // Nacional mostra sempre Portugal inteiro, independentemente de teres GPS ligado —
    // é isso que distingue visualmente de "Perto de Mim", que foca sempre em ti.
    if (viewScope === 'nearby' && userLocation) return [userLocation.lat, userLocation.lng];
    return [39.5, -8.0]; // Centro de Portugal
  }, [userLocation, viewScope]);

  const zoom = viewScope === 'nearby' && userLocation ? 13 : 7;

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

  const loadPois = useCallback(async (lat: number, lng: number) => {
    if (isOffline) return;
    setIsLoadingPois(true);
    try {
      const radius = 10; // 10km radius from current view
      const newPois = await fetchNearbyEmergencyPOIs(lat, lng, radius);
      setPoiData(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const uniqueNewPois = Array.from(new Map(newPois.map(item => [item.id, item])).values());
        const filtered = uniqueNewPois.filter(p => !existingIds.has(p.id));
        return [...prev, ...filtered];
      });
    } catch (err) {
      logger.error(err);
    } finally {
      setIsLoadingPois(false);
    }
  }, []);

  useEffect(() => {
    if (userLocation) {
      if (!lastPoisLocation) {
        setLastPoisLocation(userLocation);
        loadPois(userLocation.lat, userLocation.lng);
      } else {
        const dist = calculateDistance(userLocation.lat, userLocation.lng, lastPoisLocation.lat, lastPoisLocation.lng);
        // Only reload if user moved more than 2km
        if (dist > 2) {
          setLastPoisLocation(userLocation);
          loadPois(userLocation.lat, userLocation.lng);
        }
      }
    } else if (center) {
      // Fallback for when we don't have user location but have a map center
      loadPois(center[0], center[1]);
    }
  }, [userLocation, center, lastPoisLocation, loadPois, calculateDistance]);

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
          onMoveEnd={(lat, lng) => loadPois(lat, lng)}
        />

        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={createUserIcon()} />
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
          const typeKey = (poi.type + (poi.type.endsWith('s') ? '' : 's')) as keyof typeof activeLayers;
          const layerKey = poi.type === 'health_center' ? 'health_centers' : 
                          poi.type === 'health_post' ? 'health_posts' :
                          poi.type === 'municipality' ? 'municipalities' : 
                          poi.type === 'shelter' ? 'shelters' :
                          poi.type === 'social' ? 'social' :
                          typeKey;
                          
          if (!activeLayers[layerKey as keyof typeof activeLayers]) return null;
          
          return (
            <Marker 
              key={poi.id}
              position={[poi.location.lat, poi.location.lng]}
              icon={L.divIcon({
                className: 'custom-poi-icon',
                html: `
                  <div class="w-6 h-6 rounded-full flex items-center justify-center shadow-md border-2 border-white ${
                    poi.type === 'hospital' ? 'bg-emerald-500' : 
                    poi.type === 'health_center' ? 'bg-teal-500' :
                    poi.type === 'health_post' ? 'bg-teal-400' :
                    poi.type === 'police' ? 'bg-indigo-600' : 
                    poi.type === 'fire' ? 'bg-red-500' :
                    poi.type === 'municipality' ? 'bg-amber-600' :
                    poi.type === 'shelter' ? 'bg-emerald-600' :
                    poi.type === 'social' ? 'bg-blue-400' :
                    'bg-slate-700'
                  } text-white">
                    ${POI_SVGS[poi.type as keyof typeof POI_SVGS]}
                  </div>
                `,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
                popupAnchor: [0, -12]
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
                    {poi.type === 'sos' && <LifeBuoy className="w-5 h-5" />}
                    {poi.type === 'shelter' && <MapPin className="w-5 h-5" />}
                    {poi.type === 'social' && <Landmark className="w-5 h-5 opacity-70" />}
                  </div>
                  <h4 className="text-[11px] font-black uppercase leading-tight">{poi.name}</h4>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {poi.type === 'hospital' || poi.type === 'health_center' || poi.type === 'health_post' ? 'Unidade de Saúde Médica' :
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
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Dynamic Overlay Layer Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000] items-end">
        <button 
          onClick={() => setShowNearestPoints(!showNearestPoints)}
          className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-xl bg-white/90 backdrop-blur-md border border-white",
            showNearestPoints ? "bg-red-600 text-white border-red-700" : "text-red-600 hover:bg-white"
          )}
          title="Pontos de Ajuda Próximos"
        >
          <HeartPulse className="w-4 h-4" />
        </button>

        <AnimatePresence>
          {showNearestPoints && (
            <motion.div
              initial={{ opacity: 0, x: 20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              className="bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-white shadow-2xl w-48 space-y-2"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Ajuda Mais Próxima</p>
                  <HeartPulse className="w-2.5 h-2.5 text-red-500" />
                </div>

                <div className="max-h-[220px] overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                  {nearestPOIs.length === 0 ? (
                    <p className="text-[9px] text-slate-400 italic text-center py-3">Procurando pontos de apoio...</p>
                  ) : (
                    nearestPOIs.map(poi => (
                      <button
                        key={poi.id}
                        onClick={() => openInGoogleMaps(poi.location.lat, poi.location.lng, poi.name)}
                        className="w-full text-left p-1.5 rounded-xl bg-white border border-slate-100 hover:border-red-200 hover:bg-red-50/30 transition-all group"
                      >
                        <div className="flex items-start gap-1.5">
                          <div className={cn(
                            "w-5 h-5 rounded-lg flex items-center justify-center shrink-0 text-white",
                            poi.type === 'hospital' ? "bg-emerald-500" : 
                            poi.type === 'health_center' ? "bg-teal-500" :
                            poi.type === 'police' ? "bg-indigo-600" : 
                            poi.type === 'fire' ? "bg-red-600" : "bg-slate-600"
                          )}>
                             {poi.type === 'hospital' && <HeartPulse className="w-3 h-3" />}
                             {poi.type === 'health_center' && <Stethoscope className="w-3 h-3" />}
                             {poi.type === 'police' && <ShieldCheck className="w-3 h-3" />}
                             {poi.type === 'fire' && <Flame className="w-3 h-3" />}
                             {['hospital', 'health_center', 'police', 'fire'].indexOf(poi.type) === -1 && <MapPin className="w-3 h-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[8px] font-black uppercase text-slate-900 leading-tight truncate">
                              {poi.name}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[7px] font-bold text-red-600 uppercase">
                                {poi.distance.toFixed(1)} km
                              </span>
                              <span className="text-[7px] text-slate-400 font-medium">|</span>
                              <span className="text-[7px] text-slate-500 font-medium truncate">
                                {poi.address || 'Ver no mapa'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
