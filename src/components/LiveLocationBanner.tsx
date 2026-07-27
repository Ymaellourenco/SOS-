import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Radio, X } from 'lucide-react';
import { liveLocationService, LiveLocationState } from '../lib/liveLocationService';
import { voiceService } from '../lib/voiceService';

export function LiveLocationBanner() {
  const [state, setState] = useState<LiveLocationState>(liveLocationService.getState());

  useEffect(() => {
    return liveLocationService.subscribe(setState);
  }, []);

  if (!state.active) return null;

  const elapsedMin = state.startedAt ? Math.floor((Date.now() - state.startedAt) / 60000) : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -60, opacity: 0 }}
        className="fixed top-0 left-0 right-0 z-[9998] bg-red-600 text-white px-4 py-2 flex items-center justify-between gap-3 shadow-lg"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Radio className="w-4 h-4 shrink-0 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-wider truncate">
            A partilhar localização ao vivo {elapsedMin > 0 ? `há ${elapsedMin} min` : ''}
          </span>
        </div>
        <button
          onClick={() => {
            liveLocationService.stop();
            voiceService.speak("Partilha de localização terminada.");
          }}
          className="flex items-center gap-1 bg-white/15 hover:bg-white/25 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-wider transition-colors shrink-0"
        >
          <X className="w-3 h-3" />
          Parar
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
