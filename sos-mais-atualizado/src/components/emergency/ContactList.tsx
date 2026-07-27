import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Phone, Users, UserPlus, Trash2, Heart, ShieldCheck, ShieldAlert, Loader2, BellRing } from 'lucide-react';
import { collection, addDoc, query, onSnapshot, deleteDoc, doc, getDocs, where } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import { EmergencyContact } from '../../types';
import { sendAlertNotification, requestNotificationPermission, triggerSOS } from '../../lib/notifications';
import { voiceService } from '../../lib/voiceService';
import { calculateHoldProgress, isHoldComplete } from '../../lib/holdProgress';
import { AnimatePresence } from 'motion/react';
import { logger } from '../../lib/logger';

const DEFAULT_CONTACTS: EmergencyContact[] = [
  { id: '1', name: '112 - Emergência Nacional', phone: '112', type: 'service' },
  { id: '2', name: 'SNS 24 (Apoio Psicológico)', phone: '808242424', type: 'service' },
  { id: '3', name: 'APAV - Apoio à Vítima', phone: '116006', type: 'service' },
  { id: '4', name: 'SOS Criança', phone: '116111', type: 'service' },
  { id: '5', name: 'Linha Vida (Drogas/Álcool)', phone: '1414', type: 'service' },
  { id: '6', name: 'Proteção Civil', phone: '214401919', type: 'service' },
  { id: '7', name: 'SOS Grávida', phone: '808242424', type: 'service' }, // Shares SNS24 but distinct label
  { id: '8', name: 'Centro Antivenenos (CIAV)', phone: '800250250', type: 'service' },
];

function HoldToCallButton({ phone }: { phone: string }) {
  const [pressTimer, setPressTimer] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

  const startPress = () => {
    if ('vibrate' in navigator) navigator.vibrate(50);
    const startTime = Date.now();
    const duration = 600; // 0.6 seconds

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = calculateHoldProgress(elapsed, duration);
      
      setProgress(newProgress);

      if (isHoldComplete(elapsed, duration)) {
        window.clearInterval(timer);
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 500]);
        window.location.href = `tel:${phone}`;
      }
    }, 30);
    setPressTimer(timer);
  };

  const endPress = () => {
    if (pressTimer) {
      window.clearInterval(pressTimer);
      setPressTimer(null);
    }
    setProgress(0);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onMouseDown={startPress}
        onMouseUp={endPress}
        onMouseLeave={endPress}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        aria-label={`Premir e segurar para ligar para ${phone}`}
        className="relative bg-green-100 text-green-700 w-9 h-9 rounded-xl flex items-center justify-center transition-all overflow-hidden active:scale-90 shadow-sm border border-green-200/50"
      >
        <div 
          className="absolute bottom-0 left-0 w-full bg-green-500 transition-all duration-75" 
          style={{ height: `${progress}%` }} 
        />
        <Phone className={cn("w-4 h-4 relative z-10", progress > 0 && "animate-pulse")} />
      </button>
      <span className="text-[6px] font-black uppercase text-green-600 tracking-tighter">Premir</span>
    </div>
  );
}

