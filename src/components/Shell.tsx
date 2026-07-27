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
            className="flex items-center gap-2 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-[12px] overflow-hidden shadow-lg shadow-black/10 shrink-0">
              <img src="/icons/icon-192.png" alt="SOS Mais" className="w-full h-full object-cover" />
            </div>
            <h1 className="font-display font-black text-lg tracking-tight uppercase leading-none flex items-center gap-1">
              SOS <span className="text-red-600">MAIS</span>
            </h1>
          </button>
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
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
                className="flex flex-col items-center justify-center min-w-[64px] h-11 rounded-full relative group"
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-active-pill"
                    className="absolute inset-0 bg-slate-950 rounded-full shadow-md"
                    transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.8 }}
                  />
                )}
                <item.icon className={cn(
                  "w-5 h-5 relative z-10 transition-transform duration-150",
                  isActive ? "text-white scale-105" : "text-slate-400 group-hover:scale-105 group-hover:text-slate-600"
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
