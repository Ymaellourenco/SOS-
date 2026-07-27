import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Lock, Eye, Check, X, ChevronRight, Settings } from 'lucide-react';

interface PrivacyCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: PrivacySettings) => void;
}

export interface PrivacySettings {
  strictlyNecessary: boolean;
  performance: boolean;
  marketing: boolean;
}

export function PrivacyCenter({ isOpen, onClose, onSave }: PrivacyCenterProps) {
  const [settings, setSettings] = useState<PrivacySettings>({
    strictlyNecessary: true, // Always true
    performance: true,
    marketing: false,
  });

  const [activeTab, setActiveTab] = useState<'overview' | 'preferences'>('overview');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40 backdrop-blur-sm">
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="bg-white w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Centro de Privacidade</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Identidade SOS MAIS</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          <div className="flex gap-4 p-1 bg-slate-50 rounded-2xl">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'overview' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}
            >
              Visão Geral
            </button>
            <button 
              onClick={() => setActiveTab('preferences')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'preferences' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}
            >
              Preferências
            </button>
          </div>

          {activeTab === 'overview' ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Privacidade como prioridade</h3>
                <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                  No SOS MAIS, protegemos a sua informação com transparência total. Cada byte de localização é encriptado e usado exclusivamente para resposta a emergências reais.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {[
                  { icon: Shield, title: "Proteção Total", desc: "Nenhum dado é vendido a terceiros." },
                  { icon: Lock, title: "Autonomia", desc: "Opções claras sobre as suas preferências." },
                  { icon: Settings, title: "Dados Locais", desc: "O perfil de saúde é guardado apenas no seu dispositivo." }
                ].map((item, i) => (
                  <div key={i} className="flex gap-4 p-4 border border-slate-100 rounded-2xl bg-white">
                    <item.icon className="w-5 h-5 text-slate-900 shrink-0" />
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-black uppercase tracking-wide text-slate-900">{item.title}</h4>
                      <p className="text-[9px] text-slate-400 font-medium">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-4">
                {/* Strictly Necessary */}
                <div className="p-5 border border-slate-100 rounded-[24px] flex items-center justify-between opacity-80">
                  <div className="space-y-1 pr-8">
                    <h4 className="text-[11px] font-black text-slate-900 uppercase">Estritamente Necessários</h4>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Sempre Ativo</p>
                  </div>
                  <div className="w-10 h-6 bg-slate-900 rounded-full flex items-center px-1">
                    <div className="w-4 h-4 bg-white rounded-full ml-4" />
                  </div>
                </div>

                {/* Performance */}
                <div className="p-5 border border-slate-100 rounded-[24px] flex items-center justify-between">
                  <div className="space-y-1 pr-8">
                    <h4 className="text-[11px] font-black text-slate-900 uppercase">Performance & Rede</h4>
                    <p className="text-[9px] text-slate-400 font-medium">Ajuda-nos a otimizar a velocidade do sinal oficial SOS.</p>
                  </div>
                  <button 
                    onClick={() => setSettings(s => ({...s, performance: !s.performance}))}
                    className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors ${settings.performance ? 'bg-slate-900' : 'bg-slate-200'}`}
                  >
                    <motion.div 
                      animate={{ x: settings.performance ? 16 : 0 }}
                      className="w-4 h-4 bg-white rounded-full shadow-sm"
                    />
                  </button>
                </div>

                {/* Marketing */}
                <div className="p-5 border border-slate-100 rounded-[24px] flex items-center justify-between">
                  <div className="space-y-1 pr-8">
                    <h4 className="text-[11px] font-black text-slate-900 uppercase">Segurança & IA</h4>
                    <p className="text-[9px] text-slate-400 font-medium">Dicas de prevenção personalizadas de acordo com o seu perfil.</p>
                  </div>
                  <button 
                    onClick={() => setSettings(s => ({...s, marketing: !s.marketing}))}
                    className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors ${settings.marketing ? 'bg-slate-900' : 'bg-slate-200'}`}
                  >
                    <motion.div 
                      animate={{ x: settings.marketing ? 16 : 0 }}
                      className="w-4 h-4 bg-white rounded-full shadow-sm"
                    />
                  </button>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-center gap-2">
                <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Em conformidade com o RGPD</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-slate-50 flex gap-3">
          {activeTab === 'preferences' && (
            <button 
              onClick={() => onSave({ strictlyNecessary: true, performance: true, marketing: true })}
              className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
            >
              Aceitar Tudo
            </button>
          )}
          <button 
            onClick={() => onSave(settings)}
            className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-900/10 hover:bg-slate-800 transition-all active:scale-[0.98]"
          >
            Guardar Definições
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function CookieBanner({ onOpenSettings, onAcceptAll }: { onOpenSettings: () => void, onAcceptAll: () => void }) {
  return (
    <motion.div 
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-6 left-6 right-6 z-[90] max-w-sm mx-auto sm:ml-0 bg-white border border-slate-100 rounded-[32px] p-6 shadow-2xl flex flex-col gap-5"
    >
      <div className="flex gap-4">
        <div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center shrink-0">
          <Lock className="w-5 h-5 text-slate-900" />
        </div>
        <div className="space-y-1">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">RGPD SOS MAIS</h3>
          <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
            Utilizamos protocolos de rede para garantir uma resposta imediata a emergências.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button 
          onClick={onOpenSettings}
          className="flex-1 py-3 text-[9px] font-black uppercase tracking-widest border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors"
        >
          Ajustar
        </button>
        <button 
          onClick={onAcceptAll}
          className="flex-1 py-3 text-[9px] font-black uppercase tracking-widest bg-slate-900 text-white rounded-xl shadow-lg shadow-slate-900/10 hover:bg-slate-800 transition-all active:scale-95"
        >
          Aceitar Tudo
        </button>
      </div>
    </motion.div>
  );
}
