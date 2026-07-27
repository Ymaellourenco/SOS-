import React from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Phone, Lock } from 'lucide-react';
import { voiceService } from '../../lib/voiceService';
import { toast } from 'react-hot-toast';

interface SOSFullscreenProps {
  onClose: () => void;
}

export const SOSFullscreen = React.memo(({ onClose }: SOSFullscreenProps) => {
  const handleAbort = React.useCallback(() => {
    const now = Date.now();
    const lastTap = (window as any)._lastSOSSafetyTap || 0;
    if (now - lastTap < 400) {
      onClose();
      voiceService.speak("Sessão de emergência suspensa voluntariamente.");
      toast.success("Emergência concluída com segurança.", { icon: "🛡️" });
    } else {
      (window as any)._lastSOSSafetyTap = now;
      toast("Toque duas vezes seguidas para desativar o SOS", {
        icon: "🔒",
        style: { borderRadius: "12px", background: "#334155", color: "#fff", fontSize: "10px" }
      });
      if ('vibrate' in navigator) navigator.vibrate([100]);
    }
  }, [onClose]);

  const handleCall = React.useCallback(() => {
    voiceService.speak("A preparar chamada com o centro cento e doze.");
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 bg-[#0c0a09] z-[9999] flex flex-col justify-between p-6 text-white overflow-y-auto"
    >
      {/* Immersive Pulse Glow */}
      <div className="absolute inset-0 bg-red-950/20 pointer-events-none animate-pulse" />
      
      {/* Dynamic Ambient Takeover Content */}
      <div className="flex flex-col items-center justify-center flex-1 text-center py-10 relative z-10 space-y-8">
        <div className="w-24 h-24 rounded-full bg-red-600/10 border-4 border-red-600 flex items-center justify-center animate-pulse shadow-[0_0_50px_rgba(220,38,38,0.3)] overflow-hidden">
          <img src="/icons/icon-192.png" alt="SOS Mais" className="w-14 h-14 rounded-2xl object-cover animate-bounce" />
        </div>
        
        <div className="space-y-3">
          <h2 className="text-3xl font-black tracking-tight text-red-500 uppercase">
            PROTOCOLO SOS+ ATIVO
          </h2>
          <p className="text-xs font-bold text-slate-400 max-w-xs mx-auto leading-relaxed uppercase tracking-wider">
            SISTEMA CIVIL DE SEGURANÇA NACIONAL
          </p>
          <p className="text-[10px] font-black tracking-[0.25em] text-emerald-400 animate-pulse">
            RASTREADOR DE GPS ATIVO & CONTÍNUO
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-[32px] p-6 max-w-sm w-full text-slate-300 space-y-4">
          <p className="text-[10px] font-black tracking-wider uppercase text-slate-500 leading-none">
            Guia de Calma e Sobrevivência
          </p>
          <p className="font-sans text-[13px] leading-relaxed text-left">
            Mantenha a calma e respire fundo. Afaste-se de ameaças imediatas e tente manter o ecrã ativo na luminosidade máxima. O seu assistente está a monitorizar de perto.
          </p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="w-full max-w-sm mx-auto space-y-4 relative z-10 pb-8">
        <a 
          href="tel:112"
          onClick={handleCall}
          className="flex items-center justify-center gap-3 w-full py-4 text-sm font-black tracking-wider uppercase bg-red-600 text-white rounded-[28px] hover:bg-red-500 active:scale-95 transition-all shadow-[0_10px_30px_rgba(220,38,38,0.4)]"
        >
          <Phone className="w-4 h-4 text-white" />
          LIGAR PARA AS AUTORIDADES (112)
        </a>

        <button
          onClick={handleAbort}
          className="w-full py-3 text-[9px] font-black text-slate-400 hover:text-white uppercase tracking-[0.2em] bg-white/5 border border-white/10 rounded-[28px] hover:bg-white/10 transition-all flex items-center justify-center gap-2"
        >
          <Lock className="w-3 h-3 text-slate-400" />
          Toque Duplo para Abortar Protocolo
        </button>
      </div>
    </motion.div>
  );
});

SOSFullscreen.displayName = 'SOSFullscreen';
