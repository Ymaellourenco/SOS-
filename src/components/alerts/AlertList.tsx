import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Wind, Activity, Flame, ShieldAlert, ShieldCheck, MapPin, ChevronRight, Loader2, RefreshCw, Navigation, Map as MapIcon, List as ListIcon, Calendar } from 'lucide-react';
import { Alert } from '../../types';
import { cn, calculateDistance } from '../../lib/utils';
import { voiceService } from '../../lib/voiceService';
import { AlertCard } from './AlertCard';
import { useAlerts } from '../../hooks/useAlerts';

const AlertMap = React.lazy(() => import('./AlertMap').then(m => ({ default: m.AlertMap })));

import { geocodeService } from '../../services/geocodeService';
import { toast } from 'react-hot-toast';
import { logger } from '../../lib/logger';

const SOURCES: Record<string, string> = {
  weather: 'IPMA',
  seismic: 'IPMA / EMSC',
  fire: 'Fogos.pt / ANEPC',
  info: 'SOS+ Automação'
};

const TYPE_ICONS: Record<string, any> = {
  weather: Wind,
  seismic: Activity,
  fire: Flame,
  info: ShieldCheck
};

const NEARBY_THRESHOLD_KM = 50;

export function AlertList() {
  const { 
    alerts, 
    loading, 
    error, 
    userLocation, 
    locationStatus, 
    isApproximateLocation,
    fetchAlerts, 
    handleRetryLocation,
    newlyNotified,
    lastUpdated
  } = useAlerts();

  const [filterMode, setFilterMode] = useState<'all' | 'nearby'>('nearby');
  const [viewMode, setViewMode] = useState<'list' | 'map'>(() => {
    // Se a pessoa veio do chat da IA a pedir para "escolher no mapa", abre já
    // diretamente na vista de mapa, em vez de na lista — poupa-lhe um toque extra.
    if (sessionStorage.getItem('sos_mais_open_map') === 'true') {
      sessionStorage.removeItem('sos_mais_open_map');
      return 'map';
    }
    return 'list';
  });
  const [tick, setTick] = useState(0);
  const [fireRisk, setFireRisk] = useState<{ rcm: number; riskLabel: string } | null>(null);

  // Risco de incêndio rural (índice preventivo diário do IPMA, por concelho) — pedido
  // pelo utilizador para aparecer aqui, na secção de Alertas, não na página principal.
  useEffect(() => {
    if (!userLocation) return;
    let cancelled = false;
    fetch(`/api/fire-risk?lat=${userLocation.lat}&lng=${userLocation.lng}`, { signal: AbortSignal.timeout(6000) })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!cancelled && data?.rcm) setFireRisk({ rcm: data.rcm, riskLabel: data.riskLabel });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userLocation]);

  // Força um novo render a cada 30s só para o texto "Atualizado há X min" se manter correto.
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return null;
    const diffMin = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
    if (diffMin < 1) return 'agora mesmo';
    if (diffMin === 1) return 'há 1 minuto';
    return `há ${diffMin} minutos`;
  }, [lastUpdated, tick]);
  const [sortBy, setSortBy] = useState<'date' | 'proximity'>('date');

  const handleShare = useCallback(async (alert: Alert, distance: number | null) => {
    const severityPrefix = alert.severity === 'high' ? '⚠️ ALERTA CRÍTICO' : '📢 AVISO';
    const distanceInfo = distance !== null ? `📍 Aprox. ${distance.toFixed(1)} km da posição atual.` : '';
    
    const shareData = {
      title: `Alerta SOS MAIS: ${alert.title}`,
      text: `${severityPrefix}\n\n${alert.title}\n${alert.description}\n\n${distanceInfo}\n\nFonte: ${SOURCES[alert.type] || 'Oficial'}\n\nPartilhado via SOS MAIS.`,
      url: window.location.origin
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.title}\n\n${shareData.text}\n\n${shareData.url}`);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') logger.error('Error sharing:', err);
    }
  }, []);

  const filteredAlerts = useMemo(() => {
    return alerts
      .filter(alert => {
        const ageHours = (Date.now() - alert.timestamp.getTime()) / (3600 * 1000);
        if (filterMode === 'nearby' && alert.severity === 'low' && ageHours > 24) return false;
        if (filterMode === 'all') return true;
        if (!userLocation) return false;

        const distance = calculateDistance(userLocation.lat, userLocation.lng, alert.location.lat, alert.location.lng);
        return distance <= NEARBY_THRESHOLD_KM;
      })
      .sort((a, b) => {
        const severityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
        const rankA = severityRank[a.severity] ?? 3;
        const rankB = severityRank[b.severity] ?? 3;
        if (rankA !== rankB) return rankA - rankB;

        if (sortBy === 'proximity' && userLocation) {
          const distA = calculateDistance(userLocation.lat, userLocation.lng, a.location.lat, a.location.lng);
          const distB = calculateDistance(userLocation.lat, userLocation.lng, b.location.lat, b.location.lng);
          return distA - distB;
        }
        return b.timestamp.getTime() - a.timestamp.getTime();
      });
  }, [alerts, filterMode, sortBy, userLocation]);

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex flex-col gap-4 mb-2">
        <div className="flex items-center justify-between flex-wrap gap-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <h2 className="font-black text-sm uppercase tracking-tighter">Alertas</h2>
          </div>
          <div className="flex items-center gap-2">

            {loading && <RefreshCw className="w-3.5 h-3.5 text-slate-300 animate-spin" />}
            {lastUpdatedLabel && (
              <span className="text-[7px] font-bold uppercase text-slate-300 tracking-tight">
                Atualizado {lastUpdatedLabel}
              </span>
            )}
            <div className="flex items-center gap-1.5 bg-red-100 px-2.5 py-1.5 rounded-xl border border-red-200">
               <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
               <span className="text-[8px] text-red-600 font-black uppercase tracking-widest">DIRETO</span>
            </div>
          </div>
        </div>

        <div className="flex bg-slate-200/50 p-1 rounded-2xl">
          <button
            onClick={() => {
              setFilterMode('nearby');
              voiceService.speak("Filtrar por alertas perto de mim.");
            }}
            className={cn(
              "flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2",
              filterMode === 'nearby' ? "bg-white text-slate-900 shadow-xl shadow-slate-900/5" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Navigation className={cn("w-3 h-3", filterMode === 'nearby' && "text-red-500 fill-red-500")} />
            Perto de Mim
          </button>
          <button
            onClick={() => {
              setFilterMode('all');
              voiceService.speak("Ver todos os alertas nacionais.");
            }}
            className={cn(
              "flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all relative",
              filterMode === 'all' ? "bg-white text-slate-900 shadow-xl shadow-slate-900/5" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Nacional
            {alerts.some(a => a.severity === 'high') && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full border-2 border-white animate-pulse" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white border border-slate-100 p-1 rounded-2xl flex shadow-sm">
             <button 
               onClick={() => setViewMode('list')}
               className={cn(
                 "flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
                 viewMode === 'list' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:bg-slate-50"
               )}
             >
               <ListIcon className="w-3 h-3" />
               Lista
             </button>
             <button 
               onClick={() => setViewMode('map')}
               className={cn(
                 "flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
                 viewMode === 'map' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:bg-slate-50"
               )}
             >
               <MapIcon className="w-3 h-3" />
               Mapa
             </button>
          </div>
        </div>
      </div>

      {loading && alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-widest italic">Sincronizando com IPMA & Fogos.pt...</p>
        </div>
      ) : error && alerts.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-[32px] border-2 border-red-50 shadow-sm space-y-6">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <RefreshCw className="w-8 h-8 text-red-600 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h3 className="font-black text-xs text-slate-900 uppercase tracking-tight">Falha na Sincronização</h3>
            <p className="text-[10px] text-slate-500 leading-relaxed font-bold uppercase max-w-[200px] mx-auto">
              {error}
            </p>
          </div>
          <button 
            onClick={() => fetchAlerts()}
            className="w-full py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all active:scale-[0.98] shadow-lg shadow-red-200 flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sincronizar Agora
          </button>
        </div>
      ) : filterMode === 'nearby' && (locationStatus === 'denied' || locationStatus === 'error') ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 px-6 text-center space-y-6 bg-slate-50 rounded-[32px] border border-slate-200">
          {/* ... existing location error UI ... */}
          <div className="bg-white p-5 rounded-full shadow-lg shadow-slate-200/50">
            <Navigation className={cn("w-8 h-8", locationStatus === 'error' ? "text-slate-400" : "text-red-500")} />
          </div>
          <div className="space-y-2">
            <h3 className="font-black text-xs text-slate-900 uppercase tracking-tight">
              {locationStatus === 'denied' ? 'Geolocalização Bloqueada' : 'Erro de Localização'}
            </h3>
            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
              {locationStatus === 'denied' 
                ? 'Não conseguimos detetar a sua posição para filtrar alertas próximos.'
                : 'Ocorreu um erro técnico ao tentar obter a sua localização.'}
            </p>
          </div>

          <div className="w-full bg-white p-4 rounded-2xl border border-slate-100 text-left space-y-3">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">
              {locationStatus === 'denied' ? 'Como reativar:' : 'Sugestões:'}
            </p>
            <div className="space-y-2">
              {locationStatus === 'denied' ? (
                <>
                  <div className="flex gap-2">
                    <span className="w-4 h-4 bg-slate-900 text-white flex items-center justify-center rounded text-[8px] font-bold shrink-0">1</span>
                    <p className="text-[9px] text-slate-600 leading-tight">Clique no ícone de <strong>Cadeado</strong> ou <strong>Definições</strong> na barra de endereço do browser.</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-4 h-4 bg-slate-900 text-white flex items-center justify-center rounded text-[8px] font-bold shrink-0">2</span>
                    <p className="text-[9px] text-slate-600 leading-tight">Altere a permissão de <strong>Localização</strong> para "Permitir" ou "Sempre".</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-4 h-4 bg-slate-900 text-white flex items-center justify-center rounded text-[8px] font-bold shrink-0">3</span>
                    <p className="text-[9px] text-slate-600 leading-tight">Clique em <strong>Tentar Novamente</strong> abaixo.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <span className="w-4 h-4 bg-slate-900 text-white flex items-center justify-center rounded text-[8px] font-bold shrink-0">1</span>
                    <p className="text-[9px] text-slate-600 leading-tight">Verifique se o GPS do seu dispositivo está ligado.</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-4 h-4 bg-slate-900 text-white flex items-center justify-center rounded text-[8px] font-bold shrink-0">2</span>
                    <p className="text-[9px] text-slate-600 leading-tight">Certifique-se que tem uma ligação estável à internet.</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-4 h-4 bg-slate-900 text-white flex items-center justify-center rounded text-[8px] font-bold shrink-0">3</span>
                    <p className="text-[9px] text-slate-600 leading-tight">O sistema tentará reconectar automaticamente em 30 segundos.</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <button 
            onClick={handleRetryLocation}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-[0.98] shadow-xl shadow-slate-900/10 flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Tentar Novamente
          </button>
          
          <button 
            onClick={() => setFilterMode('all')}
            className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
          >
            Explorar Alertas Nacionais
          </button>
        </div>
      ) : filterMode === 'nearby' && !userLocation ? (
        <div className="flex flex-col items-center justify-center py-20 animate-pulse text-slate-400 gap-4 bg-white/50 border border-slate-100 rounded-[32px] border-dashed">
          <div className="relative">
            <Navigation className="w-10 h-10 text-slate-200" />
            <motion.div 
               animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }}
               transition={{ repeat: Infinity, duration: 2 }}
               className="absolute inset-0 bg-blue-500/20 rounded-full"
            />
          </div>
          <div className="text-center space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest">A aguardar GPS...</p>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">Sincronizando alertas com a sua posição atual</p>
          </div>
        </div>
      ) : (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-4"
      >
        {((filterMode === 'nearby' && userLocation) || (filterMode === 'nearby' && fireRisk)) && (
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar">
            {filterMode === 'nearby' && userLocation && (
              <motion.div 
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-full shadow-sm shrink-0 min-w-0"
              >
                <Navigation className="w-3 h-3 text-white fill-white shrink-0" />
                <p className="text-[9px] font-black uppercase tracking-tight leading-none whitespace-nowrap">
                  A 50km de {userLocation.lat.toFixed(2)}°N, {Math.abs(userLocation.lng).toFixed(2)}°W
                </p>
              </motion.div>
            )}

            {filterMode === 'nearby' && fireRisk && (
              <div className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm shrink-0 min-w-0",
                fireRisk.rcm >= 5 ? "bg-red-50 border-red-200" :
                fireRisk.rcm === 4 ? "bg-orange-50 border-orange-200" :
                fireRisk.rcm === 3 ? "bg-amber-50 border-amber-200" :
                "bg-emerald-50 border-emerald-200"
              )}>
                <span className="text-[11px] leading-none shrink-0">🔥</span>
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-tight leading-none whitespace-nowrap",
                  fireRisk.rcm >= 5 ? "text-red-600" :
                  fireRisk.rcm === 4 ? "text-orange-600" :
                  fireRisk.rcm === 3 ? "text-amber-600" :
                  "text-emerald-600"
                )}>
                  Risco de Incêndio: <span className="text-slate-800">{fireRisk.riskLabel}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {viewMode === 'map' ? (
          <div className="space-y-4">
            <React.Suspense fallback={
              <div className="flex flex-col items-center justify-center h-[400px] bg-slate-50 rounded-[32px] gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">A carregar mapa...</p>
              </div>
            }>
              <AlertMap alerts={filteredAlerts} userLocation={userLocation} viewScope={filterMode === 'nearby' ? 'nearby' : 'all'} />
            </React.Suspense>
          </div>
        ) : filteredAlerts.length === 0 ? (
            <div className="p-12 text-center text-slate-400 italic">
              <p className="text-xs font-bold uppercase tracking-widest">
                {filterMode === 'nearby' 
                  ? `Sem incidentes num raio de ${NEARBY_THRESHOLD_KM}km` 
                  : 'Sem alertas ativos de momento'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAlerts.slice(0, filterMode === 'nearby' ? 10 : 20).map((alert) => {
                const distance = userLocation ? calculateDistance(
                  userLocation.lat,
                  userLocation.lng,
                  alert.location.lat,
                  alert.location.lng
                ) : null;

                return (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    isNew={newlyNotified.has(alert.id)}
                    distance={distance}
                    onShare={handleShare}
                  />
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      <div className="mt-8 p-6 bg-slate-100 rounded-[32px] border border-slate-200 text-center">
        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-loose max-w-[240px] mx-auto">
          Informação agregada de organismos oficiais portugueses (IPMA & Fogos.pt). Os dados podem sofrer atrasos de propagação técnica.
        </p>
      </div>
    </div>
  );
}
