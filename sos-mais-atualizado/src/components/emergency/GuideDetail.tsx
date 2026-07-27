import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, ChevronRight, Share2, Info, DownloadCloud, Check, Loader2 } from 'lucide-react';
import { EmergencyGuide } from '../../types';
import { cn } from '../../lib/utils';

interface GuideDetailProps {
  guide: EmergencyGuide | null;
  onClose: () => void;
}

export function GuideDetail({ guide, onClose }: GuideDetailProps) {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (guide) {
      const saved = localStorage.getItem('downloaded_guides');
      if (saved) {
        const savedIds = JSON.parse(saved) as string[];
        setIsDownloaded(savedIds.includes(guide.id));
      }
    }
  }, [guide]);

  const handleDownload = () => {
    if (!guide) return;
    
    if (isDownloaded) {
      // Remove logic
      const saved = localStorage.getItem('downloaded_guides');
      const savedIds = saved ? JSON.parse(saved) as string[] : [];
      const newIds = savedIds.filter(id => id !== guide.id);
      localStorage.setItem('downloaded_guides', JSON.stringify(newIds));
      setIsDownloaded(false);
      window.dispatchEvent(new Event('downloaded_guides_changed'));
      return;
    }

    // Download logic with simulation
    setDownloading(true);
    
    setTimeout(() => {
      const saved = localStorage.getItem('downloaded_guides');
      const savedIds = saved ? JSON.parse(saved) as string[] : [];
      if (!savedIds.includes(guide.id)) {
        savedIds.push(guide.id);
        localStorage.setItem('downloaded_guides', JSON.stringify(savedIds));
      }
      setIsDownloaded(true);
      setDownloading(false);
      window.dispatchEvent(new Event('downloaded_guides_changed'));
    }, 1500);
  };

  if (!guide) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40 backdrop-blur-sm">
        <motion.div 
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          className="bg-white w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="px-8 py-5 border-b border-slate-50 flex items-center justify-between sticky top-0 bg-white z-10">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-none">{guide.title}</h2>
                {isDownloaded && (
                  <span className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border border-green-200">
                    <Check className="w-2.5 h-2.5" /> Disponível Offline
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">Guia de Resposta Imediata</p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                   if (navigator.share) {
                     navigator.share({
                       title: `Guia SOS: ${guide.title}`,
                       text: guide.description,
                       url: window.location.href,
                     });
                   }
                }}
                className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
              >
                <Share2 className="w-5 h-5" />
              </button>
              <button 
                onClick={onClose} 
                className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto pt-0 px-8 pb-8 space-y-4">
            {downloading && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="pt-4"
              >
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       <Loader2 className="w-3 h-3 animate-spin" /> A descarregar pacote offline...
                    </span>
                  </div>
                  <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 1.5 }}
                      className="h-full bg-slate-900"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            <div className="p-5 bg-blue-50/50 rounded-3xl border border-blue-100/50 space-y-3 mt-2">
              <div className="flex items-center gap-2 text-blue-600">
                <Info className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Aviso Operacional</span>
              </div>
              <p className="text-[11px] text-blue-700 font-medium leading-relaxed italic">
                "{guide.description}"
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em]">Protocolo de Ação</h3>
                <span className="text-[9px] font-black text-slate-300 uppercase">{guide.steps.length} Etapas</span>
              </div>

              <div className="space-y-3">
                {guide.steps.map((step, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={i} 
                    className="p-5 bg-white border border-slate-100 rounded-3xl flex gap-4 shadow-sm"
                  >
                    <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center shrink-0 text-white text-[10px] font-black">
                      0{i + 1}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[12px] text-slate-800 font-bold leading-relaxed">{step}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="p-6 bg-red-50 rounded-3xl border border-red-100 space-y-4">
              <div className="flex items-center gap-2 text-red-600">
                <CheckCircle2 className="w-5 h-5" />
                <h4 className="text-[11px] font-black uppercase tracking-widest">Conselho de Especialista</h4>
              </div>
              <p className="text-[11px] text-red-700 font-bold uppercase leading-relaxed tracking-tight">
                Em caso de agravamento, não hesite. Ligue 112 imediatamente. O SOS MAIS está aqui para orientar, mas as autoridades são o seu resgate final.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-8 border-t border-slate-50 bg-slate-50/50 flex gap-4">
            <button 
              onClick={handleDownload}
              disabled={downloading}
              className={cn(
                "flex-1 p-4 border rounded-2xl shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest",
                isDownloaded ? "bg-red-50 border-red-200 text-red-600" : "bg-white border-slate-200 text-slate-900 hover:shadow-md"
              )}
            >
              {downloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>A Processar...</span>
                </>
              ) : isDownloaded ? (
                <>
                  <X className="w-4 h-4" />
                  <span>Remover Offline</span>
                </>
              ) : (
                <>
                  <DownloadCloud className="w-4 h-4" />
                  <span>Tornar Offline</span>
                </>
              )}
            </button>
            <button 
              onClick={onClose}
              className="flex-[1.5] py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-900/10 hover:bg-slate-800 transition-all active:scale-[0.98]"
            >
              Entendido
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
