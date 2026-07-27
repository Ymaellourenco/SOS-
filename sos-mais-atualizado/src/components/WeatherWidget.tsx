import React, { useState, useEffect } from 'react';
import { Cloud, Sun, Thermometer, MapPin, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

import { geocodeService } from '../services/geocodeService';
import { fetchApproximateLocation } from '../services/ipLocationService';
import { logger } from '../lib/logger';

async function fetchRealTemperature(lat: number, lon: number): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m`
    );
    if (!response.ok) return null;
    const data = await response.json();
    const temp = data?.current?.temperature_2m;
    return typeof temp === 'number' ? Math.round(temp) : null;
  } catch (error) {
    logger.warn('Falha ao obter temperatura real:', error);
    return null;
  }
}

export function WeatherWidget() {
  const [weather, setWeather] = useState<{ temp: number | null; status: string; city: string; coords: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLocationByIP = async () => {
      const location = await fetchApproximateLocation();

      if (location) {
        const realTemp = await fetchRealTemperature(location.lat, location.lon);
        setWeather(prev => {
          if (prev?.status === 'GPS Ativo') return prev;
          return {
            temp: realTemp,
            status: 'Rede Local',
            city: location.city,
            coords: `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`
          };
        });
        setLoading(false);
        return;
      }

      if (!weather) {
        const realTemp = await fetchRealTemperature(38.7223, -9.1393);
        setWeather({
          temp: realTemp,
          status: 'Padrão (Lisboa)',
          city: 'Lisboa',
          coords: '38.7223, -9.1393'
        });
        setLoading(false);
      }
    };

    fetchLocationByIP();

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        
        const [areaName, realTemp] = await Promise.all([
          geocodeService.reverseGeocode(lat, lon).then(name => name || "Localização Atual"),
          fetchRealTemperature(lat, lon)
        ]);

        setWeather({
          temp: realTemp,
          status: 'GPS Ativo',
          city: areaName,
          coords: `${lat.toFixed(4)}, ${lon.toFixed(4)}`
        });
        setLoading(false);
      }, () => {
        setLoading(false); // GPS failed, keep IP base
      }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
    }
  }, []);

  if (loading) return (
    <div className="bg-white px-4 py-3 rounded-[24px] border border-slate-100 flex items-center justify-center gap-2">
      <Loader2 className="w-3 h-3 animate-spin text-slate-300" />
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Geo-Dados...</span>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white text-slate-900 px-4 py-3 rounded-[20px] border border-slate-100 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-slate-900 p-1.5 rounded-lg">
            <MapPin className="w-3 h-3 text-white" />
          </div>
          <div className="overflow-hidden">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Dispositivo em:</p>
            <p className="text-[9px] font-black text-slate-900 truncate max-w-[140px] uppercase tracking-tight leading-none mb-1">{weather?.city}</p>
            <p className="text-[7px] font-mono text-slate-400 font-bold uppercase">{weather?.coords}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] font-black text-slate-900 leading-none">{weather?.temp !== null && weather?.temp !== undefined ? `${weather.temp}°C` : '--°C'}</p>
            <p className="text-[6px] font-bold text-amber-500 uppercase tracking-tighter">{weather?.status}</p>
          </div>
          <Sun className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
        </div>
      </div>
    </motion.div>
  );
}