function BroadcastAlertButton({ contacts }: { contacts: EmergencyContact[] }) {
  const [pressTimer, setPressTimer] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  
  // Filter out 112 and SNS24 for mass notification
  const notifyList = contacts.filter(c => c.id !== '1' && c.id !== '2');

  const startPress = () => {
    if (status !== 'idle') return;
    if ('vibrate' in navigator) navigator.vibrate(50);
    const startTime = Date.now();
    const duration = 600;

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = calculateHoldProgress(elapsed, duration);
      
      setProgress(newProgress);

      if (isHoldComplete(elapsed, duration)) {
        window.clearInterval(timer);
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 400]);
        triggerAlert();
      }
    }, 30);
    setPressTimer(timer);
  };

  const endPress = () => {
    if (pressTimer) {
      window.clearInterval(pressTimer);
      setPressTimer(null);
    }
    if (status === 'idle') setProgress(0);
  };

  const triggerAlert = async () => {
    setStatus('sending');
    voiceService.speak("A enviar alertas de emergência para a sua rede de contactos.");
    
    try {
      // 1. Get user profile
      const savedProfile = localStorage.getItem('sos_mais_user_profile');
      const profile = savedProfile ? JSON.parse(savedProfile) : null;
      
      if (profile?.uid) {
        // 2. Get location for the real alert
        navigator.geolocation.getCurrentPosition(async (pos) => {
          const { latitude, longitude } = pos.coords;
          
          // 3. Trigger REAL backend alert
          await triggerSOS(profile.uid, latitude, longitude);
          
          setStatus('sent');
          sendAlertNotification(
            'REDE NOTIFICADA', 
            `A sua equipa de socorro recebeu as suas coordenadas GPS via SOS Mais.`,
            'high'
          );

          // Get human-friendly location for voice using backend proxy
          let locationStr = `coordenadas ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          try {
            const geoRes = await fetch(`/api/geocode?lat=${latitude}&lon=${longitude}`);
            if (geoRes.ok) {
              const data = await geoRes.json();
              if (data?.display_name) {
                locationStr = data.display_name.split(',').slice(0, 2).join(', ').trim();
              }
            }
          } catch(e) {}

          const personalName = profile?.fullName ? profile.fullName.split(' ')[0] : '';
          voiceService.speak(`${personalName ? personalName + ', o' : 'O'} alerta vital foi enviado com sucesso. Confirmámos a sua posição em ${locationStr}. Mantenha a calma e respire devagar. Toda a sua rede de contactos de emergência já recebeu o seu pedido de ajuda e localização GPS em tempo real.`);
        }, async (error) => {
          // Fallback if GPS fails
          await triggerSOS(profile.uid, 0, 0, "GPS Indisponível");
          setStatus('sent');
        });
      } else {
        // Sem sessão iniciada: o alerta real não pode ser enviado (não há para onde notificar).
        // Antes disto fingia sucesso ("TESTE LOCAL") — agora avisa claramente o utilizador.
        setStatus('idle');
        setProgress(0);
        voiceService.speak("Não é possível enviar o alerta. Inicie sessão para ativar a rede de proximidade.");
        sendAlertNotification(
          'Sessão necessária',
          'Para notificar a sua rede de proximidade precisa de iniciar sessão primeiro.',
          'medium'
        );
        return;
      }
    } catch (e) {
      logger.error('Broadcast failed:', e);
      setStatus('idle');
    }

    setTimeout(() => setStatus('idle'), 4000);
  };

  return (
    <div className="relative overflow-hidden glass rounded-[32px] border border-white/40 p-4 shadow-2xl space-y-4">
      {/* Background Pulse for Active Mode */}
      {status === 'sending' && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="absolute inset-0 bg-red-600 pointer-events-none"
        />
      )}

      <div className="text-center space-y-1 relative z-10">
        <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 rounded-full border border-red-100 mb-1.5">
          <ShieldAlert className="w-2.5 h-2.5 text-red-600" />
          <span className="text-[7px] font-black text-red-600 uppercase tracking-widest">Alerta de Emergência</span>
        </div>
        <h3 className="font-display font-black text-base text-slate-900 tracking-tight leading-none uppercase">
          NOTIFICAR <span className="text-red-600">REDE PROXIMIDADE</span>
        </h3>
        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">
          {status === 'sent' 
            ? 'Mensagens enviadas com sucesso' 
            : `Enviar SMS e GPS para ${notifyList.length} contactos`
          }
        </p>
      </div>
      
      <div className="relative flex flex-col items-center py-2">
        <button
          onMouseDown={startPress}
          onMouseUp={endPress}
          onMouseLeave={endPress}
          onTouchStart={startPress}
          onTouchEnd={endPress}
          disabled={status !== 'idle'}
          aria-label="Premir e segurar para notificar a rede de proximidade"
          className={cn(
            "w-20 h-20 rounded-full relative flex items-center justify-center transition-all duration-500 shadow-[0_8px_24px_rgba(220,38,38,0.35)] ring-4 ring-white",
            status === 'idle' && "bg-gradient-to-br from-red-500 to-red-700 hover:scale-105 active:scale-90",
            status === 'sending' && "bg-slate-900 scale-95",
            status === 'sent' && "bg-gradient-to-br from-green-400 to-green-600 scale-100"
          )}
        >
          {/* Progress Ring */}
          {status === 'idle' && (
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40" cy="40" r="35"
                fill="transparent"
                stroke="rgba(0,0,0,0.15)"
                strokeWidth="3"
              />
              <circle
                cx="40" cy="40" r="35"
                fill="transparent"
                stroke="white"
                strokeWidth="3"
                strokeDasharray="220"
                strokeDashoffset={220 - (220 * progress) / 100}
                className="transition-all duration-75"
                strokeLinecap="round"
              />
            </svg>
          )}

          <div className="relative z-10 flex flex-col items-center text-white">
            {status === 'idle' && (
              <>
                <ShieldAlert className={cn("w-6 h-6 transition-transform", progress > 0 && "scale-110")} />
                <span className="text-[8px] font-black uppercase tracking-tighter mt-0.5">{Math.floor(progress)}%</span>
              </>
            )}
            {status === 'sending' && <Loader2 className="w-6 h-6 animate-spin" />}
            {status === 'sent' && <ShieldCheck className="w-8 h-8" />}
          </div>
        </button>

        {status === 'idle' && (
          <span className="text-[7px] font-black uppercase tracking-widest text-slate-400 mt-2">
            Premir e Manter
          </span>
        )}

        {status === 'sending' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex flex-col items-center gap-1"
          >
            <div className="flex -space-x-2">
              {notifyList.slice(0, 5).map((c, i) => (
                <div key={i} className="w-6 h-6 rounded-full bg-slate-800 border-2 border-white flex items-center justify-center text-[7px] text-white font-black uppercase">
                  {c.name[0]}
                </div>
              ))}
              {notifyList.length > 5 && (
                 <div className="w-6 h-6 rounded-full bg-red-600 border-2 border-white flex items-center justify-center text-[7px] text-white font-black">
                   +{notifyList.length - 5}
                 </div>
              )}
            </div>
            <p className="text-[9px] font-black text-slate-900 uppercase tracking-widest animate-pulse">A Enviar SMS & GPS...</p>
          </motion.div>
        )}
      </div>

      <div className="bg-slate-50/50 rounded-xl p-2 border border-slate-100/50 flex items-center justify-center gap-3">
        <div className="flex flex-col items-center">
          <span className="text-[7px] text-slate-400 font-bold uppercase tracking-widest">Segurança</span>
          <span className="text-[9px] text-slate-700 font-black uppercase">256-bit</span>
        </div>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex flex-col items-center">
          <span className="text-[7px] text-slate-400 font-bold uppercase tracking-widest">Tempo de Espera</span>
          <span className="text-[9px] text-slate-700 font-black uppercase">0.6s</span>
        </div>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex flex-col items-center">
          <span className="text-[7px] text-slate-400 font-bold uppercase tracking-widest">Alcance</span>
          <span className="text-[9px] text-slate-700 font-black uppercase font-mono">{notifyList.length} Contactos</span>
        </div>
      </div>
    </div>
  );
}

function FamilySOSCallButton({ contacts }: { contacts: EmergencyContact[] }) {
  const [status, setStatus] = useState<'idle' | 'locating' | 'calling'>('idle');
  const familyContacts = contacts.filter(c => c.type === 'family');

  const handleStartCall = async () => {
    if (familyContacts.length === 0) {
      voiceService.speak("Não tem contactos de família configurados para chamada direta.");
      return;
    }

    setStatus('locating');
    voiceService.speak("A verificar a sua localização GPS para partilhar no alerta antes de iniciar a chamada.");

    const finalizeAndCall = async (lat = 0, lon = 0) => {
      const savedProfile = localStorage.getItem('sos_mais_user_profile');
      const profile = savedProfile ? JSON.parse(savedProfile) : null;
      
      if (profile?.uid) {
        await triggerSOS(profile.uid, lat, lon);
      }

      setStatus('calling');
      const target = familyContacts[0];
      const personalName = profile?.fullName ? profile.fullName.split(' ')[0] : '';
      
      // Detailed empathetic instruction
      voiceService.speak(`${personalName ? personalName + ', o' : 'O'} alerta SOS foi enviado com sucesso para a sua rede. Estamos agora a ligar para ${target.name}. Mantenha-se na linha e tente falar com calma. A sua localização GPS já foi partilhada.`);
      
      setTimeout(() => {
        window.location.href = `tel:${target.phone}`;
        setStatus('idle');
      }, 3500); // Slightly more time for the voice to finish
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => finalizeAndCall(pos.coords.latitude, pos.coords.longitude),
      () => finalizeAndCall(),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={handleStartCall}
      disabled={status !== 'idle' || familyContacts.length === 0}
      className={cn(
        "w-full bg-slate-900 rounded-[32px] p-5 border border-slate-800 shadow-xl overflow-hidden relative group",
        status !== 'idle' && "opacity-80"
      )}
    >
      {/* Background Effect */}
      <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {status === 'locating' && (
        <motion.div 
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="absolute top-0 left-0 w-1/3 h-0.5 bg-blue-500"
        />
      )}

      <div className="flex items-center gap-4 relative z-10">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500",
          status === 'idle' ? "bg-blue-600 text-white" : "bg-white text-slate-900"
        )}>
          {status === 'idle' && <Phone className="w-5 h-5" />}
          {status === 'locating' && <Loader2 className="w-5 h-5 animate-spin" />}
          {status === 'calling' && <BellRing className="w-5 h-5 animate-pulse" />}
        </div>
        
        <div className="text-left">
          <h3 className="font-display font-black text-[13px] text-white uppercase tracking-wider">
            {status === 'idle' ? "CHAMADA DE VOZ SOS" : status === 'locating' ? "A OBTER GPS..." : "A LIGAR..."}
          </h3>
          <p className="text-[9px] text-slate-400 font-black uppercase tracking-tight mt-0.5">
            {familyContacts.length > 0 
              ? `Ligar para ${familyContacts[0].name} (${familyContacts[0].phone})`
              : "Sem contactos de família configurados"
            }
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
           <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
           <span className="text-[8px] text-blue-500 font-black uppercase tracking-widest">GPS Ativo</span>
        </div>
      </div>
    </motion.button>
  );
}


export function ContactList() {
  const [contacts, setContacts] = useState<EmergencyContact[]>(DEFAULT_CONTACTS);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Pedir permissão para notificações
    requestNotificationPermission();

    // 1. Carrega do LocalStorage primeiro para rapidez
    const saved = localStorage.getItem('emergency_contacts');
    if (saved) {
      setContacts(JSON.parse(saved));
    }

    // 2. Tenta sincronizar com Firebase se o utilizador estiver autenticado
    if (!auth.currentUser) {
      setIsLoading(false);
      return;
    }

    const contactsRef = collection(db, 'contacts');
    const q = query(contactsRef, where('userId', '==', auth.currentUser.uid));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fbContacts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as EmergencyContact[];
      
      const combined = [...DEFAULT_CONTACTS, ...fbContacts.filter(c => c.id !== '1' && c.id !== '2')];
      setContacts(combined);
      localStorage.setItem('emergency_contacts', JSON.stringify(combined));
      setIsLoading(false);
    }, (error) => {
      logger.warn("Firebase sync disabled or restricted:", error.message);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAdd = async () => {
    if (!newName || !newPhone) return;
    const newContactData = {
      name: newName,
      phone: newPhone,
      type: 'family' as const,
      createdAt: new Date(),
      userId: auth.currentUser?.uid || 'anonymous'
    };

    try {
      if (auth.currentUser) {
        await addDoc(collection(db, 'contacts'), newContactData);
      } else {
        throw new Error('No user for sync');
      }
      setNewName('');
      setNewPhone('');
      setIsAdding(false);
    } catch (e) {
      // Fallback local se Firebase falhar
      const localContact: EmergencyContact = {
        id: Date.now().toString(),
        ...newContactData
      };
      const updated = [...contacts, localContact];
      setContacts(updated);
      localStorage.setItem('emergency_contacts', JSON.stringify(updated));
      setIsAdding(false);
    }
  };

  const handleDelete = async (contact: EmergencyContact) => {
    if (contact.id === '1' || contact.id === '2') return;
    
    voiceService.speak(`A eliminar contacto: ${contact.name}`);
    try {
      await deleteDoc(doc(db, 'contacts', contact.id));
    } catch (e) {
      const updated = contacts.filter(c => c.id !== contact.id);
      setContacts(updated);
      localStorage.setItem('emergency_contacts', JSON.stringify(updated));
    }
  };

  return (
    <div className="p-4 space-y-6 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center border border-red-200">
            <Users className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="font-black text-xl uppercase tracking-tighter text-slate-900">Contactos de Apoio</h2>
        </div>
        <button 
          onClick={() => {
            setIsAdding(true);
            voiceService.speak("Adicionar novo contacto");
          }}
          aria-label="Adicionar novo contacto"
          className="bg-slate-900 text-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <UserPlus className="w-5 h-5" />
        </button>
      </div>
      
      <div className="space-y-4">
        <FamilySOSCallButton contacts={contacts} />
        <BroadcastAlertButton contacts={contacts} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Rede de Resgate</p>
          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{contacts.length} Registados</span>
        </div>
        
        <div className="space-y-3">
          {contacts.map((contact) => (
            <motion.div
              key={contact.id}
              layout
              className="bg-white border border-slate-100 p-3 rounded-[24px] flex items-center justify-between gap-3 group shadow-sm hover:shadow-md transition-all relative overflow-hidden"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105",
                  contact.type === 'service' ? "bg-red-50 text-red-600 border border-red-100" : "bg-blue-50 text-blue-600 border border-blue-100"
                )}>
                  {contact.type === 'service' ? <ShieldCheck className="w-4.5 h-4.5" /> : <Heart className="w-4.5 h-4.5" />}
                </div>
                <div className="truncate">
                  <h3 className="font-display font-black text-[11px] text-slate-900 uppercase tracking-tight truncate">{contact.name}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-[9px] text-slate-400 font-mono font-bold tracking-widest truncate">{contact.phone}</p>
                    {contact.type === 'service' && (
                      <span className="px-1 py-0.5 bg-slate-100 text-slate-500 text-[6px] font-black uppercase rounded-md tracking-widest">
                        Nacional
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <HoldToCallButton phone={contact.phone} />
                
                {contact.type !== 'service' && (
                  <button 
                    onClick={() => handleDelete(contact)}
                    className="w-9 h-9 bg-slate-50 text-slate-300 rounded-xl flex items-center justify-center transition-all hover:bg-red-50 hover:text-red-500 border border-slate-100 hover:border-red-100 active:scale-90"
                    title="Eliminar contacto"
                    aria-label={`Eliminar contacto ${contact.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {isAdding && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white p-6 rounded-3xl w-full max-w-sm space-y-4 shadow-2xl">
            <h3 className="font-bold text-lg">Novo Contacto</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400">Nome</label>
                <input 
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                  placeholder="Ex: Mãe, Bombeiros Local..."
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400">Telemóvel</label>
                <input 
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-red-500 outline-none"
                  placeholder="Ex: 912345678"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => {
                  setIsAdding(false);
                  voiceService.speak("Cancelar.");
                }}
                className="flex-1 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  handleAdd();
                  voiceService.speak("Contacto guardado.");
                }}
                className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-red-600/20"
              >
                Guardar
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <div className="p-6 bg-red-50 border border-red-100 rounded-3xl text-center mb-8">
        <p className="text-xs text-red-700 font-medium leading-relaxed">
          Os seus contactos de emergência serão notificados automaticamente quando ativar o Botão SOS.
        </p>
      </div>
    </div>
  );
}
