import React, { memo, Suspense, lazy } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { voiceService } from '../../lib/voiceService';
import { EmergencyGuide } from '../../types';

const PremiumHero = lazy(() => import('./PremiumHero').then(m => ({ default: m.PremiumHero })));
const EmergencyGuides = lazy(() => import('../emergency/EmergencyGuides').then(m => ({ default: m.EmergencyGuides })));

interface HomeViewProps {
  onTriggerAI: () => void;
  onSelectGuide: (guide: EmergencyGuide | null) => void;
  onSeeAllGuides: () => void;
  onShowLegal: () => void;
}

export const HomeView = memo(({ 
  onTriggerAI, 
  onSelectGuide, 
  onSeeAllGuides, 
  onShowLegal 
}: HomeViewProps) => {
  return (
    <div className="flex flex-col bg-[#fbfbfd] pb-24 pt-1">
      <Suspense fallback={
        <div className="px-6 pt-10 flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        </div>
      }>
        <PremiumHero 
          onTriggerAI={onTriggerAI} 
          onSelectGuide={onSelectGuide}
          onSeeAllGuides={onSeeAllGuides}
        />
      </Suspense>

      {/* Topic Selection Section Header */}
      <div className="px-6 pt-16 pb-6 flex flex-col items-center text-center">
        <p className="text-[11px] font-black text-red-600 uppercase tracking-[0.25em] mb-1.5">Não tem a certeza do que fazer?</p>
        <h3 className="text-[18px] font-display font-black text-slate-800 uppercase tracking-tight">Escolha um tópico</h3>
      </div>

      <div className="relative z-10 pt-2">
        <Suspense fallback={<div className="h-40 bg-slate-50 mx-6 rounded-3xl animate-pulse" />}>
          <EmergencyGuides 
            limit={3} 
            onSeeAll={onSeeAllGuides} 
            onSelect={onSelectGuide}
          />
        </Suspense>
      </div>

      <div className="px-6 mt-4">
         <button 
          onClick={() => {
            onSeeAllGuides();
            voiceService.speak("Abrindo catálogo completo de guias de emergência.");
          }}
          className="w-full py-3 text-[9px] font-black text-slate-900 uppercase tracking-[0.2em] bg-white ios-shadow border border-slate-100 rounded-[28px] hover:bg-slate-50 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
         >
           Ver Catálogo Completo
           <ChevronRight className="w-3 h-3 text-red-500" />
         </button>
      </div>

      <div className="p-8 text-center mt-0 pb-8 space-y-4">
        <div className="flex flex-col items-center gap-4">
           <button 
            onClick={() => {
              onShowLegal();
              voiceService.speak("Termos e Condições");
            }} 
            className="px-6 py-2.5 glass ios-shadow border border-white/60 rounded-full text-[9px] font-black uppercase tracking-widest text-[#1d1d1f] hover:bg-white transition-all active:scale-95"
           >
             Termos e Condições
           </button>
           <div className="space-y-1">
            <p className="font-display font-black text-[10px] text-slate-400 uppercase tracking-[0.4em]">
              SOS MAIS
            </p>
            <p className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">
              Sistema Civil
            </p>
           </div>
        </div>
      </div>
    </div>
  );
});

HomeView.displayName = 'HomeView';
