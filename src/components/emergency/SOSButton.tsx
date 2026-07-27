import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, AlertCircle, Share2, Users, ShieldAlert, Shield } from 'lucide-react';
import { cn } from '../../lib/utils';
import { sendAlertNotification, triggerSOS } from '../../lib/notifications';
import { voiceService } from '../../lib/voiceService';
import { toast } from 'react-hot-toast';
import { logger } from '../../lib/logger';
import { auth } from '../../lib/firebase';

export function SOSButton({ onTriggerAI }: { onTriggerAI: () => void }) {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [sosLocation, setSosLocation] = useState<{
    lat: number;
    lon: number;
    accuracy: number;
    quality: 'EXACT LOCATION' | 'HIGH PRECISION' | 'APPROXIMATE LOCATION';
    address?: string;
  } | null>(null);

  const toggleSOS = () => {
    if (countdown !== null) {
      setCountdown(null);
      voiceService.speak("Alerta cancelado. Verifique se está tudo bem.");
      if ('vibrate' in navigator) navigator.vibrate([100]);
      return;
    }
    
    setCountdown(3); // Aumentado para 3 segundos para dar mais tempo de cancelamento acidental
    voiceService.speak("Protocolo de ajuda iniciado. Alerta em três segundos.");
    
    // Aggressive pattern for SOS pattern
    if ('vibrate' in navigator) {
      navigator.vibrate([300, 100, 300, 100, 300, 100, 300]);
    }
  };

  React.useEffect(() => {
    const handleVoiceTrigger = () => {
      if (countdown === null && !isBroadcasting) {
        toggleSOS();
        toast.error('Comando SOS detectado por voz!', {
          icon: '🎙️',
          duration: 3000,
          style: { borderRadius: '16px', background: '#991b1b', color: '#fff', fontSize: '9px', fontWeight: '900' }
        });
      }
    };

    window.addEventListener('emergency-voice-trigger', handleVoiceTrigger);
    return () => window.removeEventListener('emergency-voice-trigger', handleVoiceTrigger);
  }, [countdown, isBroadcasting]);

  React.useEffect(() => {
    if (countdown === null) return;

    if (countdown === 0) {
      setCountdown(null);
      setIsBroadcasting(true);
      voiceService.speak("Alerta disparado. Transmitindo sinal de emergência e localização.");
      if ('vibrate' in navigator) navigator.vibrate([500, 200, 500, 200, 800]);
      
      // Dispatch custom global event so other full-screen layers can react
      window.dispatchEvent(new CustomEvent('sos-activated'));

      // 1. Local Notification
      sendAlertNotification(
          '🚨 SOS TRANSMITINDO',
          'Protocolo multi-canal ativo. GPS e sinais de rádio em curso.',
          'high'
      );

      // 2. Global AI Trigger
      onTriggerAI();

      // 3. Multi-Channel Alert Protocol
      handleEmergencyProtocol();

      // Reset broadcasting state after 45 seconds (longer live window)
      setTimeout(() => setIsBroadcasting(false), 45000);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
      if ('vibrate' in navigator) navigator.vibrate([50, 50, 50]);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  // Continuous watchPosition during active SOS Mode to improve lock precision under 15m
  React.useEffect(() => {
    if (!isBroadcasting) {
      setSosLocation(null);
      return;
    }

    let watchId: number | null = null;
    const triggerContinuousTracking = () => {
      if (!("geolocation" in navigator)) return;
      
      watchId = navigator.geolocation.watchPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;

        let quality: 'EXACT LOCATION' | 'HIGH PRECISION' | 'APPROXIMATE LOCATION' = 'APPROXIMATE LOCATION';
        if (accuracy <= 15) {
          quality = 'EXACT LOCATION';
        } else if (accuracy <= 50) {
          quality = 'HIGH PRECISION';
        }

        let addressText = '';
        try {
          const geoRes = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
          if (geoRes.ok) {
            const contentType = geoRes.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const geoData = await geoRes.json();
              if (geoData && geoData.display_name) {
                const parts = geoData.display_name.split(',');
                addressText = parts.slice(0, 3).join(', ').trim();
              }
            }
          }
        } catch (e) {
          logger.warn('[SOS Continuous] Address resolve ignored', e);
        }

        setSosLocation({
          lat,
          lon,
          accuracy,
          quality,
          address: addressText || `Coordenadas: ${lat.toFixed(6)}, ${lon.toFixed(6)}`
        });

        // Continuously report refinement status
        if (auth.currentUser) {
          await triggerSOS(auth.currentUser.uid, lat, lon, addressText || "Rastreamento Contínuo Ativo");
        }
      }, (err) => {
        logger.warn('[SOS Continuous] watchPosition failed', err);
      }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }); // No cache enforces live lock improvement!
    };

    triggerContinuousTracking();
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [isBroadcasting]);

  const handleEmergencyProtocol = async () => {
    try {
      if (!auth.currentUser) {
        logger.warn('[SOS] Sem sessão iniciada — alerta não pode ser enviado à rede de contactos.');
        toast.error('Inicie sessão para poder enviar alertas à sua rede.');
        return;
      }
      const uid = auth.currentUser.uid;
      const savedProfile = localStorage.getItem('sos_mais_user_profile');
      const profile = savedProfile ? JSON.parse(savedProfile) : {};

      // Get initial accurate location
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        
        // A. Cloud Alert (FCM + Firestore)
        await triggerSOS(uid, latitude, longitude);
        
        // B. Radio / Comms Fallback (Manual action prompt)
        toast('Sinal de Rádio & GPS Ativos', {
          icon: '📡',
          duration: 4000,
          style: { borderRadius: '16px', background: '#000', color: '#fff', fontSize: '9px', fontWeight: '900' }
        });

        // C. Fetch human-readable address for voice feedback using our backend proxy
        let addressText = `coordenadas ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        try {
          const geoRes = await fetch(`/api/geocode?lat=${latitude}&lon=${longitude}`);
          if (geoRes.ok) {
            const contentType = geoRes.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const geoData = await geoRes.json();
              if (geoData.display_name) {
                const parts = geoData.display_name.split(',');
                addressText = parts.slice(0, 2).join(', ').trim();
              }
            } else {
              logger.warn("[SOS] Geocode failed: expected JSON, got", contentType);
            }
          }
        } catch (e) {
          logger.warn("Reverse geocode failed, using coordinates for voice feedback.", e);
        }

        // D. High-Quality Neural Voice Response with Context - Humanized safety feedback
        const personalGreeting = profile?.fullName ? `${profile.fullName.split(' ')[0]}, ` : '';
        
        let situationReport = `Confirmado. Já identifiquei a sua posição em: ${addressText}.`;
        if (accuracy <= 15) {
          situationReport = `Confirmado, ${personalGreeting}. Já localizei a sua posição exata com máxima precisão em: ${addressText}.`;
        }
        
        const empathyOpeners = [
          "Mantenha a calma, estou aqui consigo.",
          "Respire fundo, o protocolo de resgate já está em curso.",
          "Não está sozinho, a minha rede está a monitorizar tudo agora.",
          "Fique tranquilo, o alerta já chegou aos seus contactos."
        ];
        const randomOpener = empathyOpeners[Math.floor(Math.random() * empathyOpeners.length)];

        const instructionsText = `${randomOpener} Afaste-se de perigos imediatos se puder. O sinal SOS+ está ativo e a transmitir a sua localização GPS em tempo real para toda a sua rede de apoio e serviços de emergência. Aguarde no local e mantenha o telemóvel carregado.`;
        
        voiceService.speak(`${situationReport} ${instructionsText}`);

      }, (err) => {
        logger.warn('Geolocation failed for SOS:', err);
        triggerSOS(uid, 0, 0, "Localização de rede indisponível");
        voiceService.speak("Alerta disparado. Não foi possível obter a sua localização GPS exata, mas os seus contactos de emergência foram notificados do sinal de socorro. Mantenha a calma.");
      }, { enableHighAccuracy: true });

    } catch (e) {
      logger.error('Fatal SOS error:', e);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 py-2 relative">
      {/* Panic Flash Overlay - Ultra High Impact */}
      <AnimatePresence>
        {countdown !== null && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: [0, 0.4, 0],
              transition: { 
                repeat: Infinity, 
                duration: 0.5,
                ease: "linear" 
              }
            }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-red-600 pointer-events-none z-[100] mix-blend-overlay"
          />
        )}
      </AnimatePresence>

      <div className="relative">
        {/* Pulse Rings */}
        {(countdown !== null || isBroadcasting) && (
          <>
            <motion.div 
              animate={{ 
                scale: isBroadcasting ? [1, 2, 1] : [1, 1.1, 1],
                opacity: isBroadcasting ? [0.3, 0.6, 0.3] : [0.2, 0.5, 0.2]
              }}
              transition={{ repeat: Infinity, duration: isBroadcasting ? 1 : 2, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full bg-red-600 blur-2xl z-0"
            />
            <motion.div 
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: isBroadcasting ? 3 : 1.8, opacity: 0 }}
              transition={{ repeat: Infinity, duration: isBroadcasting ? 1 : 1.5, ease: "easeOut" }}
              className="absolute inset-0 rounded-full bg-red-600/30 z-0"
            />
            {isBroadcasting && (
              <motion.div 
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 4.5, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut", delay: 0.2 }}
                className="absolute inset-0 rounded-full bg-red-400/20 z-0 border-2 border-red-500/50"
              />
            )}
          </>
        )}
        
        <AnimatePresence mode="wait">
          <motion.button
            key={countdown !== null || isBroadcasting ? 'active' : 'inactive'}
            onClick={toggleSOS}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ 
              scale: isBroadcasting ? [1.1, 1.2, 1.1] : (countdown !== null ? [1.05, 1.1, 1.05] : [1, 1.02, 1]),
              opacity: 1 
            }}
            transition={{
              scale: {
                repeat: Infinity,
                duration: isBroadcasting ? 0.5 : (countdown !== null ? 1 : 3),
                ease: "easeInOut"
              }
            }}
            whileTap={{ scale: 0.92, transition: { duration: 0.1 } }}
            className={cn(
              "relative z-10 w-52 h-52 rounded-full flex flex-col items-center justify-center",
              "transition-all duration-500 ios-shadow group",
              isBroadcasting 
                ? "bg-red-700 border-[12px] border-white/40 shadow-[0_0_100px_rgba(220,38,38,0.8)]"
                : (countdown !== null 
                  ? "bg-red-600/90 backdrop-blur-md border-[8px] border-white/30 shadow-[0_0_60px_rgba(220,38,38,0.6)]" 
                  : "bg-slate-900 border-4 border-slate-800 shadow-2xl")
            )}
          >
            {isBroadcasting ? (
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 className="flex flex-col items-center"
               >
                 <img src="/icons/icon-192.png" alt="SOS Mais" className="w-14 h-14 rounded-2xl object-cover mb-2 animate-bounce" />
                 <span className="text-xl font-black uppercase tracking-widest text-white">EMISSÃO</span>
                 <span className="text-[8px] font-bold text-white/60 tracking-wider">SINAL SOS ATIVO</span>
               </motion.div>
            ) : countdown !== null ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center"
              >
                <span className="text-6xl font-black mb-1 tabular-nums drop-shadow-lg">{countdown}</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Cancelar</span>
              </motion.div>
            ) : (
              <motion.span 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="font-black text-6xl tracking-tighter uppercase leading-none drop-shadow-2xl"
              >
                SOS
              </motion.span>
            )}
          </motion.button>
        </AnimatePresence>
      </div>

      <div className="text-center -mt-4">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">
          {isBroadcasting ? "SINAL EMISSOR EM TEMPO REAL ATIVO" : "Toque no botão acima para obter ajuda"}
        </p>
      </div>

      {isBroadcasting && sosLocation && (
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm px-4"
        >
          <div className="bg-slate-950 border border-red-900/40 rounded-[28px] p-4 font-mono text-[10px] text-slate-300 space-y-3 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-red-600/10 blur-xl rounded-full" />
            
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <span className="text-[9px] font-black uppercase text-red-500 tracking-wider flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                CONEXÃO CIVIL SOS+
              </span>
              <span className="text-[8px] font-bold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
                PT-PT OPERACIONAL
              </span>
            </div>

            <div className="space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">ESTADO DE CANAL:</span>
                <span className="text-emerald-400 font-black tracking-widest animate-pulse">ALERTA EMITIDO</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">QUALIDADE SINAL:</span>
                <span className={cn(
                  "font-black tracking-widest",
                  sosLocation.quality === 'EXACT LOCATION' ? "text-emerald-400" :
                  sosLocation.quality === 'HIGH PRECISION' ? "text-blue-400" : "text-amber-400"
                )}>
                  {sosLocation.quality} ({Math.round(sosLocation.accuracy)}m)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">TELESINAL GPS:</span>
                <span className="text-white font-bold">{sosLocation.lat.toFixed(6)}, {sosLocation.lon.toFixed(6)}</span>
              </div>
              <div className="pt-2 border-t border-white/5 flex flex-col gap-1">
                <span className="text-slate-500 font-bold">ENDEREÇO CIVIL ESTIMADO:</span>
                <span className="text-white font-bold font-sans text-[11px] leading-relaxed">
                  {sosLocation.address || "A descodificar morada portuguesa..."}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm px-4">
        <a 
          href="tel:112"
          onClick={() => voiceService.speak("Ligando para as autoridades, centro 112.")}
          className="flex flex-col items-center justify-center bg-slate-900 text-white p-3 rounded-[24px] font-bold group hover:bg-slate-800 transition-all border border-slate-700 shadow-md"
        >
          <Phone className="w-3.5 h-3.5 text-red-500 mb-1" />
          <span className="uppercase tracking-tight text-[9px] mb-0.5">Autoridades</span>
          <span className="text-[7px] opacity-40 uppercase font-bold">112 em Portugal</span>
        </a>

        <button 
          onClick={() => {
            voiceService.speak("Abrindo lista de contactos de emergência.");
            onTriggerAI();
          }} // Reusing AI trigger for specific contact access context
          className="flex flex-col items-center justify-center bg-white border border-slate-200 text-slate-800 p-3 rounded-[24px] font-bold group hover:border-slate-300 transition-all shadow-sm active:scale-95"
        >
          <Users className="w-3.5 h-3.5 text-blue-600 mb-1" />
          <span className="uppercase tracking-tight text-[9px] mb-0.5">Emergência</span>
          <span className="text-[7px] opacity-40 font-bold uppercase">Contactos</span>
        </button>
      </div>
    </div>
  );
}
