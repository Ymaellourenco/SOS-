import React, { useEffect, useState, useRef } from 'react';
import { APIProvider, Map as GoogleMap, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Loader2, ShieldCheck, Map as MapIcon, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { logger } from '../../lib/logger';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const MAP_ID = '75b1140dd23376f4'; 
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

const TARGET_TILE_COUNT = 36; // 6x6 grid for better performance
const POINT_SPACING_METERS = 100;
const HEATMAP_RADIUS_PIXELS = 30;

interface ResourceMapProps {
  userLocation?: { lat: number; lng: number } | null;
}

export function ResourceMap({ userLocation }: ResourceMapProps) {
  if (!hasValidKey) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] bg-slate-50 p-8 text-center rounded-[32px] border border-slate-200">
        <MapIcon className="w-12 h-12 text-slate-300 mb-4" />
        <h2 className="text-sm font-black uppercase text-slate-800 mb-2">Chave Google Maps Necessária</h2>
        <p className="text-[10px] text-slate-500 max-w-xs mb-4">
          Para visualizar o mapa de recursos e densidade de segurança, adicione a sua chave API nas definições.
        </p>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-left w-full max-w-sm">
          <p className="text-[9px] font-bold text-slate-700 mb-2 uppercase tracking-wider">Passos:</p>
          <ol className="text-[9px] text-slate-500 space-y-2 list-decimal list-inside">
            <li>Obtenha uma chave em <a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" className="text-blue-600 underline">GCP Console</a></li>
            <li>Abra <strong>Definições</strong> (ícone ⚙️ no topo direito)</li>
            <li>Adicione <code>GOOGLE_MAPS_PLATFORM_KEY</code> ao ficheiro <strong>.env</strong></li>
          </ol>
        </div>
      </div>
    );
  }

  const initialCenter = userLocation || { lat: 38.7223, lng: -9.1393 }; 

  return (
    <div className="h-[400px] relative overflow-hidden flex flex-col rounded-[32px] border border-slate-200 shadow-inner z-0">
       <APIProvider apiKey={API_KEY} version="weekly">
        <GoogleMap
          defaultCenter={initialCenter}
          defaultZoom={12}
          mapId={MAP_ID}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio1']}
          className="w-full flex-1"
          disableDefaultUI={true}
        >
          <AreaHeatmapOverlay />
        </GoogleMap>
      </APIProvider>
      
      {/* Legend Overlay */}
      <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-xl border border-slate-200 shadow-lg z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-[10px] font-black uppercase text-slate-800 tracking-tight">Densidade de Recursos (Heatmap)</span>
          </div>
          <Info className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 rounded-full bg-[#32CD32] opacity-80" />
             <span className="text-[9px] text-slate-500">Média</span>
          </div>
          <div className="flex-1 h-1 bg-gradient-to-r from-[#32CD32] via-[#FFFF00] to-[#FF0000] rounded-full" />
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 rounded-full bg-red-600" />
             <span className="text-[9px] text-slate-500">Crítica</span>
          </div>
        </div>
      </div>
    </div>
  );
}
/**
 * Generates a grid of points within a tile for heatmap visualization
 * This makes the heatmap "fill" the area more naturally.
 */
function generatePointsInTile(polygon: { latitude: number, longitude: number }[], count: number) {
  const points: { position: [number, number], weight: number }[] = [];
  
  const lats = polygon.map(p => p.latitude);
  const lngs = polygon.map(p => p.longitude);
  const bounds = {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };

  const latSize = bounds.north - bounds.south;
  const lngSize = bounds.east - bounds.west;
  const padding = 0.1; 
  const paddedBounds = {
    north: bounds.north - latSize * padding,
    south: bounds.south + latSize * padding,
    east: bounds.east - lngSize * padding,
    west: bounds.west + lngSize * padding,
  };

  // Degrees per meter (approx)
  const latSpacing = POINT_SPACING_METERS / 111111;
  const lngSpacing = POINT_SPACING_METERS / (111111 * Math.cos((bounds.north * Math.PI) / 180));

  for (let lat = paddedBounds.south; lat <= paddedBounds.north; lat += latSpacing) {
    for (let lng = paddedBounds.west; lng <= paddedBounds.east; lng += lngSpacing) {
      points.push({
        position: [lng, lat],
        weight: count,
      });
    }
  }
  return points;
}

