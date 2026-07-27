import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Flame, Waves, Activity, Heart, Wind, ChevronRight, Check } from 'lucide-react';
import { OFFLINE_GUIDES } from '../../constants';
import { EmergencyGuide } from '../../types';
import { cn } from '../../lib/utils';
import { voiceService } from '../../lib/voiceService';

const CATEGORY_ICONS = {
  heart: Heart,
  fire: Flame,
  quake: Activity,
  flood: Waves,
  drowning: Waves,
};

const GuideCard = React.memo(({ 
  guide, 
  index, 
  isDownloaded, 
  onClick 
}: { 
  guide: EmergencyGuide, 
  index: number, 
  isDownloaded: boolean, 
  onClick: () => void 
}) => {
  const Icon = CATEGORY_ICONS[guide.category as keyof typeof CATEGORY_ICONS] || BookOpen;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      whileTap={{ scale: 0.98 }}
      className="glass ios-shadow p-5 rounded-[28px] flex items-center gap-4 cursor-pointer border border-white/40 hover:bg-white/90 transition-all relative overflow-hidden will-change-transform"
      onClick={onClick}
    >
      <div className={cn(
        "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ios-shadow border border-white/20",
        guide.category === 'fire' ? "bg-orange-100/50 text-orange-600" :
        guide.category === 'heart' ? "bg-red-100/50 text-red-600" :
        guide.category === 'quake' ? "bg-amber-100/50 text-amber-600" :
        "bg-blue-100/50 text-blue-600"
      )}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-black text-[13px] text-slate-800 truncate uppercase tracking-tight">{guide.title}</h3>
          {isDownloaded && (
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded-full border border-green-100"
            >
              <Check className="w-2.5 h-2.5 text-green-600" strokeWidth={3} />
              <span className="text-[7px] text-green-600 font-heavy uppercase tracking-[0.05em]">OFFLINE</span>
            </motion.div>
          )}
        </div>
        <p className="text-[11px] text-slate-400 font-bold line-clamp-1 uppercase tracking-tight mt-1">{guide.description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300" />
    </motion.div>
  );
});

GuideCard.displayName = 'GuideCard';

export function EmergencyGuides({ onSelect, limit, onSeeAll }: { onSelect?: (guide: EmergencyGuide) => void, limit?: number, onSeeAll?: () => void }) {
  const [downloadedIds, setDownloadedIds] = useState<string[]>([]);
  const guides = limit ? OFFLINE_GUIDES.slice(0, limit) : OFFLINE_GUIDES;

  useEffect(() => {
    const checkDownloaded = () => {
      const saved = localStorage.getItem('downloaded_guides');
      setDownloadedIds(saved ? JSON.parse(saved) : []);
    };

    checkDownloaded();
    window.addEventListener('storage', checkDownloaded);
    window.addEventListener('downloaded_guides_changed', checkDownloaded);

    return () => {
      window.removeEventListener('storage', checkDownloaded);
      window.removeEventListener('downloaded_guides_changed', checkDownloaded);
    };
  }, []);

  return (
    <div className="px-6 space-y-5 pb-0">
      <div className="grid grid-cols-1 gap-3">
        {guides.map((guide, index) => (
          <GuideCard 
            key={guide.id}
            guide={guide}
            index={index}
            isDownloaded={downloadedIds.includes(guide.id)}
            onClick={() => {
              voiceService.speak(`A abrir guia: ${guide.title}`);
              onSelect?.(guide);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ShieldCheck({ className }: { className?: string }) {
  return (
    <svg 
      className={className}
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24" 
      xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
    </svg>
  );
}
