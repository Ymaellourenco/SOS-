import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, User as UserIcon, Droplets, Pill, AlertTriangle, FileText, Calendar, Weight, Ruler, LogIn, LogOut, Trash2, Volume2, Mic } from 'lucide-react';
import { cn } from '../../lib/utils';
import { UserProfileData } from '../../types';
import { db, auth } from '../../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signOut, deleteUser } from 'firebase/auth';
import { requestNotificationPermission, getFCMToken } from '../../lib/notifications';
import { voiceService } from '../../lib/voiceService';
import { speechService } from '../../lib/voiceCommandService';
import { toast } from 'react-hot-toast';
import { logger } from '../../lib/logger';

const NOTIFICATION_SOUNDS = [
  { id: 'default', name: 'Alerta Padrão', url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
  { id: 'tech', name: 'Tech Beep', url: 'https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3' },
  { id: 'urgent', name: 'Urgente', url: 'https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3' },
  { id: 'digital', name: 'Digital Alert', url: 'https://assets.mixkit.co/active_storage/sfx/2517/2517-preview.mp3' },
];

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserProfileModal({ isOpen, onClose }: UserProfileModalProps) {
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfileData>({
    fullName: '',
    bloodType: '',
    medications: '',
    allergies: '',
    chronicConditions: '',
    weight: '',
    height: '',
    birthDate: '',
  });
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceCommandsEnabled, setVoiceCommandsEnabled] = useState(false);

  useEffect(() => {
    setVoiceEnabled(voiceService.isEnabled());
    setVoiceCommandsEnabled(localStorage.getItem('sos_mais_voice_commands') !== 'false');
    // Som de notificação: atribuído automaticamente, sem escolha manual do utilizador.
    if (!profile.notificationSound) {
      handleFieldChange('notificationSound', NOTIFICATION_SOUNDS[0].url);
    }
  }, []);

  const toggleVoice = () => {
    const newState = !voiceEnabled;
    voiceService.setEnabled(newState);
    setVoiceEnabled(newState);
  };

  const toggleVoiceCommands = () => {
    const newState = !voiceCommandsEnabled;
    localStorage.setItem('sos_mais_voice_commands', String(newState));
    setVoiceCommandsEnabled(newState);
    if (newState) {
      speechService.start(() => {});
    } else {
      speechService.stop();
    }
  };

  useEffect(() => {
    const loadProfile = async (user: any) => {
      setCurrentUser(user);
      // Se agora há uma sessão iniciada com sucesso, qualquer aviso de erro de login
      // anterior deixou de fazer sentido — limpa-o, para não ficar "preso" no ecrã
      // depois de um login que já resultou bem.
      if (user) {
        setLoginError(null);
      }
      // 1. Load from local first
      const saved = localStorage.getItem('sos_mais_user_profile');
      if (saved) {
        setProfile(JSON.parse(saved));
      }

      // 2. Load from Firestore if user exists
      if (user) {
        try {
          const docRef = doc(db, 'profiles', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfileData;
            setProfile(data);
            localStorage.setItem('sos_mais_user_profile', JSON.stringify(data));
          }
        } catch (e) {
          logger.error("Firebase load failed", e);
        }
      }
    };

    if (isOpen) {
      // Limpa qualquer aviso de erro de uma tentativa de login anterior sempre que o
      // perfil é reaberto — evita mostrar um erro antigo já ultrapassado.
      setLoginError(null);

      if ('fcm_token' in localStorage) {
        setFcmToken(localStorage.getItem('fcm_token'));
      }

      // Diagnóstico de notificações: pede a permissão e obtém o token automaticamente,
      // sem precisar de um botão manual ("Sincronizar Antena").
      requestNotificationPermission().then(async (granted) => {
        if (granted) {
          const token = await getFCMToken();
          setFcmToken(token);
        }
      }).catch((e) => logger.warn('Falha ao sincronizar notificações automaticamente', e));
      
      const unsubscribe = auth.onAuthStateChanged((user) => {
        loadProfile(user);
      });
      return () => unsubscribe();
    }
  }, [isOpen]);

  const handleSave = async (dataToSave = profile) => {
    setLoading(true);
    localStorage.setItem('sos_mais_user_profile', JSON.stringify(dataToSave));
    
    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'profiles', auth.currentUser.uid), dataToSave);
      } catch (e) {
        logger.error("Firebase save failed", e);
      }
    }

    if ('vibrate' in navigator) navigator.vibrate(50);
    setLoading(false);
    setHasChanges(false);
  };

  // Debounced Auto-save
  useEffect(() => {
    if (!hasChanges) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 2000); // 2 seconds of inactivity

    return () => clearTimeout(timer);
  }, [profile, hasChanges]);

  // Save on Close
  useEffect(() => {
    if (!isOpen && hasChanges) {
      handleSave();
    }
  }, [isOpen]);

  const handleFieldChange = (field: keyof UserProfileData, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      voiceService.speak("Sessão terminada.");
      toast.success('Sessão terminada');
    } catch (e) {
      logger.error("Logout failed", e);
      toast.error('Erro ao terminar sessão');
    }
  };

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleDeleteAccount = async () => {
    if (!auth.currentUser) return;
    setDeletingAccount(true);
    try {
      // 1. Remove profile document from Firestore
      try {
        await deleteDoc(doc(db, 'profiles', auth.currentUser.uid));
      } catch (e) {
        logger.error("Failed to delete profile document", e);
      }

      // 2. Delete the Firebase Auth account itself
      await deleteUser(auth.currentUser);

      // 3. Clear local data
      localStorage.removeItem('sos_mais_user_profile');
      localStorage.removeItem('fcm_token');

      toast.success('Conta eliminada com sucesso');
      setConfirmingDelete(false);
      onClose();
    } catch (e: any) {
      logger.error("Account deletion failed", e);
      if (e.code === 'auth/requires-recent-login') {
        toast.error('Por segurança, tem de iniciar sessão novamente antes de eliminar a conta.');
        await signOut(auth);
      } else {
        toast.error('Erro ao eliminar conta. Tente novamente.');
      }
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoginError(null);

    // O login por popup (signInWithPopup) é bloqueado pela própria Google dentro de
    // WebViews embutidas (é uma proteção de segurança deles, não um bug nosso) — por
    // isso nunca resolve nem falha dentro da app nativa, ficando preso para sempre.
    // Evitamos tentar e explicamos isto diretamente, em vez de deixar a pessoa à espera.
    const capacitor = (window as any).Capacitor;
    const isNative = !!(capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform());
    if (isNative) {
      setLoginError("O login com Google ainda não funciona dentro da app instalada — é uma limitação de segurança da própria Google contra logins em apps embutidas. Por agora, use o login pelo browser (site da app) para sincronizar os seus dados.");
      return;
    }

    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      // Force account selection to avoid automatic "crashes" if a session is stuck
      provider.setCustomParameters({ prompt: 'select_account' });
      // Rede de segurança: nunca deixar o botão preso para sempre, mesmo que o popup
      // fique pendurado por um motivo inesperado.
      await Promise.race([
        signInWithPopup(auth, provider),
        new Promise((_, reject) => setTimeout(() => reject({ code: 'auth/timeout' }), 15000))
      ]);
    } catch (e: any) {
      logger.error("Google login failed", e);
      let errorMsg = "Erro ao iniciar sessão. Tente novamente.";
      
      if (e.code === 'auth/popup-blocked') {
        errorMsg = "O popup de login foi bloqueado pelo seu navegador.";
      } else if (e.code === 'auth/unauthorized-domain') {
        errorMsg = "Este domínio não está autorizado no Firebase Console.";
      } else if (e.code === 'auth/popup-closed-by-user') {
        errorMsg = "O login foi cancelado.";
      } else if (e.code === 'auth/timeout') {
        errorMsg = "O login demorou demasiado tempo e foi cancelado. Tente novamente.";
      }
      
      setLoginError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-black/5"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-black/[0.03] flex items-center justify-between bg-[#fbfbfd]">
              <div className="flex items-center gap-3">
                <div className="bg-[#1d1d1f] w-8 h-8 rounded-xl flex items-center justify-center shadow-sm shrink-0">
                  <UserIcon className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <h2 className="font-display font-black text-sm uppercase tracking-tight text-[#1d1d1f] leading-none">O seu Perfil</h2>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Dados de Emergência</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 rounded-full hover:bg-black/5 transition-all"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* System Health Check */}
              <div className="space-y-2 mb-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 border border-black/5 p-2 rounded-2xl flex flex-col items-center justify-center text-center">
                    <span className="text-[7px] font-black uppercase text-slate-400 mb-0.5">Antena</span>
                    <div className={cn("w-1.5 h-1.5 rounded-full", fcmToken ? "bg-green-500" : "bg-red-500")} />
                  </div>
                  <div className="bg-slate-50 border border-black/5 p-2 rounded-2xl flex flex-col items-center justify-center text-center">
                    <span className="text-[7px] font-black uppercase text-slate-400 mb-0.5">Nuvem</span>
                    <div className={cn("w-1.5 h-1.5 rounded-full", currentUser ? "bg-green-500" : "bg-amber-500")} />
                  </div>
                  <div className="bg-slate-50 border border-black/5 p-2 rounded-2xl flex flex-col items-center justify-center text-center">
                    <span className="text-[7px] font-black uppercase text-slate-400 mb-0.5">GPS</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  </div>
                </div>

                {window.self !== window.top && (
                  <button 
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="w-full py-2 bg-blue-600 text-white rounded-xl text-[8px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-95 transition-transform"
                  >
                    Abrir em Novo Separador (Ativar SOS)
                  </button>
                )}
              </div>

              {/* Profile Photo Display */}
              <div className="flex flex-col items-center justify-center pb-2">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-[32px] bg-slate-50 border-4 border-white ios-shadow overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105">
                    {currentUser?.photoURL ? (
                      <img 
                        referrerPolicy="no-referrer"
                        src={currentUser.photoURL} 
                        alt="Foto de Perfil" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserIcon className="w-10 h-10 text-slate-200" />
                    )}
                  </div>
                  {currentUser && (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -bottom-1 -right-1 bg-green-500 w-6 h-6 rounded-full border-4 border-white shadow-sm"
                    />
                  )}
                </div>
                {currentUser && (
                  <div className="mt-3 text-center">
                    <h3 className="text-sm font-display font-black text-slate-800 uppercase tracking-tight">{currentUser.displayName}</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-0.5">{currentUser.email}</p>
                  </div>
                )}
              </div>

              {currentUser && !confirmingDelete && (
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={handleLogout}
                    className="flex-1 py-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-100 transition-all active:scale-95"
                  >
                    <LogOut className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Terminar Sessão</span>
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="flex-1 py-3 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center gap-2 hover:bg-red-100 transition-all active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-red-600">Eliminar Conta</span>
                  </button>
                </div>
              )}

              {currentUser && confirmingDelete && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-[24px] space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-red-700 font-medium leading-relaxed">
                      Esta ação é permanente. A sua conta, perfil médico e dados na nuvem serão eliminados e não podem ser recuperados.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      disabled={deletingAccount}
                      className="flex-1 py-3 bg-white border border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest text-slate-600 active:scale-95 transition-transform disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deletingAccount}
                      className="flex-1 py-3 bg-red-600 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-95 transition-transform disabled:opacity-50"
                    >
                      {deletingAccount ? 'A eliminar...' : 'Confirmar Eliminação'}
                    </button>
                  </div>
                </div>
              )}

              {!auth.currentUser && (
                <div className="space-y-3">
                  <button 
                    onClick={() => {
                      handleGoogleLogin();
                      voiceService.speak("Sincronizar dados com Google");
                    }}
                    disabled={loading}
                    className="w-full py-4 px-6 bg-slate-50 border border-slate-200 rounded-[24px] flex items-center justify-center gap-3 hover:bg-white transition-all group disabled:opacity-50"
                  >
                    <LogIn className="w-4 h-4 text-slate-400 group-hover:text-red-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                      {loading ? 'A processar...' : 'Sincronizar entre Dispositivos'}
                    </span>
                  </button>
                  
                  {loginError && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="px-4 py-2 bg-red-50 border border-red-100 rounded-xl text-[9px] font-bold text-red-500 uppercase tracking-wider text-center"
                    >
                      {loginError}
                    </motion.div>
                  )}
                </div>
              )}
              <div className="space-y-4">
                <div className="group">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Nome Completo</label>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-red-500 transition-colors" />
                    <input 
                      type="text" 
                      value={profile.fullName}
                      onChange={e => handleFieldChange('fullName', e.target.value)}
                      placeholder="Introduza o seu nome..."
                      className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-4 pl-11 pr-6 text-sm outline-none focus:bg-white focus:border-red-100 focus:ring-4 focus:ring-red-500/5 transition-all text-slate-900 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="group">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Tipo de Sangue</label>
                    <div className="relative">
                      <Droplets className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-red-500 transition-colors" />
                      <input 
                        type="text" 
                        value={profile.bloodType}
                        onChange={e => handleFieldChange('bloodType', e.target.value)}
                        placeholder="Ex: A+"
                        className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-4 pl-11 pr-6 text-sm outline-none focus:bg-white focus:border-red-100 transition-all text-slate-900 font-medium uppercase"
                      />
                    </div>
                  </div>
                  <div className="group">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Data Nasc.</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 transition-colors" />
                      <input 
                        type="text" 
                        value={profile.birthDate}
                        onChange={e => handleFieldChange('birthDate', e.target.value)}
                        placeholder="DD/MM/AAAA"
                        className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-4 pl-11 pr-6 text-sm outline-none focus:bg-white focus:border-red-100 transition-all text-slate-900 font-medium"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="group">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Peso (kg)</label>
                    <div className="relative">
                      <Weight className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 transition-colors" />
                      <input 
                        type="text" 
                        value={profile.weight}
                        onChange={e => handleFieldChange('weight', e.target.value)}
                        placeholder="Ex: 75"
                        className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-4 pl-11 pr-6 text-sm outline-none focus:bg-white focus:border-red-100 transition-all text-slate-900 font-medium"
                      />
                    </div>
                  </div>
                  <div className="group">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Altura (cm)</label>
                    <div className="relative">
                      <Ruler className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 transition-colors" />
                      <input 
                        type="text" 
                        value={profile.height}
                        onChange={e => handleFieldChange('height', e.target.value)}
                        placeholder="Ex: 180"
                        className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-4 pl-11 pr-6 text-sm outline-none focus:bg-white focus:border-red-100 transition-all text-slate-900 font-medium"
                      />
                    </div>
                  </div>
                </div>

                <div className="group">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Medicações Atuais</label>
                  <div className="relative">
                    <Pill className="absolute left-4 top-4 w-4 h-4 text-slate-300 transition-colors" />
                    <textarea 
                      value={profile.medications}
                      onChange={e => handleFieldChange('medications', e.target.value)}
                      placeholder="Liste as suas medicações diárias..."
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-4 pl-11 pr-6 text-sm outline-none focus:bg-white focus:border-red-100 transition-all text-slate-900 font-medium resize-none"
                    />
                  </div>
                </div>

                <div className="group">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Alergias Graves</label>
                  <div className="relative">
                    <AlertTriangle className="absolute left-4 top-4 w-4 h-4 text-slate-300 transition-colors" />
                    <textarea 
                      value={profile.allergies}
                      onChange={e => handleFieldChange('allergies', e.target.value)}
                      placeholder="Ex: Penicilina, Amendoins, Picadas de Abelha..."
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-4 pl-11 pr-6 text-sm outline-none focus:bg-white focus:border-red-100 transition-all text-slate-900 font-medium resize-none"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 p-5 rounded-[28px] border border-black/5">
                  <p className="text-[10px] leading-relaxed text-slate-500 font-medium">
                    <span className="font-black uppercase text-slate-400 block mb-1">Privacidade de Dados:</span>
                    Estas informações são guardadas localmente no seu dispositivo e servem exclusivamente para o seu apoio em caso de emergência. O SOS MAIS não utiliza estes dados para qualquer outro fim.
                  </p>
                </div>

                <div className="group">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Acessibilidade: Ativação por Voz</label>
                  <div className="space-y-2">
                    <div 
                      onClick={toggleVoice}
                      className="bg-slate-50 border border-slate-100 rounded-[32px] p-4 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-white p-2 rounded-xl shadow-sm">
                          <Volume2 className={cn("w-4 h-4", voiceEnabled ? "text-red-500" : "text-slate-300")} />
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase text-slate-900 block">Navegação por Voz</span>
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Lê os botões e estados da app</span>
                        </div>
                      </div>
                      <div className={cn(
                        "w-10 h-5 rounded-full transition-colors relative",
                        voiceEnabled ? "bg-red-500" : "bg-slate-200"
                      )}>
                        <motion.div 
                          animate={{ x: voiceEnabled ? 20 : 2 }}
                          className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
                        />
                      </div>
                    </div>

                    <div 
                      onClick={toggleVoiceCommands}
                      className="bg-slate-50 border border-slate-100 rounded-[32px] p-4 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-white p-2 rounded-xl shadow-sm">
                          <Mic className={cn("w-4 h-4", voiceCommandsEnabled ? "text-red-500" : "text-slate-300")} />
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase text-slate-900 block">Comandos de Voz</span>
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Diga "SOS" para ativar ajuda imediata</span>
                        </div>
                      </div>
                      <div className={cn(
                        "w-10 h-5 rounded-full transition-colors relative",
                        voiceCommandsEnabled ? "bg-red-500" : "bg-slate-200"
                      )}>
                        <motion.div 
                          animate={{ x: voiceCommandsEnabled ? 20 : 2 }}
                          className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="group">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Condições Médicas Preexistentes</label>
                  <div className="relative">
                    <FileText className="absolute left-4 top-4 w-4 h-4 text-slate-300 transition-colors" />
                    <textarea 
                      value={profile.chronicConditions}
                      onChange={e => handleFieldChange('chronicConditions', e.target.value)}
                      placeholder="Ex: Diabetes, Hipertensão, Asma, Doença Cardíaca..."
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-4 pl-11 pr-6 text-sm outline-none focus:bg-white focus:border-red-100 transition-all text-slate-900 font-medium resize-none"
                    />
                  </div>
                </div>

              </div>

            </div>

            {/* Footer */}
            <div className="p-5 bg-white border-t border-black/[0.03]">
              <button 
                onClick={async () => {
                  await handleSave();
                  voiceService.speak("Perfil guardado com sucesso.");
                  onClose();
                }}
                disabled={loading}
                className="w-full bg-[#1d1d1f] text-white py-4 rounded-[20px] font-display font-black uppercase text-[10px] tracking-widest shadow-lg shadow-black/5 hover:bg-black transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {loading ? 'Sincronizando...' : hasChanges ? 'Guardar Agora' : 'Fechar Perfil'}
              </button>
              {hasChanges && !loading && (
                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest text-center mt-3 animate-pulse">
                  Alterações serão guardadas automaticamente...
                </p>
              )}
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