function AreaHeatmapOverlay() {
  const map = useMap();
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<GoogleMapsOverlay | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!overlayRef.current) {
      overlayRef.current = new GoogleMapsOverlay({ layers: [] });
      overlayRef.current.setMap(map);
    }

    const updateHeatmap = async () => {
      const bounds = map.getBounds();
      if (!bounds) return;

      setLoading(true);
      try {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const latDiff = ne.lat() - sw.lat();
        const lngDiff = ne.lng() - sw.lng();
        const tilesPerSide = Math.sqrt(TARGET_TILE_COUNT);
        const latTileSize = latDiff / tilesPerSide;
        const lngTileSize = lngDiff / tilesPerSide;

        const tiles: any[] = [];
        for (let lat = sw.lat(); lat < ne.lat(); lat += latTileSize) {
          for (let lng = sw.lng(); lng < ne.lng(); lng += lngTileSize) {
            const polygon = [
              { latitude: lat, longitude: lng },
              { latitude: lat, longitude: lng + lngTileSize },
              { latitude: lat + latTileSize, longitude: lng + lngTileSize },
              { latitude: lat + latTileSize, longitude: lng },
              { latitude: lat, longitude: lng },
            ];
            tiles.push({ polygon, center: { lat: lat + latTileSize/2, lng: lng + lngTileSize/2 } });
          }
        }

        // Fetch insights for tiles
        // We limit parallel requests to 8 for performance
        const activeTiles = tiles.slice(0, 12); 
        const insightsPromises = activeTiles.map(async (tile) => {
          try {
            const response = await fetch('/api/maps/insights', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                insights: ["INSIGHT_COUNT"],
                filter: {
                  location_filter: {
                    custom_area: { polygon: { coordinates: tile.polygon } },
                  },
                  type_filter: {
                    included_types: ["police", "fire_station", "hospital", "pharmacy"],
                  },
                },
              })
            });

            if (response.ok) {
              const result = await response.json();
              const count = parseInt(result.count, 10) || 0;
              if (count > 0) {
                return generatePointsInTile(tile.polygon, count);
              }
            }
          } catch (e) {}
          return [];
        });

        const allPoints = (await Promise.all(insightsPromises)).flat();

        if (overlayRef.current) {
          const heatmapLayer = new HeatmapLayer({
            id: 'heatmap-layer-' + Date.now(),
            data: allPoints,
            getPosition: (d: any) => d.position,
            getWeight: (d: any) => d.weight,
            radiusPixels: HEATMAP_RADIUS_PIXELS,
            intensity: 1,
            threshold: 0.05,
            colorRange: [
              [0, 0, 0, 0],
              [50, 205, 50, 80],   // Safe (Green)
              [255, 255, 0, 100], // Moderate (Yellow)
              [255, 165, 0, 120], // High (Orange)
              [255, 0, 0, 140],   // Dense (Red)
            ],
            aggregation: 'SUM',
          });
          overlayRef.current.setProps({ layers: [heatmapLayer] });
        }
      } catch (e) {
        logger.error("Heatmap update failed:", e);
      } finally {
        setLoading(false);
      }
    };

    updateHeatmap();
    const listener = map.addListener('idle', updateHeatmap);
    
    return () => {
      google.maps.event.removeListener(listener);
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
      }
    };
  }, [map]);

  if (loading) {
    return (
      <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm p-2 rounded-full shadow-lg z-50">
        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
      </div>
    );
  }

  return null;
}

export default ResourceMap;

