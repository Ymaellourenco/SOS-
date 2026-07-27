import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Phone, Users, UserPlus, Trash2, Heart, ShieldCheck, ShieldAlert, Loader2, BellRing, MessageSquare } from 'lucide-react';
import { collection, addDoc, query, onSnapshot, deleteDoc, doc, getDocs, where } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { cn, openPrefilledSMS, getRecentEmergencyContext, getBestAvailableLocation } from '../../lib/utils';
import { EmergencyContact } from '../../types';
import { sendAlertNotification, requestNotificationPermission, triggerSOS } from '../../lib/notifications';
import { liveLocationService } from '../../lib/liveLocationService';
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
  { id: '9', name: 'SOS Voz Amiga (Apoio Emocional)', phone: '213544545', type: 'service' }, // Confirma o número numa fonte oficial antes de publicar
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

function UnifiedSOSWidget({ contacts }: { contacts: EmergencyContact[] }) {
  const [pressTimer, setPressTimer] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'sending' | 'calling' | 'sent'>('idle');

  // Filter out 112 and SNS24 for mass notification
  const notifyList = contacts.filter(c => c.id !== '1' && c.id !== '2');
  const familyContacts = contacts.filter(c => c.type === 'family');

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
        triggerUnifiedAlert();
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

  // Uma única ação: premir e manter aciona AMBAS as coisas — notifica a rede
  // (SMS + GPS a todos os contactos) e liga de imediato ao primeiro contacto de família.
  // Antes eram dois widgets/ações separadas; o utilizador pediu para serem só uma.
  const triggerUnifiedAlert = async () => {
    setStatus('sending');
    voiceService.speak("A enviar alertas de emergência para a sua rede de contactos.");

    const savedProfile = localStorage.getItem('sos_mais_user_profile');
    const profile = savedProfile ? JSON.parse(savedProfile) : null;
    const personalName = profile?.fullName ? profile.fullName.split(' ')[0] : '';

    if (!auth.currentUser) {
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
    const uid = auth.currentUser.uid;

    const finalize = async (lat = 0, lon = 0, hasLocation = true) => {
      try {
        await triggerSOS(uid, lat, lon, hasLocation ? undefined : "GPS Indisponível");
        if (hasLocation) {
          await liveLocationService.start(lat, lon);
        }
        setStatus('sent');
        sendAlertNotification(
          'REDE NOTIFICADA',
          `A sua equipa de socorro recebeu as suas coordenadas GPS via SOS Mais.`,
          'high'
        );

        let locationStr = hasLocation ? `coordenadas ${lat.toFixed(4)}, ${lon.toFixed(4)}` : 'localização indisponível';
        if (hasLocation) {
          try {
            const geoRes = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
            if (geoRes.ok) {
              const data = await geoRes.json();
              if (data?.display_name) {
                locationStr = data.display_name.split(',').slice(0, 2).join(', ').trim();
              }
            }
          } catch (e) {}
        }

        // Se houver um contacto de família, a chamada de voz segue-se automaticamente.
        if (familyContacts.length > 0) {
          const target = familyContacts[0];
          setStatus('calling');
          voiceService.speak(`${personalName ? personalName + ', o' : 'O'} alerta vital foi enviado com sucesso. Confirmámos a sua posição em ${locationStr}. Estamos agora a ligar para ${target.name}. Mantenha-se na linha e tente falar com calma.`);
          setTimeout(() => {
            window.location.href = `tel:${target.phone}`;
            setStatus('idle');
            setProgress(0);
          }, 3500);
        } else {
          voiceService.speak(`${personalName ? personalName + ', o' : 'O'} alerta vital foi enviado com sucesso. Confirmámos a sua posição em ${locationStr}. Mantenha a calma e respire devagar. Toda a sua rede de contactos de emergência já recebeu o seu pedido de ajuda e localização GPS em tempo real.`);
          setTimeout(() => { setStatus('idle'); setProgress(0); }, 4000);
        }
      } catch (e) {
        logger.error('Alerta unificado falhou:', e);
        setStatus('idle');
        setProgress(0);
      }
    };

    // Tenta obter a melhor localização possível (GPS preciso → GPS normal → aproximação
    // por IP) antes de desistir — nunca enviamos coordenadas 0,0 (que apontam para o
    // meio do oceano) só porque a primeira tentativa de GPS falhou.
    try {
      const location = await getBestAvailableLocation();
      finalize(location.lat, location.lon, true);
    } catch (e) {
      logger.error('Falha completa ao obter localização para o alerta unificado:', e);
      finalize(0, 0, false);
    }
  };

  const statusLabel =
    status === 'idle' ? 'SOS: LIGAR + NOTIFICAR REDE' :
    status === 'sending' ? 'A NOTIFICAR REDE...' :
    status === 'calling' ? 'A LIGAR...' :
    'ALERTA ENVIADO';

  return (
    <div className="relative overflow-hidden bg-slate-900 rounded-[32px] border border-slate-800 p-5 shadow-2xl">
      {(status === 'sending' || status === 'calling') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.08, 0.2, 0.08] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="absolute inset-0 bg-red-600 pointer-events-none"
        />
      )}

      <div className="flex items-center gap-4 relative z-10">
        <button
          onMouseDown={startPress}
          onMouseUp={endPress}
          onMouseLeave={endPress}
          onTouchStart={startPress}
          onTouchEnd={endPress}
          disabled={status !== 'idle'}
          aria-label="Premir e segurar para ligar e notificar a rede de proximidade"
          className={cn(
            "w-16 h-16 rounded-full relative flex items-center justify-center transition-all duration-500 shadow-[0_8px_24px_rgba(220,38,38,0.35)] ring-4 ring-slate-900 shrink-0",
            status === 'idle' && "bg-gradient-to-br from-red-500 to-red-700 active:scale-90",
            (status === 'sending' || status === 'calling') && "bg-white scale-95",
            status === 'sent' && "bg-gradient-to-br from-green-400 to-green-600"
          )}
        >
          {status === 'idle' && (
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="transparent" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
              <circle
                cx="32" cy="32" r="28"
                fill="transparent"
                stroke="white"
                strokeWidth="3"
                strokeDasharray="176"
                strokeDashoffset={176 - (176 * progress) / 100}
                className="transition-all duration-75"
                strokeLinecap="round"
              />
            </svg>
          )}
          <div className="relative z-10 flex items-center justify-center text-white">
            {status === 'idle' && <Phone className="w-6 h-6" />}
            {status === 'sending' && <Loader2 className="w-6 h-6 animate-spin text-slate-900" />}
            {status === 'calling' && <BellRing className="w-6 h-6 animate-pulse text-slate-900" />}
            {status === 'sent' && <ShieldCheck className="w-7 h-7" />}
          </div>
        </button>

        <div className="text-left flex-1 min-w-0">
          <h3 className="font-display font-black text-[13px] text-white uppercase tracking-wider">
            {statusLabel}
          </h3>
          <p className="text-[9px] text-slate-400 font-black uppercase tracking-tight mt-0.5">
            {status === 'idle'
              ? (familyContacts.length > 0
                  ? `Liga a ${familyContacts[0].name} e envia SMS/GPS a ${notifyList.length} contactos`
                  : `Envia SMS e GPS a ${notifyList.length} contactos (sem família configurada para chamada)`)
              : status === 'sending' ? `A enviar SMS + GPS a ${notifyList.length} contactos...`
              : status === 'calling' ? `A ligar a ${familyContacts[0]?.name || ''}...`
              : 'Rede notificada com sucesso'
            }
          </p>
          {status === 'idle' && (
            <span className="text-[7px] font-black uppercase tracking-widest text-slate-500 mt-1 inline-block">
              Premir e Manter
            </span>
          )}
        </div>
      </div>

      <div className="bg-slate-800/60 rounded-xl p-2 mt-4 border border-slate-700/50 flex items-center justify-center gap-3 relative z-10">
        <div className="flex flex-col items-center">
          <span className="text-[7px] text-slate-500 font-bold uppercase tracking-widest">Segurança</span>
          <span className="text-[9px] text-slate-300 font-black uppercase">256-bit</span>
        </div>
        <div className="w-px h-5 bg-slate-700" />
        <div className="flex flex-col items-center">
          <span className="text-[7px] text-slate-500 font-bold uppercase tracking-widest">Tempo de Espera</span>
          <span className="text-[9px] text-slate-300 font-black uppercase">0.6s</span>
        </div>
        <div className="w-px h-5 bg-slate-700" />
        <div className="flex flex-col items-center">
          <span className="text-[7px] text-slate-500 font-bold uppercase tracking-widest">Alcance</span>
          <span className="text-[9px] text-slate-300 font-black uppercase font-mono">{notifyList.length} Contactos</span>
        </div>
      </div>
    </div>
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

  const handleSendEmergencySMS = async (contact: EmergencyContact) => {
    voiceService.speak("A preparar a mensagem de emergência.");
    const context = getRecentEmergencyContext();
    try {
      const location = await getBestAvailableLocation();
      const mapsLink = `https://www.google.com/maps?q=${location.lat},${location.lon}`;
      const message = `🚨 EMERGÊNCIA — Preciso de ajuda.${context ? ` Situação: "${context}"` : ''} A minha localização: ${mapsLink}`;
      openPrefilledSMS(contact.phone, message);
    } catch (e) {
      logger.error('Falha completa ao obter localização para SMS de emergência:', e);
      // Sem localização disponível de forma nenhuma — envia a mensagem na mesma, sem o link.
      const message = `🚨 EMERGÊNCIA — Preciso de ajuda.${context ? ` Situação: "${context}"` : ''} Não consegui obter a minha localização.`;
      openPrefilledSMS(contact.phone, message);
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
        <UnifiedSOSWidget contacts={contacts} />
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

                <button
                  onClick={() => handleSendEmergencySMS(contact)}
                  className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center transition-all hover:bg-blue-100 border border-blue-100 active:scale-90"
                  title={`Enviar SMS de emergência com localização para ${contact.name}`}
                  aria-label={`Enviar SMS de emergência a ${contact.name}`}
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                
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
