import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { ShieldAlert, Map as MapIcon, Layers, Navigation, RefreshCw, Loader2, Mountain } from 'lucide-react';
import { Alert } from '../../types';
import { cn } from '../../lib/utils';
import { elevationService, ElevationData } from '../../services/elevationService';
import { logger } from '../../lib/logger';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

function MapEventHandler({ onMoveEnd }: { onMoveEnd: (lat: number, lng: number) => void }) {
  useMapEvents({
    moveend: (e) => {
      const center = e.target.getCenter();
      onMoveEnd(center.lat, center.lng);
    }
  });
  return null;
}

export function RiskMap() {
  const [center] = useState<[number, number]>([39.5, -8.0]);
  const [zoom] = useState(7);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [elevation, setElevation] = useState<ElevationData | null>(null);
  const [fetchingElevation, setFetchingElevation] = useState(false);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/alerts');
      if (response.ok) {
        const data = await response.json();
        const processed = data.map((d: any) => ({
          ...d,
          timestamp: new Date(d.timestamp)
        }));
        setAlerts(processed);
        setLastUpdated(new Date());
      }
    } catch (error) {
      logger.error('Error fetching alerts for map:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchElevation = async (lat: number, lng: number) => {
    setFetchingElevation(true);
    const data = await elevationService.getElevation(lat, lng);
    setElevation(data);
    setFetchingElevation(false);
  };

  useEffect(() => {
    fetchAlerts();
    fetchElevation(center[0], center[1]);
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAlerts, center]);

  const createIcon = (severity: string) => {
    const color = severity === 'high' ? '#dc2626' : severity === 'medium' ? '#f97316' : '#3b82f6';
    return L.divIcon({
      className: 'custom-risk-icon',
      html: `
        <div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  };

  return (
    <div className="h-full relative z-0">
      <MapContainer 
        center={center} 
        zoom={zoom} 
        className="w-full h-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapEventHandler onMoveEnd={fetchElevation} />

        {alerts.map((alert) => (
          <Marker
            key={alert.id}
            position={[alert.location.lat, alert.location.lng]}
            icon={createIcon(alert.severity)}
          >
            <Popup>
              <div className="p-1">
                <p className="font-black text-[10px] uppercase text-slate-800 leading-none mb-1">{alert.title}</p>
                <p className="text-[9px] text-slate-500 leading-tight">{alert.description}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Status Overlay */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
        <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full border border-slate-200 shadow-lg flex items-center gap-2">
          <div className={cn("w-1.5 h-1.5 rounded-full", loading ? "bg-amber-400 animate-pulse" : "bg-green-500")} />
          <span className="text-[9px] font-black uppercase text-slate-600 tracking-widest whitespace-nowrap">
            {loading ? 'A sincronizar...' : `Mapa Livre: ${lastUpdated.toLocaleTimeString('pt-PT')}`}
          </span>
        </div>

        {elevation && (
          <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full border border-slate-200 shadow-lg flex items-center gap-2">
            <Mountain className={cn("w-3 h-3 text-emerald-600", fetchingElevation && "animate-pulse")} />
            <span className="text-[9px] font-black uppercase text-slate-600 tracking-widest whitespace-nowrap">
              {elevation.elevation.toFixed(1)}m Altitude
            </span>
          </div>
        )}
      </div>

      {/* Floating Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000]">
        <button 
          onClick={fetchAlerts}
          disabled={loading}
          className="bg-white p-2 rounded-lg shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 text-slate-400 animate-spin" /> : <RefreshCw className="w-5 h-5 text-slate-600" />}
        </button>
        <button className="bg-white p-2 rounded-lg shadow-lg border border-slate-200">
          <Layers className="w-5 h-5 text-slate-600" />
        </button>
        <button className="bg-white p-2 rounded-lg shadow-lg border border-slate-200">
          <Navigation className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-sm p-4 rounded-2xl shadow-xl border border-slate-200 flex items-center justify-around z-[1000]">
        <LegendItem color="bg-red-600" label="Elevado" />
        <LegendItem color="bg-orange-500" label="Moderado" />
        <LegendItem color="bg-blue-500" label="Reduzido" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string, label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${color}`} />
      <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tighter">{label}</span>
    </div>
  );
}
