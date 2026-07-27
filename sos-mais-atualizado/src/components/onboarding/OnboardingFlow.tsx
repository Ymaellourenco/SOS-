import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Navigation, 
  Bell, 
  ShieldCheck, 
  Phone, 
  MapPin, 
  ArrowRight, 
  Smartphone,
  Info,
  CheckCircle2,
  ChevronDown
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface OnboardingFlowProps {
  onComplete: (data: OnboardingData) => void;
}

export interface OnboardingData {
  permissions: {
    location: boolean;
    notifications: boolean;
  }
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [permissions, setPermissions] = useState({ location: false, notifications: false });
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const handleComplete = () => {
    onComplete({
      permissions
    });
  };

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col font-sans">
      <AnimatePresence mode="wait">
        <motion.div 
          key="authorizations"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="flex-1 flex flex-col p-8 sm:max-w-md sm:mx-auto w-full overflow-y-auto"
        >
          <div className="pt-12 mb-10 text-center">
            <div className="inline-flex p-4 rounded-[28px] bg-slate-50 mb-6">
              <ShieldCheck className="w-10 h-10 text-slate-900" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">SOS <span className="text-red-600">MAIS</span></h1>
            <p className="text-[12px] text-slate-400 font-bold uppercase tracking-widest mt-3">Sincronização de Segurança</p>
          </div>

          <div className="space-y-6 flex-1">
            <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100 space-y-4">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
                  <Navigation className="w-5 h-5 text-blue-500" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-black text-slate-900 uppercase">Geolocalização SOS</h3>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                    Autorização necessária para que o SOS MAIS o encontre com precisão absoluta em caso de emergência.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
                  <Bell className="w-5 h-5 text-amber-500" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-black text-slate-900 uppercase">Canais Prioritários</h3>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                    Receba avisos instantâneos sobre perigos locais e confirmações de sinal de resgate.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[11px] text-slate-400 text-center font-medium px-4">
                O SOS MAIS utiliza dados em tempo real para sua proteção física. Os seus dados permanecem no dispositivo até ao disparo do sinal.
              </p>
              <div className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl cursor-pointer" onClick={() => setAcceptedTerms(!acceptedTerms)}>
                <div 
                  className={cn(
                    "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                    acceptedTerms ? "bg-slate-900 border-slate-900" : "bg-white border-slate-200"
                  )}
                >
                  {acceptedTerms && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                </div>
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-tight cursor-pointer">
                  Aceito os termos e condições de conformidade
                </label>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <button 
              disabled={!acceptedTerms}
              onClick={handleComplete}
              className="w-full py-5 bg-slate-900 text-white rounded-[24px] text-[11px] font-black uppercase tracking-widest shadow-2xl shadow-slate-900/10 hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale"
            >
              Ativar Terminal & Entrar
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
