import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, ShieldPlus, AlertTriangle, MessageSquare, Phone, Map as MapIcon, ClipboardCheck, Info, Cloud, Waves, Sun, User, Mic, Database } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { voiceService } from '../lib/voiceService';
import { speechService } from '../lib/voiceCommandService';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Início', icon: Shield },
  { id: 'alerts', label: 'Alertas', icon: AlertTriangle },
  { id: 'chat', label: 'IA', icon: MessageSquare },
  { id: 'prepare', label: 'Prevenção', icon: ClipboardCheck },
  { id: 'contacts', label: 'Contactos', icon: Phone },
];

export const Shell = React.memo(({ children, activeTab, onTabChange, onProfileClick }: { 
  children: React.ReactNode, 
  activeTab: string, 
  onTabChange: (id: string) => void,
  onProfileClick: () => void
}) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    const checkListening = () => {
      const isActuallyListening = localStorage.getItem('sos_mais_voice_commands') !== 'false';
      setIsListening(isActuallyListening);
    };

    checkListening();
    window.addEventListener('storage', checkListening);
    window.addEventListener('voice-settings-updated', checkListening);
    
    return () => {
      window.removeEventListener('storage', checkListening);
      window.removeEventListener('voice-settings-updated', checkListening);
    };
  }, []);

  const handleTabChange = React.useCallback((id: string, label: string) => {
    onTabChange(id);
    voiceService.speak(label);
    if ('vibrate' in navigator) navigator.vibrate(10);
  }, [onTabChange]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const navItems = React.useMemo(() => NAV_ITEMS, []);

  return (
    <div className="flex flex-col h-dvh bg-[#fbfbfd] text-[#1d1d1f] font-sans overflow-hidden">
      {/* Brand Header - Minimal Apple Style */}
      <header className="bg-white/80 px-6 py-5 flex items-center justify-between sticky top-0 z-30 border-b border-black/[0.02]">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              onTabChange('home');
              voiceService.speak("Início");
            }}
            className="flex items-center gap-2.5 active:scale-95 transition-transform"
          >
            <div className="bg-[#1d1d1f] w-8 h-8 rounded-[10px] flex items-center justify-center shadow-lg shadow-black/10">
              <ShieldPlus className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-display font-black text-lg tracking-tight uppercase leading-none flex items-center gap-1">
              SOS <span className="text-red-600">MAIS</span>
            </h1>
          </button>

          {isListening && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-full border border-blue-100"
            >
              <div className="relative flex items-center justify-center">
                <Mic className="w-2.5 h-2.5 text-blue-600" />
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                  className="absolute w-full h-full bg-blue-400/20 rounded-full -z-10"
                />
              </div>
              <span className="text-[6px] font-black text-blue-600 uppercase tracking-widest hidden xs:block">Ativo</span>
            </motion.div>
          )}
        </div>
        <button 
          onClick={() => {
            onProfileClick();
            voiceService.speak("Perfil do utilizador");
          }}
          className="relative w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border-2 border-white ios-shadow hover:scale-105 transition-all active:scale-95 group bg-slate-100"
          aria-label="Perfil"
        >
          {user?.photoURL ? (
            <img 
              referrerPolicy="no-referrer"
              src={user.photoURL} 
              alt={user.displayName || 'Perfil'} 
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-5 h-5 text-slate-400 group-hover:text-[#1d1d1f] transition-colors" />
          )}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1, ease: "linear" }}
            className="flex flex-col h-full max-w-md mx-auto will-change-transform"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Navigation - Floating iOS Dock */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <nav className="bg-white/90 px-2 py-2 flex items-center gap-1.5 rounded-full border border-white shadow-xl ring-1 ring-black/5">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id, item.label)}
                className={cn(
                  "flex flex-col items-center justify-center min-w-[64px] h-11 rounded-full transition-all duration-150 relative group",
                  isActive ? "bg-slate-950 text-white shadow-md" : "text-slate-400 hover:bg-black/5"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5 transition-transform duration-150",
                  isActive ? "scale-105" : "group-hover:scale-105"
                )} />
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
});

Shell.displayName = 'Shell';
