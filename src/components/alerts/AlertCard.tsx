import React from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Clock, MapPin, Share2 } from 'lucide-react';
import { Alert } from '../../types';
import { cn, formatTime } from '../../lib/utils';
import { geocodeService } from '../../services/geocodeService';

const SEVERITY_LABELS = {
  high: 'Crítico',
  medium: 'Importante',
  low: 'Informativo'
};

const SOURCES: Record<string, string> = {
  weather: 'IPMA',
  seismic: 'IPMA / EMSC',
  fire: 'Fogos.pt / ANEPC',
  info: 'SOS+ Automação'
};

const TYPE_ICONS: Record<string, any> = {
  weather: AlertCircle,
  seismic: AlertCircle,
  fire: AlertCircle,
  info: AlertCircle
};

interface AlertCardProps {
  alert: Alert;
  isNew: boolean;
  distance: number | null;
  onShare: (alert: Alert, distance: number | null) => void;
}

export const AlertCard = React.memo(({ alert, isNew, distance, onShare }: AlertCardProps) => {
  const Icon = TYPE_ICONS[alert.type] || AlertCircle;
  const address = geocodeService.getCachedAddress(alert.location.lat, alert.location.lng);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ 
        opacity: 1, 
        y: 0,
        scale: isNew && alert.severity === 'high' ? [1, 1.02, 1] : 1,
        borderColor: isNew && alert.severity === 'high' ? ['#e2e8f0', '#ef4444', '#e2e8f0'] : '#e2e8f0'
      }}
      transition={{
        scale: { repeat: isNew ? Infinity : 0, duration: 1.5 },
        borderColor: { repeat: isNew ? Infinity : 0, duration: 1.5 },
        opacity: { duration: 0.2 },
        y: { duration: 0.2 }
      }}
      className={cn(
        "bg-white border rounded-[18px] overflow-hidden shadow-sm hover:shadow-md transition-shadow relative will-change-transform",
        isNew && alert.severity === 'high' && "ring-2 ring-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.15)] border-red-500"
      )}
    >
      <div className={cn(
        "px-3 py-1.5 flex items-center justify-between",
        alert.severity === 'high' ? "bg-red-600" :
        alert.severity === 'medium' ? "bg-orange-50" :
        "bg-blue-50"
      )}>
         <span className={cn(
           "text-[7px] font-black uppercase tracking-[0.15em]",
           alert.severity === 'high' ? "text-white" :
           alert.severity === 'medium' ? "text-orange-700" :
           "text-blue-700"
         )}>
           {alert.severity === 'high' ? '⚠️ CRÍTICO' : SEVERITY_LABELS[alert.severity]}
         </span>
         <span className={cn(
           "text-[7px] font-bold uppercase tracking-widest",
           alert.severity === 'high' ? "text-red-100" : "text-slate-400"
         )}>
           Fonte: {SOURCES[alert.type] || 'Oficial'}
         </span>
      </div>

      <div className="p-3 flex gap-2.5">
        <div className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
          alert.severity === 'high' ? "bg-red-600 text-white" :
          alert.severity === 'medium' ? "bg-orange-500 text-white" :
          "bg-blue-500 text-white"
        )}>
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex-1 space-y-0.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-slate-900 leading-tight text-[10px] uppercase tracking-tight truncate">{alert.title}</h3>
            <div className="flex items-center gap-1 text-[8px] text-slate-400 font-mono shrink-0">
              <Clock className="w-2.5 h-2.5" />
              {formatTime(alert.timestamp)}
            </div>
          </div>
          <p className="text-[9px] text-slate-500 leading-snug pr-2 line-clamp-2">{alert.description}</p>
          
          {address && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1 mt-1.5 px-1.5 py-0.5 bg-slate-50 rounded-md inline-flex border border-slate-100 max-w-full overflow-hidden"
            >
              <MapPin className="w-2 h-2 text-slate-400 shrink-0" />
              <span className="text-[7px] font-black uppercase text-slate-500 tracking-widest truncate">
                {address}
              </span>
            </motion.div>
          )}
          
          <div className="pt-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="flex items-center gap-1 text-[8px] font-extrabold text-slate-400 uppercase tracking-tighter shrink-0">
                <MapPin className={cn("w-2.5 h-2.5", distance !== null && distance <= 10 ? "text-red-500" : "text-slate-300")} />
                {distance !== null ? `${distance.toFixed(1)} km` : 'Validado'}
              </div>
              {distance !== null && distance <= 5 && (
                <span className="px-1 py-0.5 bg-red-100 text-red-700 text-[6px] font-black uppercase tracking-widest rounded-md border border-red-200 shrink-0">
                  PRÓXIMO
                </span>
              )}
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onShare(alert, distance);
              }}
              className="flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100 rounded-full border border-slate-100 transition-colors active:scale-90 shrink-0"
            >
              <Share2 className="w-2.5 h-2.5 text-slate-600" />
              <span className="text-[7px] font-black uppercase tracking-widest text-slate-600">Partilhar</span>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

AlertCard.displayName = 'AlertCard';
