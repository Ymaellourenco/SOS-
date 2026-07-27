import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ClipboardCheck, Package, CheckCircle2, Circle, GraduationCap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { voiceService } from '../../lib/voiceService';

interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

const EMERGENCY_KIT: ChecklistItem[] = [
  { id: '1', label: 'Água (3 litros por pessoa por dia)', checked: false },
  { id: '2', label: 'Alimentos não perecíveis (enlatados, barras de cereais)', checked: false },
  { id: '3', label: 'Lanterna com pilhas extras', checked: false },
  { id: '4', label: 'Caixa de primeiros socorros básica', checked: false },
  { id: '5', label: 'Rádio a pilhas ou manivela', checked: false },
  { id: '6', label: 'Cópia de documentos importantes em saco estanque', checked: false },
  { id: '7', label: 'Dinheiro em numerário (notas de baixo valor)', checked: false },
  { id: '8', label: 'Manta térmica de emergência', checked: false },
];

export function Preparation() {
  const [kit, setKit] = useState(EMERGENCY_KIT);
  
  const toggleItem = (id: string, label: string) => {
    setKit(prev => {
      const newKit = prev.map(item => {
        if (item.id === id) {
          const newChecked = !item.checked;
          voiceService.speak(newChecked ? `Pronto: ${label}` : `Pendente: ${label}`);
          return { ...item, checked: newChecked };
        }
        return item;
      });

      // Milestone feedback
      const newProgress = Math.round((newKit.filter(i => i.checked).length / newKit.length) * 100);
      if (newProgress === 50) voiceService.speak("Metade do kit concluído. Bom trabalho.");
      if (newProgress === 100) voiceService.speak("Kit de emergência totalmente preparado. Está seguro.");
      
      return newKit;
    });
  };

  const progress = Math.round((kit.filter(i => i.checked).length / kit.length) * 100);

  return (
    <div className="p-5 space-y-6 pb-24">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardCheck className="w-5 h-5 text-red-600" />
        <h2 className="font-black text-lg uppercase tracking-tighter">Estado de Prontidão</h2>
      </div>

      {/* Score Card Muito Reduzido */}
      <div className="bg-slate-900 text-white p-5 rounded-[28px] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-red-600/5 blur-2xl rounded-full -mr-10 -mt-10" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Prontidão</p>
            <h3 className="text-3xl font-black italic tracking-tighter">{progress}%</h3>
            <p className="text-[8px] text-slate-400 mt-2 font-bold uppercase tracking-widest">
              {progress < 50 ? 'Risco Elevado.' : progress < 100 ? 'Ativo.' : 'Pronto.'}
            </p>
          </div>
          <div className="w-16 h-16 flex items-center justify-center relative">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40" cy="40" r="32"
                fill="transparent"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="6"
              />
              <circle
                cx="40" cy="40" r="32"
                fill="transparent"
                stroke="currentColor"
                strokeWidth="6"
                className="text-red-500"
                strokeDasharray={2 * Math.PI * 32}
                strokeDashoffset={2 * Math.PI * 32 * (1 - progress / 100)}
                style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
              />
            </svg>
            <Shield className="absolute w-5 h-5 text-white/90" />
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
        <div className="p-5 border-b bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-400" />
            <span className="font-black text-[10px] uppercase tracking-widest text-slate-500">Mochila de Emergência (72h)</span>
          </div>
          <span className="text-[10px] font-bold text-slate-400">{kit.filter(i=>i.checked).length}/{kit.length}</span>
        </div>
        <div className="divide-y divide-slate-50">
          {kit.map((item) => (
            <button
              key={item.id}
              onClick={() => toggleItem(item.id, item.label)}
              className="w-full px-5 py-5 flex items-center gap-4 hover:bg-slate-50/80 transition-colors text-left group"
            >
              {item.checked ? (
                <div className="bg-green-500 p-1 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                </div>
              ) : (
                <div className="bg-slate-100 p-1 rounded-lg group-hover:bg-slate-200 transition-colors">
                  <Circle className="w-4 h-4 text-slate-300 shrink-0" />
                </div>
              )}
              <span className={cn(
                "text-sm font-bold tracking-tight",
                item.checked ? "text-slate-300 line-through" : "text-slate-700"
              )}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Shield({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
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
