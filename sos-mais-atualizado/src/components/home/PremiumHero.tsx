import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Sun, Cloud, Thermometer, ShieldCheck, Loader2, Zap, AlertCircle, Heart, Wind, ChevronRight, HelpCircle, Waves } from 'lucide-react';
import { cn } from '../../lib/utils';
import { voiceService } from '../../lib/voiceService';
import { fetchApproximateLocation } from '../../services/ipLocationService';
import { EmergencyGuide } from '../../types';
import { logger } from '../../lib/logger';

interface PremiumHeroProps {
  onTriggerAI: () => void;
  onSelectGuide?: (guide: EmergencyGuide) => void;
  onSeeAllGuides?: () => void;
}

export const PremiumHero = memo(({ onTriggerAI, onSelectGuide, onSeeAllGuides }: PremiumHeroProps) => {
  const [weather, setWeather] = useState<{ 
    temp: number; 
    status: string; 
    street: string; 
    zipCode: string; 
    city: string;
    lat: number;
    lon: number;
    accuracy?: number;
    accuracyClass?: 'EXACT' | 'HIGH' | 'APPROXIMATE';
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState<string>("Olá");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(voiceService.isEnabled());
  const [countdown, setCountdown] = useState<number | null>(null);
  const lastCoords = useRef<{ lat: number, lon: number } | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let watchId: number | null = null;
    let isMounted = true;

    const fetchLocationByIP = async () => {
      try {
        const location = await fetchApproximateLocation();
        if (!isMounted || !location) return;
        setWeather(prev => {
          if (prev && prev.accuracyClass !== 'APPROXIMATE') return prev;
          return {
            temp: 18,
            status: 'IP Estimado',
            street: 'Localizando...',
            zipCode: location.postal || "",
            city: location.city,
            lat: location.lat, lon: location.lon,
            accuracy: 5000, accuracyClass: 'APPROXIMATE'
          };
        });
        setLoading(false);
      } catch (err) {}
    };

    const fetchGreeting = async () => {
      try {
        const response = await fetch('/api/greeting');
        if (response.ok) {
          const data = await response.json();
          if (data.hello) {
            setGreeting(data.hello);
            localStorage.setItem('sos_mais_greeting', data.hello);
          }
        }
      } catch (err) {}
    };

    fetchLocationByIP();
    fetchGreeting();

    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(async (pos) => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        if (lastCoords.current) {
          const dist = Math.sqrt(Math.pow(lat - lastCoords.current.lat, 2) + Math.pow(lon - lastCoords.current.lon, 2));
          // Increased threshold to 0.001 (~100m) to reduce geocoding calls during small jitter/drifts
          if (dist < 0.001 && weather?.status === 'Atualizado') return;
        }
        lastCoords.current = { lat, lon };
        try {
          const geoResponse = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(5000) });
          if (geoResponse.ok) {
            const contentType = geoResponse.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
              const text = await geoResponse.text();
              logger.warn("[PremiumHero] Expected JSON address, got:", text.substring(0, 100));
              return;
            }
            
            const data = await geoResponse.json();
            const addr = data.address || {};
            const mainStreet = addr.road || addr.pedestrian || addr.path || addr.square;
            const area = addr.suburb || addr.neighbourhood || addr.village || addr.city;
            let street = mainStreet ? (addr.house_number ? `${mainStreet}, ${addr.house_number}` : mainStreet) : (area || data.name || "Localização Atual");
            let temp = weather?.temp || 18;
            try {
              const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`, { signal: AbortSignal.timeout(3000) });
              if (weatherResponse.ok) {
                const weatherData = await weatherResponse.json();
                temp = Math.round(weatherData.current_weather.temperature);
              }
            } catch (wErr) {}
            let accuracyClass: 'EXACT' | 'HIGH' | 'APPROXIMATE' = 'APPROXIMATE';
            if (accuracy <= 25) accuracyClass = 'EXACT';
            else if (accuracy <= 80) accuracyClass = 'HIGH';
            if (isMounted) {
              setWeather({
                temp, status: 'Atualizado', street, zipCode: addr.postcode || "",
                city: addr.city || addr.town || "Portugal", lat, lon, accuracy, accuracyClass
              });
              setLoading(false);
            }
          }
        } catch (err) {}
      }, null, { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 });
    }

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      if ('vibrate' in navigator) navigator.vibrate([500, 200, 500]);
      onTriggerAI();
      return;
    }
    const timer = setTimeout(() => setCountdown(prev => (prev !== null ? prev - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [countdown, onTriggerAI]);

  const toggleSOS = useCallback(() => {
    if (countdown !== null) {
      setCountdown(null);
      voiceService.speak("Alerta Cancelado.");
      return;
    }
    setCountdown(1);
    voiceService.speak("Ajuda solicitada.");
    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
  }, [countdown]);

  return (
    <section className="px-6 pt-0 pb-0 shrink-0 relative">
      {/* Panic Flash Overlay - High Impact Foreground feedback */}
      <AnimatePresence>
        {countdown !== null && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: [0, 0.35, 0],
              transition: { 
                repeat: Infinity, 
                duration: 0.5,
                ease: "linear" 
              }
            }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-red-600 pointer-events-none z-[100] mix-blend-overlay"
          />
        )}
      </AnimatePresence>
      <motion.div 
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0, y: 20 },
          visible: {
            opacity: 1,
            y: 0,
            transition: {
              duration: 0.6,
              staggerChildren: 0.1,
              ease: [0.21, 0.45, 0.15, 1.0]
            }
          }
        }}
        className="glass ios-shadow rounded-[40px] p-5 border border-white/40 overflow-hidden relative"
      >
        {/* Background Accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[64px] rounded-full -mr-16 -mt-16" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-red-500/5 blur-[64px] rounded-full -ml-16 -mb-16" />

        <div className="flex flex-col gap-4">
          {/* Top: Status & Live Badges */}
          <div className="flex justify-between items-center px-1">
            <div className="flex gap-1.5">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/5 rounded-full border border-slate-950/5">
                <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[7px] font-black uppercase text-slate-500 tracking-widest">GPS Ativo</span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const newState = !isVoiceEnabled;
                  voiceService.setEnabled(newState);
                  setIsVoiceEnabled(newState);
                }}
                aria-label={isVoiceEnabled ? "Desativar guia de voz" : "Ativar guia de voz"}
                aria-pressed={isVoiceEnabled}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded-full border transition-all active:scale-95 group",
                  isVoiceEnabled 
                    ? "bg-blue-600/10 border-blue-600/20 text-blue-700 shadow-[0_2px_10px_rgba(37,99,235,0.1)]" 
                    : "bg-slate-900/5 border-slate-950/5 text-slate-400"
                )}
              >
                <div className={cn("w-1 h-1 rounded-full transition-colors", isVoiceEnabled ? "bg-blue-600 animate-pulse" : "bg-slate-400")} />
                <span className="text-[6px] font-black uppercase tracking-widest">Guia de Voz</span>
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-red-600" />
              <span className="text-[7px] font-black uppercase text-red-600 tracking-widest">Proteção Nacional</span>
            </div>
          </div>

          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 }
            }}
            className="text-center relative z-10"
          >
            <h2 className="text-[28px] font-display font-black text-slate-900 tracking-tighter leading-none uppercase">
              {greeting}, COMO PODEMOS <span className="text-red-600">AJUDAR?</span>
            </h2>
          </motion.div>

          {/* Center: Premium SOS Button - Ultra Refined */}
          <motion.div 
            variants={{
              hidden: { opacity: 0, scale: 0.9 },
              visible: { opacity: 1, scale: 1 }
            }}
            className="flex flex-col items-center"
          >
            <div className="relative">
              {/* Simplified Ripple for Performance */}
              {countdown !== null && (
                <motion.div 
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "easeOut" }}
                  className="absolute inset-0 rounded-full bg-red-500 blur-md z-0"
                />
              )}

              <motion.button
                key={countdown !== null ? 'alert' : 'idle'}
                onClick={toggleSOS}
                aria-label={countdown !== null ? "Cancelar pedido de ajuda de emergência" : "Pedir ajuda de emergência"}
                aria-live="assertive"
                animate={{ 
                  scale: countdown !== null ? [1.05, 1.1, 1.05] : [1, 1, 1],
                }}
                transition={{
                  scale: {
                    repeat: Infinity,
                    duration: countdown !== null ? 0.8 : 5, 
                    ease: "easeInOut"
                  }
                }}
                whileTap={{ 
                  scale: 0.94, 
                  transition: { duration: 0.1 }
                }}
                className={cn(
                  "relative z-10 w-44 h-44 rounded-full flex flex-col items-center justify-center transition-all duration-700 ios-shadow group",
                  countdown !== null 
                    ? "bg-red-600/90 backdrop-blur-md border-[10px] border-white/30 shadow-[0_0_60px_rgba(220,38,38,0.5)]" 
                    : "bg-[#1d1d1f] border-[10px] border-slate-800 shadow-[0_15px_50px_rgba(0,0,0,0.4),0_0_20px_rgba(220,38,38,0.05)]"
                )}
              >
                {/* Internal Inner Glow */}
                <div className="absolute inset-0 rounded-full border border-white/5 opacity-20 pointer-events-none" />

                <AnimatePresence mode="wait">
                  {countdown !== null ? (
                    <motion.div 
                      key="countdown"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="flex flex-col items-center justify-center pt-1"
                    >
                      <span className="text-6xl font-display font-black text-white leading-none tabular-nums drop-shadow-lg">{countdown + 1}</span>
                      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/70 mt-1">Abortar</span>
                    </motion.div>
                  ) : (
                    <motion.span 
                      key="sos-label"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="text-6xl font-display font-black text-white tracking-tighter uppercase leading-none drop-shadow-[0_10px_25px_rgba(0,0,0,0.5)]"
                    >
                      SOS
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </motion.div>

          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 5 },
              visible: { opacity: 1, y: 0 }
            }}
            className="text-center mt-2 mb-2"
          >
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.15em]">
              Toque no botão acima para obter ajuda
            </p>
          </motion.div>

          {/* Bottom Info Bar: Location & Status - Apple Style */}
          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 }
            }}
            className="flex flex-col gap-2 mt-2"
          >
            {/* Minimal Horizontal Strip */}
            <div 
              onClick={() => {
                if (weather) voiceService.speak(`Localização: ${weather.street}. Temperatura de ${weather.temp} graus.`);
              }}
              className="flex items-center justify-between gap-1 px-2.5 py-4 bg-slate-50/80 rounded-[30px] border border-slate-100 shadow-sm cursor-pointer active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="bg-white w-8 h-8 rounded-xl flex items-center justify-center shadow-sm border border-slate-50 shrink-0">
                  <MapPin className="w-3.5 h-3.5 text-red-600" />
                </div>
                <div className="min-w-0 pr-1 flex-1 py-0.5">
                  <p className="text-[7.5px] font-black uppercase tracking-[0.1em] leading-none mb-1.5 flex items-center gap-1.5">
                    {weather?.accuracyClass === 'EXACT' && (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-emerald-600 font-extrabold">LOCALIZAÇÃO EXATA (GPS &lt;15m)</span>
                      </>
                    )}
                    {weather?.accuracyClass === 'HIGH' && (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-blue-600 font-extrabold">ALTA PRECISÃO (&lt;50m)</span>
                      </>
                    )}
                    {(weather?.accuracyClass === 'APPROXIMATE' || !weather?.accuracyClass) && (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-amber-600 font-extrabold">LOCALIZAÇÃO APROXIMADA</span>
                      </>
                    )}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[11px] font-display font-black text-slate-900 leading-[1.3] pr-2">
                      {loading ? "Sincronizando..." : `${weather?.street}${weather?.zipCode ? ', ' + weather.zipCode : ''}${weather?.city ? ' ' + weather.city : ''}`}
                    </p>
                    {!loading && weather && (
                      <p className="text-[8px] font-bold text-slate-400/80 tabular-nums tracking-wide flex items-center gap-1">
                        <span className="opacity-50">GPS:</span> {weather.lat.toFixed(6)}, {weather.lon.toFixed(6)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="h-8 w-px bg-slate-200 shrink-0" />

              <div className="flex items-center gap-2.5 pl-1 shrink-0">
                <div className="text-right flex flex-col justify-center">
                  <p className="text-[14px] font-display font-black text-slate-800 leading-none">{weather?.temp}°C</p>
                </div>
                <div className="bg-white w-8 h-8 rounded-xl flex items-center justify-center shadow-sm border border-slate-50 shrink-0">
                  <Sun className="w-4 h-4 text-amber-500" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
});

PremiumHero.displayName = 'PremiumHero';
