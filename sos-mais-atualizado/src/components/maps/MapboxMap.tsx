import React from 'react';
import Map, { NavigationControl, FullscreenControl, ScaleControl, GeolocateControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapIcon, ShieldAlert } from 'lucide-react';

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || '';
const hasValidToken = Boolean(MAPBOX_TOKEN) && MAPBOX_TOKEN !== 'YOUR_MAPBOX_TOKEN';

interface MapboxMapProps {
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
}

export function MapboxMap({ 
  initialCenter = { lat: 38.7223, lng: -9.1393 }, 
  initialZoom = 12 
}: MapboxMapProps) {
  
  if (!hasValidToken) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] bg-slate-50 p-8 text-center rounded-[32px] border border-slate-200">
        <MapIcon className="w-12 h-12 text-slate-300 mb-4" />
        <h2 className="text-sm font-black uppercase text-slate-800 mb-2">Token Mapbox Necessário</h2>
        <p className="text-[10px] text-slate-500 max-w-xs mb-4">
          Para visualizar este mapa, adicione o seu Access Token do Mapbox nas definições.
        </p>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-left w-full max-w-sm">
          <p className="text-[9px] font-bold text-slate-700 mb-2 uppercase tracking-wider">Passos:</p>
          <ol className="text-[9px] text-slate-500 space-y-2 list-decimal list-inside">
            <li>Crie uma conta em <a href="https://mapbox.com" target="_blank" className="text-blue-600 underline">Mapbox</a></li>
            <li>Obtenha o seu <strong>Código de Acesso Público</strong></li>
            <li>Abra o ficheiro <strong>.env</strong> do projeto</li>
            <li>Cole o código na linha <code>MAPBOX_ACCESS_TOKEN</code></li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[400px] relative overflow-hidden rounded-[32px] border border-slate-200 shadow-inner">
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          latitude: initialCenter.lat,
          longitude: initialCenter.lng,
          zoom: initialZoom
        }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: '100%', height: '100%' }}
      >
        <GeolocateControl position="top-left" />
        <FullscreenControl position="top-left" />
        <NavigationControl position="top-left" />
        <ScaleControl />
      </Map>

      {/* Brand Overlay */}
      <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-slate-200 shadow-sm flex items-center gap-1.5 pointer-events-none">
        <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
        <span className="text-[9px] font-black uppercase text-slate-800 tracking-tight">SOS MAIS - MOTOR MAPBOX</span>
      </div>
    </div>
  );
}

export default MapboxMap;
