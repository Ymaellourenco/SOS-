import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, User, Loader2, ShieldCheck, AlertCircle, BookOpen, ChevronRight, Mic, Sparkles, MapPin, Trash2 } from 'lucide-react';
import { EMERGENCY_SYSTEM_PROMPT } from '../../services/geminiService';
import ReactMarkdown from 'react-markdown';
import { cn, openPrefilledSMS, getBestAvailableLocation, getRecentEmergencyContext } from '../../lib/utils';
import { OFFLINE_GUIDES } from '../../constants';
import { EmergencyGuide, UserProfileData } from '../../types';
import { voiceService } from '../../lib/voiceService';
import { speechService } from '../../lib/voiceCommandService';
import { triggerSOS, sendAlertNotification } from '../../lib/notifications';
import { liveLocationService } from '../../lib/liveLocationService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { findSuggestedGuide, findExplicitDestinationType, isVagueRelocationRequest, isShortAffirmativeDistressReply, indicatesTrappedOrSurrounded, indicatesWantsToConfirmSafety, indicatesSuicidalIdeation, buildSituationalContext, DestinationType, getHumanInstantResponse, getOfflineResponse, callDatabricksAI } from '../../services/aiHelper';
import { logger } from '../../lib/logger';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestedGuide?: EmergencyGuide;
  suggestedDestinationType?: DestinationType;
  requestsSOS?: boolean;
  requestsSafetyCheckIn?: boolean;
  isAdvanced?: boolean;
}

const DESTINATION_LABELS: Record<DestinationType, string> = {
  hospital: 'o hospital',
  fire: 'o quartel de bombeiros',
  police: 'a esquadra de polícia',
  municipality: 'a câmara municipal / proteção civil',
  health_center: 'o centro de saúde'
};

// Formas já contraídas ("de" + artigo) para frases tipo "não há dados DO hospital" em
// vez de "dados DE O hospital" — evita o erro de concordância gramatical.
const DESTINATION_LABELS_CONTRACTED: Record<DestinationType, string> = {
  hospital: 'do hospital',
  fire: 'do quartel de bombeiros',
  police: 'da esquadra de polícia',
  municipality: 'da câmara municipal / proteção civil',
  health_center: 'do centro de saúde'
};

interface IAAssistantProps {
  onTabChange?: (tab: string) => void;
  onSelectGuide?: (guide: EmergencyGuide) => void;
}

const MessageItem = React.memo(({ message, onSelectGuide, onTabChange, onFindNearest, findingDestination, onSendSOS, sosStatus, onSendSafetyCheckIn, safetyCheckInStatus }: { 
  message: Message, 
  onSelectGuide?: (guide: EmergencyGuide) => void,
  onTabChange?: (tab: string) => void,
  onFindNearest?: (type: DestinationType) => void,
  findingDestination?: DestinationType | null,
  onSendSOS?: () => void,
  sosStatus?: 'idle' | 'sending' | 'sent',
  onSendSafetyCheckIn?: () => void,
  safetyCheckInStatus?: 'idle' | 'sending' | 'sent'
}) => (
  <motion.div
    initial={{ opacity: 0, y: 5 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.15 }}
    className={cn(
      "flex gap-3 max-w-[90%]",
      message.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
    )}
  >
    <div className={cn(
      "p-4 rounded-[28px] text-sm leading-relaxed ios-shadow relative",
      message.role === 'assistant' 
        ? "bg-white border border-white/50 text-slate-800 rounded-tl-lg" 
        : "bg-[#1d1d1f] text-white rounded-tr-lg"
    )}
    >
      <div className="prose prose-sm prose-slate max-w-none prose-p:my-1 prose-ul:my-1 prose-strong:text-inherit">
        <ReactMarkdown>{message.content}</ReactMarkdown>
      </div>

      {message.suggestedGuide && (
        <div className="mt-5 pt-4 border-t border-black/5">
          <p className="text-[9px] font-black text-red-600 uppercase tracking-[0.2em] mb-3 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> PROTOCOLO RECOMENDADO
          </p>
          <div className="bg-slate-50/50 border border-red-100 p-4 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h4 className="font-display font-black text-xs text-slate-800 uppercase tracking-tighter truncate">{message.suggestedGuide.title}</h4>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight truncate mt-0.5">{message.suggestedGuide.description}</p>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                 <BookOpen className="w-4 h-4 text-red-600" />
              </div>
            </div>
            <button 
              onClick={() => {
                if (message.suggestedGuide) {
                  // O guia abre como um ecrã sobreposto (overlay) — não mudamos a aba de
                  // fundo para "Guias". Se mudássemos, ao fechar o guia a pessoa acabava
                  // na aba de Guias em vez de voltar à conversa com a IA, o que a
                  // interrompe sem motivo a meio de uma emergência.
                  onSelectGuide?.(message.suggestedGuide);
                  voiceService.speak(`Abrindo guia para ${message.suggestedGuide.title}`);
                }
              }}
              className="w-full py-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-center gap-2 group hover:bg-slate-900 hover:text-white transition-all active:scale-[0.98] text-[9px] font-black uppercase tracking-widest shadow-sm"
            >
              Ver Guia Completo
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      )}
      {message.suggestedDestinationType && (
        <div className="mt-5 pt-4 border-t border-black/5">
          <p className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] mb-3 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> PRECISA DE IR A ALGUM SÍTIO?
          </p>
          <div className="bg-slate-50/50 border border-blue-100 p-4 rounded-3xl space-y-3">
            <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
              Posso encontrar {DESTINATION_LABELS[message.suggestedDestinationType]} mais próximo de si e abrir as direções para lá. Você decide se quer ir.
            </p>
            <button 
              onClick={() => onFindNearest?.(message.suggestedDestinationType!)}
              disabled={findingDestination === message.suggestedDestinationType}
              className="w-full py-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-center gap-2 group hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all active:scale-[0.98] text-[9px] font-black uppercase tracking-widest shadow-sm disabled:opacity-60"
            >
              {findingDestination === message.suggestedDestinationType ? (
                <>A localizar... <Loader2 className="w-3 h-3 animate-spin" /></>
              ) : (
                <>Ver {DESTINATION_LABELS[message.suggestedDestinationType]} Mais Próximo <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" /></>
              )}
            </button>
          </div>
        </div>
      )}
      {message.requestsSOS && (
        <div className="mt-5 pt-4 border-t border-black/5">
          <button
            onClick={() => onSendSOS?.()}
            disabled={sosStatus === 'sending' || sosStatus === 'sent'}
            className={cn(
              "w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-[10px] font-black uppercase tracking-widest shadow-lg disabled:opacity-80",
              sosStatus === 'sent' ? "bg-green-600 text-white" : "bg-red-600 text-white hover:bg-red-700"
            )}
          >
            {sosStatus === 'sending' ? (
              <>A enviar alerta... <Loader2 className="w-3.5 h-3.5 animate-spin" /></>
            ) : sosStatus === 'sent' ? (
              <>✓ Alerta Enviado à Sua Rede</>
            ) : (
              <>🚨 Enviar Alerta Agora</>
            )}
          </button>
        </div>
      )}
      {message.requestsSafetyCheckIn && (
        <div className="mt-5 pt-4 border-t border-black/5">
          <button
            onClick={() => onSendSafetyCheckIn?.()}
            disabled={safetyCheckInStatus === 'sending' || safetyCheckInStatus === 'sent'}
            className={cn(
              "w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-[10px] font-black uppercase tracking-widest shadow-lg disabled:opacity-80",
              safetyCheckInStatus === 'sent' ? "bg-green-600 text-white" : "bg-slate-900 text-white hover:bg-slate-800"
            )}
          >
            {safetyCheckInStatus === 'sending' ? (
              <>A preparar mensagem... <Loader2 className="w-3.5 h-3.5 animate-spin" /></>
            ) : safetyCheckInStatus === 'sent' ? (
              <>✓ Mensagem Preparada</>
            ) : (
              <>✅ Avisar Que Estou Bem</>
            )}
          </button>
        </div>
      )}
    </div>
  </motion.div>
));

MessageItem.displayName = 'MessageItem';

export function IAAssistant({ onTabChange, onSelectGuide }: IAAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);

  // Evita mensagens duplicadas seguidas quando a pessoa toca no mesmo botão várias
  // vezes seguidas (ex: "Enviar Alerta" sem sessão, microfone não suportado) — sem
  // isto, cada toque empilhava a mesma frase outra vez, poluindo a conversa numa
  // altura em que a pessoa pode já estar em stress.
  const addAssistantMessageIfNew = (content: string, extra?: Partial<Message>) => {
    setMessages(prev => {
      if (prev.length > 0 && prev[prev.length - 1].content === content) {
        return prev;
      }
      return [...prev, { role: 'assistant', content, ...extra }];
    });
  };
  const [useAdvancedAI, setUseAdvancedAI] = useState(false);
  const [findingDestination, setFindingDestination] = useState<DestinationType | null>(null);

  const handleFindNearestAndNavigate = async (type: DestinationType) => {
    if (findingDestination) return;
    setFindingDestination(type);
    voiceService.speak("A procurar o local mais próximo. Um momento.");

    // CRÍTICO (Safari/iOS): window.open() só é permitido pelo bloqueador de pop-ups
    // se acontecer de forma síncrona, ainda dentro do toque do utilizador. Todo o
    // resto desta função usa await (localização, pesquisa de POIs, verificação de
    // rota) — se esperássemos até ao fim para abrir a janela, o Safari já teria
    // "esquecido" que isto começou com um toque real, e bloqueava o pop-up em
    // silêncio, sem erro nenhum: a pessoa via o botão "a procurar" e depois nada.
    // Por isso abrimos já aqui uma aba em branco, e só mais tarde apontamos essa
    // mesma aba para o destino real assim que o soubermos.
    const mapWindow = window.open('', '_blank');

    try {
      const { fetchNearbyEmergencyPOIs } = await import('../../services/emergencyService');
      const { calculateDistance } = await import('../../lib/utils');

      let latitude: number, longitude: number;
      try {
        const location = await getBestAvailableLocation();
        latitude = location.lat;
        longitude = location.lon;
        if (location.isApproximate) {
          voiceService.speak("Não consegui a localização exata, a usar uma localização aproximada.");
        }
      } catch (geoError) {
        logger.error('Falha completa ao obter localização (nem GPS nem IP):', geoError);
        voiceService.speak("Não consegui obter a sua localização de forma nenhuma. Ligue 112.");
        mapWindow?.close();
        setFindingDestination(null);
        return;
      }

      const poiTypeMap: Record<DestinationType, string> = {
        fire: 'fire', hospital: 'hospital', police: 'police', health_center: 'health_center', municipality: 'municipality'
      };
      const targetType = poiTypeMap[type];

      const pois = await fetchNearbyEmergencyPOIs(latitude, longitude, 25);
      const withDistance = pois.map(p => ({ ...p, distance: calculateDistance(latitude, longitude, p.location.lat, p.location.lng) }));

      let matching: typeof withDistance;
      if (type === 'hospital') {
        // Prioridade: hospital primeiro sempre que exista um, mesmo que um centro de
        // saúde esteja mais perto. Só usamos centro de saúde como alternativa quando
        // não há mesmo nenhum hospital por perto — nunca deixamos a pessoa sem opção.
        // Dentro dos hospitais, preferimos sempre o público (SNS) ao privado, numa
        // emergência — só usamos um privado se não houver mesmo nenhum público por perto.
        const allHospitals = withDistance.filter(p => p.type === 'hospital').sort((a, b) => a.distance - b.distance);
        const publicHospitals = allHospitals.filter(p => !p.isPrivate);
        const hospitals = publicHospitals.length > 0 ? publicHospitals : allHospitals;
        const healthCenters = withDistance.filter(p => p.type === 'health_center').sort((a, b) => a.distance - b.distance);
        matching = hospitals.length > 0 ? hospitals : healthCenters;
      } else {
        matching = withDistance.filter(p => p.type === targetType).sort((a, b) => a.distance - b.distance);
      }

      if (matching.length === 0) {
        voiceService.speak("Não encontrei nenhum local desse tipo perto de si. Ligue 112 para assistência.");
        mapWindow?.close();
        setFindingDestination(null);
        return;
      }

      const nearest = matching[0];

      if (nearest.isEstimate) {
        // NUNCA abrimos o mapa para um local inventado — mandar alguém numa emergência
        // real para uma posição que não existe é pior do que não mostrar nada.
        // Em vez de deixar a pessoa só com um aviso passivo, oferecemos já a ação real
        // que ajuda de verdade nesta situação: enviar a localização à rede de contactos.
        mapWindow?.close();
        const warning = `Não tenho dados confirmados ${DESTINATION_LABELS_CONTRACTED[type]} perto de si neste momento. Ligue 112 — eles sabem a localização exata mais próxima. Entretanto, pode enviar já a sua localização à sua rede de contactos:`;
        const warningContent = `⚠️ ${warning}`;
        setMessages(prev => {
          // Se o utilizador tocar no botão várias vezes seguidas com o mesmo resultado
          // (sem dados), não repetimos a mesma mensagem de aviso — isso só polui a
          // conversa sem acrescentar informação nova.
          if (prev.length > 0 && prev[prev.length - 1].content === warningContent) {
            return prev;
          }
          return [...prev, { role: 'assistant', content: warningContent, requestsSOS: true }];
        });
        voiceService.speak(warning);
        setFindingDestination(null);
        return;
      }

      const url = `https://www.google.com/maps/dir/?api=1&destination=${nearest.location.lat},${nearest.location.lng}&travelmode=driving`;

      // Verifica se a rota passa perto de algum incêndio ativo antes de abrir a
      // navegação — isto é consultivo (não bloqueia nem reencaminha sozinho), só avisa.
      let routeWarning: string | null = null;
      try {
        const safetyRes = await fetch(`/api/route-safety-check?originLat=${latitude}&originLng=${longitude}&destLat=${nearest.location.lat}&destLng=${nearest.location.lng}`, { signal: AbortSignal.timeout(9000) });
        if (safetyRes.ok) {
          const safety = await safetyRes.json();
          if (safety.checked && !safety.safe && safety.hazards?.length > 0) {
            const closest = safety.hazards[0];
            routeWarning = `⚠️ Atenção: o caminho até lá pode passar perto de "${closest.title}" (a cerca de ${closest.distanceKm.toFixed(1)}km da rota). Considere confirmar a situação antes de seguir, ou pedir uma rota alternativa no mapa.`;
          }
        }
      } catch (e) {
        logger.warn('Verificação de rota segura falhou (a navegação continua na mesma):', e);
      }

      // Aponta a aba já aberta (desde o início do toque) para o destino real. Se por
      // algum motivo essa aba não existir (ex: bloqueador de pop-ups muito agressivo
      // que bloqueou mesmo a abertura em branco), tentamos na mesma window.open como
      // reserva, e se isso também falhar, deixamos sempre um link visível na
      // conversa para a pessoa tocar manualmente — nunca falhamos em silêncio.
      let opened = false;
      if (mapWindow) {
        try {
          mapWindow.location.href = url;
          opened = true;
        } catch (e) {
          logger.warn('Falha ao redirecionar a aba pré-aberta:', e);
        }
      }
      if (!opened) {
        const fallbackWindow = window.open(url, '_blank');
        opened = !!fallbackWindow;
      }
      if (!opened) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Não consegui abrir o mapa automaticamente (o navegador bloqueou a abertura). Toque aqui para abrir as direções: ${url}`
        }]);
      }
      if (type === 'hospital' && nearest.type !== 'hospital') {
        const note = `Não encontrei nenhum hospital perto de si — a abrir direções para o centro de saúde mais próximo, ${nearest.name}, a ${nearest.distance.toFixed(1)} quilómetros.`;
        setMessages(prev => [...prev, { role: 'assistant', content: note }]);
        voiceService.speak(note);
      } else if (type === 'hospital' && nearest.isPrivate) {
        const note = `⚠️ Não encontrei nenhum hospital público (SNS) perto de si — a abrir direções para ${nearest.name}, que é privado, a ${nearest.distance.toFixed(1)} quilómetros. Para evitar custos, considere ligar 112 ou SNS24 (808 24 24 24) para confirmar o hospital público mais indicado.`;
        setMessages(prev => [...prev, { role: 'assistant', content: note }]);
        voiceService.speak(`Atenção: não encontrei hospital público perto de si. A abrir direções para ${nearest.name}, que é privado.`);
      } else {
        voiceService.speak(`A abrir direções para ${nearest.name}, a ${nearest.distance.toFixed(1)} quilómetros.`);
      }
      if (routeWarning) {
        setMessages(prev => [...prev, { role: 'assistant', content: routeWarning! }]);
        voiceService.speak(`Atenção: o caminho pode passar perto de um incêndio ativo. Considere uma rota alternativa.`);
      }

      // Acompanhamento: passado algum tempo, confirma se a pessoa chegou bem e se continua a precisar de ajuda.
      // Cancela qualquer acompanhamento já agendado antes — evita duas mensagens
      // idênticas quando o botão é usado mais do que uma vez seguida.
      if (checkInTimerRef.current !== null) {
        window.clearTimeout(checkInTimerRef.current);
      }
      checkInTimerRef.current = window.setTimeout(() => {
        const checkIn = "Já chegou a um local seguro? Está ferido? Precisa de mais ajuda, ou deseja avisar os seus contactos de que está bem?";
        setMessages(prev => [...prev, { role: 'assistant', content: checkIn }]);
        voiceService.speak(checkIn);
        checkInTimerRef.current = null;
      }, 3 * 60 * 1000);
    } catch (error) {
      logger.error('Falha ao encontrar destino próximo:', error);
      voiceService.speak("Não consegui aceder à sua localização. Verifique as permissões de GPS.");
      mapWindow?.close();
    } finally {
      setFindingDestination(null);
    }
  };

  const [sosStatus, setSosStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const handleSendSOS = async () => {
    if (sosStatus === 'sending') return;
    setSosStatus('sending');
    logger.log('[SOS] Botão "Enviar Alerta Agora" premido.');
    try {
      if (!auth.currentUser) {
        // Sem sessão, não conseguimos usar o alerta do servidor (que notifica os
        // contactos guardados na nuvem) — mas os contactos ficam também guardados
        // localmente, e SMS não precisa de sessão nenhuma. Em vez de dizer "não é
        // possível" e parar, usamos essa alternativa real.
        logger.warn('[SOS] Sem sessão iniciada — a tentar alternativa local por SMS.');
        try {
          const savedContactsRaw = localStorage.getItem('emergency_contacts');
          const savedContacts = savedContactsRaw ? JSON.parse(savedContactsRaw) : [];
          const personalContact = savedContacts.find((c: any) => c.type !== 'service' && c.phone);

          if (personalContact) {
            const location = await getBestAvailableLocation();
            const mapsLink = `https://www.google.com/maps?q=${location.lat},${location.lon}`;
            const context = getRecentEmergencyContext();
            const message = `🚨 EMERGÊNCIA — Preciso de ajuda.${context ? ` Situação: "${context}"` : ''} A minha localização: ${mapsLink}`;
            openPrefilledSMS(personalContact.phone, message);

            // Se houver mais contactos pessoais guardados, sugere avisá-los também —
            // sem obrigar a escolher antes de agir: o primeiro já foi contactado logo,
            // rápido, e só depois mencionamos a hipótese de avisar mais alguém.
            const otherContacts = savedContacts.filter((c: any) => c.type !== 'service' && c.phone && c.name !== personalContact.name);
            const moreContactsNote = otherContacts.length > 0
              ? ` Também pode avisar rapidamente ${otherContacts.slice(0, 2).map((c: any) => c.name).join(' ou ')} na aba Contactos — cada contacto tem lá o seu próprio botão de SMS de emergência.`
              : '';

            addAssistantMessageIfNew(`✅ Sem sessão iniciada, mas preparei um SMS de emergência para ${personalContact.name} com a sua localização. Confirme o envio na app de mensagens.${moreContactsNote}`);
            voiceService.speak(`Preparei uma mensagem de emergência para ${personalContact.name}. Confirme o envio.`);
          } else {
            const warning = "⚠️ Não consegui enviar o alerta: não há sessão iniciada, nem contactos pessoais guardados neste dispositivo. Ligue 112 diretamente, ou adicione um contacto na aba Contactos.";
            addAssistantMessageIfNew(warning);
            voiceService.speak("Não é possível enviar o alerta sem sessão nem contactos guardados. Ligue 112.");
          }
        } catch (fallbackError) {
          logger.error('[SOS] Falha também na alternativa local:', fallbackError);
          const warning = "⚠️ Não consegui enviar o alerta. Ligue 112 diretamente.";
          addAssistantMessageIfNew(warning);
          voiceService.speak("Não consegui enviar o alerta. Ligue 112.");
        }
        setSosStatus('idle');
        return;
      }
      const uid = auth.currentUser.uid;

      // Infere o tipo de emergência a partir do guia mais recente sugerido na conversa, se houver.
      const recentGuide = [...messages].reverse().find(m => m.suggestedGuide)?.suggestedGuide;
      const emergencyType = recentGuide?.title;
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content;

      let latitude: number, longitude: number;
      try {
        const location = await getBestAvailableLocation();
        latitude = location.lat;
        longitude = location.lon;
        if (location.isApproximate) {
          logger.warn('[SOS] Só foi possível obter localização aproximada por IP.');
        }
      } catch (geoError) {
        logger.error('[SOS] Falha completa ao obter localização (nem GPS nem IP):', geoError);
        throw geoError;
      }

      await triggerSOS(uid, latitude, longitude, undefined, emergencyType, lastUserMessage);

      // Inicia a partilha contínua de localização (até 3h, ou até tocares em "Parar")
      // — assim quem receber o alerta pode continuar a ver onde estás, não só a
      // posição do momento em que o SOS foi disparado.
      const liveState = await liveLocationService.start(latitude, longitude);

      setSosStatus('sent');
      sendAlertNotification('REDE NOTIFICADA', 'A sua rede de contactos recebeu o alerta com a sua localização.', 'high');
      voiceService.speak("Alerta enviado à sua rede de contactos, com a sua localização. A sua posição vai continuar a ser atualizada em tempo real.");

      // Garantia extra: independentemente de a notificação push/SMS automática ter
      // resultado (depende de terceiros como o Twilio), abrimos também a app de
      // mensagens do telemóvel com o primeiro contacto pessoal, já preenchida —
      // só falta tocar em "Enviar". Isto nunca depende de nenhum serviço externo.
      try {
        const contactsSnap = await getDocs(query(collection(db, 'contacts'), where('userId', '==', uid)));
        const personalContact = contactsSnap.docs.map(d => d.data()).find(c => c.type !== 'service' && c.phone);
        if (personalContact) {
          const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
          const liveLink = liveState.trackingUrl ? ` Acompanhe em tempo real: ${liveState.trackingUrl}` : '';
          const smsText = `🚨 EMERGÊNCIA${emergencyType ? ` (${emergencyType})` : ''} — Preciso de ajuda. A minha localização: ${mapsLink}.${liveLink}`;
          openPrefilledSMS(personalContact.phone, smsText);
        }
      } catch (e) {
        logger.warn('Não foi possível preparar o SMS de reserva:', e);
      }
    } catch (error) {
      logger.error('Falha ao enviar SOS pelo assistente:', error);
      voiceService.speak("Não consegui enviar o alerta. Use o botão de SOS na app, ou ligue 112.");
      setSosStatus('idle');
    }
  };

  const [safetyCheckInStatus, setSafetyCheckInStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  // Envia uma mensagem de reassurança (não um alerta) aos contactos — distinto do
  // SOS: aqui a pessoa está bem, só quer avisar. Usa o mesmo SMS de reserva, mas
  // com texto e urgência diferentes, e não aciona a partilha contínua de localização.
  const handleSendSafetyCheckIn = async () => {
    if (safetyCheckInStatus === 'sending') return;
    setSafetyCheckInStatus('sending');
    try {
      if (!auth.currentUser) {
        voiceService.speak("Não é possível enviar a mensagem sem sessão iniciada.");
        setSafetyCheckInStatus('idle');
        return;
      }
      const uid = auth.currentUser.uid;
      const savedProfile = localStorage.getItem('sos_mais_user_profile');
      const profileData = savedProfile ? JSON.parse(savedProfile) : null;
      const firstName = profileData?.fullName ? profileData.fullName.split(' ')[0] : '';

      const contactsSnap = await getDocs(query(collection(db, 'contacts'), where('userId', '==', uid)));
      const personalContacts = contactsSnap.docs.map(d => d.data()).filter(c => c.type !== 'service' && c.phone);

      if (personalContacts.length === 0) {
        voiceService.speak("Não tem contactos pessoais configurados para avisar.");
        setSafetyCheckInStatus('idle');
        return;
      }

      const messageText = `✅ ${firstName ? firstName + ' está' : 'Estou'} bem e em segurança. Só queria avisar — não é uma emergência.`;
      sendAlertNotification('Confirmação enviada', 'A sua rede foi avisada de que está bem.', 'low');

      // Abre o SMS de reserva para o primeiro contacto (o utilizador confirma o envio);
      // os restantes ficam disponíveis para SMS individual na lista de Contactos.
      openPrefilledSMS(personalContacts[0].phone, messageText);

      setSafetyCheckInStatus('sent');
      voiceService.speak(`Mensagem preparada para ${personalContacts[0].name}. Confirme o envio na app de mensagens.`);
    } catch (error) {
      logger.error('Falha ao preparar confirmação de segurança:', error);
      voiceService.speak("Não consegui preparar a mensagem. Tente pela lista de Contactos.");
      setSafetyCheckInStatus('idle');
    }
  };

  const CHAT_HISTORY_TTL_MS = 60 * 60 * 1000; // 60 minutos

  const freshGreeting = () => {
    const greeting = localStorage.getItem('sos_mais_greeting') || 'Olá';
    return [
      { role: 'assistant' as const, content: `${greeting}, estou aqui consigo. Pode descrever o que está a acontecer? \n\nVou orientá-lo passo a passo para garantir a sua segurança. \n\n*(Lembre-se: em caso de perigo imediato, ligue 112)*` }
    ];
  };

  useEffect(() => {
    const savedRaw = localStorage.getItem('sos_mais_chat_history');
    if (savedRaw) {
      try {
        const saved = JSON.parse(savedRaw);
        const age = Date.now() - (saved.timestamp || 0);
        if (Array.isArray(saved.messages) && saved.messages.length > 0 && age < CHAT_HISTORY_TTL_MS) {
          setMessages(saved.messages);
          return;
        } else {
          // Expirou (mais de 60 min) ou está corrompido — autolimpeza.
          localStorage.removeItem('sos_mais_chat_history');
        }
      } catch (e) {
        logger.warn('Falha ao carregar histórico de conversa guardado, a começar do zero:', e);
        localStorage.removeItem('sos_mais_chat_history');
      }
    }
    setMessages(freshGreeting());
  }, []);

  // Guarda a conversa a cada alteração, com data/hora, para sobreviver a um refresh
  // da página — mantém só as últimas 50 mensagens, e expira ao fim de 60 minutos.
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem('sos_mais_chat_history', JSON.stringify({
        messages: messages.slice(-50),
        timestamp: Date.now()
      }));
    } catch (e) {
      logger.warn('Falha ao guardar histórico de conversa:', e);
    }
  }, [messages]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const checkInTimerRef = useRef<number | null>(null);
  const crisisModeActiveRef = useRef<number | null>(null);
  const speechRecognitionSupported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const handleVoiceInput = () => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      // Safari no iPhone/iPad nunca implementou esta funcionalidade do browser — mas
      // o próprio teclado do iOS já tem ditado embutido, sem precisar da nossa app.
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const message = isIOS
        ? "Este navegador não suporta ditado por aqui — mas pode tocar no campo de texto e usar o microfone do próprio teclado do iPad para ditar."
        : "O seu navegador não suporta transcrição de voz para texto.";
      setMessages(prev => {
        const content = `ℹ️ ${message}`;
        if (prev.length > 0 && prev[prev.length - 1].content === content) return prev;
        return [...prev, { role: 'assistant', content }];
      });
      voiceService.speak(message);
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    // O browser só permite UM reconhecimento de voz ativo de cada vez — e já temos
    // outro sempre ligado em segundo plano (deteção da palavra "SOS"). Sem pausar
    // esse primeiro, o botão de ditado falha silenciosamente ou para sozinho.
    // Retomamos assim que o ditado terminar.
    speechService.stop();

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'pt-PT';
    // Contínuo: não corta ao primeiro silêncio entre palavras/frases — só para quando
    // a pessoa tocar outra vez no botão.
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => {
      setIsRecording(false);
      speechService.resume();
    };
    recognition.onerror = (event: any) => {
      logger.warn('[Voz->Texto] Erro no reconhecimento de voz:', event.error);
      setIsRecording(false);
      speechService.resume();
    };
    recognition.onresult = (event: any) => {
      // Em situações de emergência, falar pode ser mais prático do que escrever —
      // transcrevemos para o campo de texto, para a pessoa rever/editar antes de enviar.
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setInput(transcript);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Faz a caixa de texto crescer com o conteúdo (até um limite), em vez de deixar
  // o texto cortado/escondido para o lado quando a frase fica comprida — foi o
  // problema reportado ao ditar frases mais longas por voz.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);


  useEffect(() => {
    const unsubscribe = voiceService.subscribe(speaking => {
      setIsSpeaking(speaking);
    });
    return () => unsubscribe();
  }, []);

  // Autolimpeza mesmo com a app aberta: verifica a cada minuto se passaram 60 minutos
  // desde a última mensagem guardada — se sim, limpa e recomeça, sem precisar de reload.
  useEffect(() => {
    const interval = setInterval(() => {
      const savedRaw = localStorage.getItem('sos_mais_chat_history');
      if (!savedRaw) return;
      try {
        const saved = JSON.parse(savedRaw);
        const age = Date.now() - (saved.timestamp || 0);
        if (age >= CHAT_HISTORY_TTL_MS) {
          localStorage.removeItem('sos_mais_chat_history');
          setMessages(freshGreeting());
          logger.log('[Chat] Conversa limpa automaticamente após 60 minutos de inatividade.');
        }
      } catch (e) {}
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const savedProfile = localStorage.getItem('sos_mais_user_profile');
    if (savedProfile) {
      try {
        setProfile(JSON.parse(savedProfile));
      } catch (e) {
        logger.error("Failed to parse profile for AI context");
      }
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input;
    const suggestedGuide = findSuggestedGuide(userMsg);
    const suggestedDestinationType = findExplicitDestinationType(userMsg);
    const humanInstant = getHumanInstantResponse(userMsg);

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      // PRIORIDADE MÁXIMA ABSOLUTA: ideação suicida / desejo de autoagressão. Nunca
      // tratada com o fluxo de perigo físico (enviar localização/GPS) — a resposta
      // certa aqui é validação emocional e linhas de apoio verificadas, nunca texto
      // gerado livremente pela IA, para nunca arriscar um número errado numa
      // situação potencialmente fatal.
      if (indicatesSuicidalIdeation(userMsg)) {
        crisisModeActiveRef.current = Date.now();
        const responseText = "Sinto muito que esteja a passar por isto — o que sente agora é real, mas não precisa de enfrentar isto sozinho(a). Por favor, fale com alguém agora:\n\n📞 **112** — se estiver em perigo imediato\n📞 **SNS 24 — 808 24 24 24** — encaminhamento e apoio psicológico\n📞 **SOS Voz Amiga — 213 544 545 / 912 802 669 / 963 524 660**\n\nEstou aqui consigo enquanto isso. Consegue dizer-me se está seguro(a) neste momento?";
        setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
        voiceService.speak("Sinto muito que esteja a passar por isto. Não está sozinho. Ligue 112, ou o SNS 24 no 808 24 24 24, ou a linha SOS Voz Amiga. Estou aqui consigo.");
        setIsLoading(false);
        return;
      }

      // PRIORIDADE MÁXIMA: resposta curta de socorro ("sim", "ajuda", "socorro"...) ou
      // sinal de estar preso/cercado — nestes casos não vale a pena esperar pela IA
      // nem pedir mais detalhes, oferecemos já o envio da localização.
      // Exceção: se a conversa esteve recentemente numa crise de saúde mental, NÃO
      // desviamos para o fluxo de perigo físico — um "sim" aqui provavelmente
      // significa "sim, ajude-me a contactar apoio", não "envie o meu GPS".
      const recentlyInCrisis = crisisModeActiveRef.current !== null && (Date.now() - crisisModeActiveRef.current) < 10 * 60 * 1000;
      if (!recentlyInCrisis && (isShortAffirmativeDistressReply(userMsg) || indicatesTrappedOrSurrounded(userMsg))) {
        const responseText = "Estou aqui consigo. Vou ajudá-lo a pedir ajuda agora — toque no botão abaixo para enviar já a sua localização à sua rede de contactos. Se conseguir, ligue também 112.";
        setMessages(prev => [...prev, { role: 'assistant', content: responseText, requestsSOS: true }]);
        voiceService.speak(responseText);
        setIsLoading(false);
        return;
      }

      // PRIORIDADE 0: A pessoa diz que precisa de ir para algum lado, mas não diz onde —
      // perguntamos antes de adivinhar, em vez de escolher um tipo de local sozinhos.
      if (!suggestedDestinationType && isVagueRelocationRequest(userMsg)) {
        const responseText = "Posso ajudá-lo a encontrar um local seguro. Diga-me o que precisa: **Hospital**, **Bombeiros**, **Polícia**, **Câmara Municipal / Proteção Civil**, **Centro de Saúde** — ou, se preferir, posso ajudá-lo a **contactar um familiar ou contacto de emergência** em vez de um local. Você decide.";
        setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
        voiceService.speak(responseText);
        setIsLoading(false);
        return;
      }

      // PRIORIDADE 0.5: A pessoa quer avisar os contactos de que está bem/segura —
      // mostramos logo o botão real, em vez de a IA descrever um processo por mensagens
      // que a app não sabe executar sozinha.
      if (indicatesWantsToConfirmSafety(userMsg)) {
        const responseText = "Posso enviar uma mensagem à sua rede de contactos a dizer que está bem e em segurança. Toque no botão abaixo para enviar.";
        setMessages(prev => [...prev, { role: 'assistant', content: responseText, requestsSafetyCheckIn: true }]);
        voiceService.speak(responseText);
        setIsLoading(false);
        return;
      }

      // PRIORIDADE 1: Sem internet — aqui sim, usamos os guias/respostas instantâneas offline,
      // porque é a única opção disponível sem ligação à IA real.
      if (!navigator.onLine) {
        if (humanInstant || suggestedGuide) {
          const personalGreeting = profile?.fullName ? `${profile.fullName.split(' ')[0]}, ` : '';
          let responseText = "";
          if (humanInstant) {
            responseText = `${personalGreeting}${humanInstant}`;
          } else if (suggestedGuide) {
            const openers = [
              `Estou a acompanhar, ${profile?.fullName ? profile.fullName.split(' ')[0] : 'ajudo já'}.`,
              `Compreendo perfeitamente.`,
              `Vamos tratar disso agora.`,
              `Mantenha a calma, estou aqui.`
            ];
            const opener = openers[Math.floor(Math.random() * openers.length)];
            responseText = `${opener} Tenho um guia pronto para "${suggestedGuide.title}" — veja os passos abaixo. Se precisar de mais ajuda, escreva-me outra vez.`;
          }
          const text = `*Não tenho acesso à Internet neste momento — vou usar os guias offline da app.*\n\n${responseText}`;
          setMessages(prev => [...prev, { role: 'assistant', content: text, suggestedGuide, suggestedDestinationType }]);
          voiceService.speak(responseText);
          setIsLoading(false);
          return;
        }

        const text = `*Não tenho acesso à Internet neste momento — vou usar os guias offline da app.*\n\n${getOfflineResponse(userMsg, profile, suggestedGuide)}`;
        setMessages(prev => [...prev, { role: 'assistant', content: text, suggestedGuide, suggestedDestinationType }]);
        voiceService.speak(getOfflineResponse(userMsg, profile, suggestedGuide));
        setIsLoading(false);
        return;
      }

      // EXCEÇÃO: alguns procedimentos são puramente mecânicos e universalmente urgentes —
      // engasgamento, paragem cardíaca, afogamento. Não há pergunta de esclarecimento que
      // mude os passos a dar; esperar pela IA só custa segundos preciosos. Mostramos sempre
      // a guia instantaneamente, mesmo com internet.
      const isTimeCriticalProcedure = suggestedGuide && ['choke', 'heart', 'drowning'].includes(suggestedGuide.id);
      if (isTimeCriticalProcedure) {
        const formattedSteps = suggestedGuide!.steps.map((step, idx) => `${idx + 1}. ${step}`).join('\n\n');
        const responseText = `⚡ Guia imediata — **${suggestedGuide!.title}**:\n\n${formattedSteps}`;
        setMessages(prev => [...prev, { role: 'assistant', content: responseText, suggestedGuide, suggestedDestinationType }]);
        voiceService.speak(`Guia imediata para ${suggestedGuide!.title}. Siga os passos no ecrã.`);
        setIsLoading(false);
        return;
      }

      // ONLINE: usamos SEMPRE a IA real — nunca atalhamos com respostas pré-escritas quando há
      // internet, para que as perguntas de esclarecimento, os níveis de risco e o contexto real
      // (localização + alertas oficiais) sejam sempre considerados. O guia continua disponível
      // como botão de apoio junto à resposta da IA, não como substituto dela.
      let text = "";
      let advancedUsed = false;

      // Antes de perguntar à IA, reunimos o contexto real disponível: localização
      // precisa e alertas oficiais próximos — nunca respondemos só ao texto isolado.
      const quickLocation = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        if (!("geolocation" in navigator)) { resolve(null); return; }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: false, timeout: 4000, maximumAge: 5 * 60 * 1000 }
        );
      });
      const situationalContext = await buildSituationalContext(
        quickLocation?.lat ?? null,
        quickLocation?.lng ?? null
      );

      if (useAdvancedAI) {
        // Janela de contexto ainda mais generosa (40 mensagens, ~20 trocas) — numa
        // emergência com muitas mensagens curtas e rápidas ("sim", distâncias,
        // confirmações), uma janela pequena faz a IA "esquecer" o perigo já
        // confirmado poucas trocas atrás e voltar a perguntar coisas já respondidas,
        // o que é perigoso e confuso.
        const history = messages.slice(-40).map(m => ({
          role: m.role,
          content: m.content
        }));
        text = await callDatabricksAI(userMsg, history, situationalContext) || "";
        advancedUsed = !!text;
      }

      if (!text) {
        let promptWithContext = EMERGENCY_SYSTEM_PROMPT;
        
        if (profile) {
          promptWithContext += `\n\nDADOS DO UTILIZADOR:
- Nome: ${profile.fullName || 'Não especificado'}
- Tipo de Sangue: ${profile.bloodType || 'Não especificado'}
- Alergias: ${profile.allergies || 'Nenhuma'}
- Medicações: ${profile.medications || 'Nenhuma'}
- Condições: ${profile.chronicConditions || 'Nenhuma'}`;
        }

        const lastGeo = localStorage.getItem('sos_mais_last_geo');
        if (lastGeo) {
          try {
            const geoData = JSON.parse(lastGeo);
            const country = geoData.address?.country || 'Portugal';
            const city = geoData.address?.city || geoData.address?.town || geoData.address?.village || '';
            promptWithContext += `\n\nLOCALIZAÇÃO ATUAL: ${city}, ${country}. 
(IMPORTANTE: Utilize os números e protocolos de emergência específicos para este país: ${country === 'Portugal' ? '112 / SNS24' : '999 / NHS 111'})`;
          } catch (e) {
            logger.warn("Failed to inject location context into AI prompt");
          }
        }

        promptWithContext += `\n\n${situationalContext}`;

        const greeting = localStorage.getItem('sos_mais_greeting') || 'Olá';
        promptWithContext += `\n\nSAUDAÇÃO LOCALIZADA: ${greeting}. Use-a se for natural para começar a conversa ou ser empático.`;

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              // Mesma janela generosa (40 mensagens) que a via avançada, pelo mesmo
              // motivo: não perder o contexto de perigo já confirmado numa conversa
              // de emergência rápida.
              ...messages.slice(-40).map(m => ({ 
                role: m.role === 'assistant' ? 'model' : 'user', 
                parts: [{ text: m.content }] 
              })),
              { role: 'user', parts: [{ text: userMsg }] }
            ],
            systemInstruction: promptWithContext
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Falha na comunicação com o servidor');
        }

        const data = await response.json();
        text = data.text || "Estou aqui consigo. Mantenha a calma.";
      }

      setMessages(prev => [...prev, { role: 'assistant', content: text, suggestedGuide, suggestedDestinationType, isAdvanced: advancedUsed }]);
      voiceService.speak(text);
    } catch (error: any) {
      // O motivo técnico (limite de pedidos, chave inválida, etc.) fica só no registo
      // para nós — nunca no ecrã. Numa emergência, ver "limite de tokens atingido" só
      // assusta e faz perder confiança na app; o que importa mostrar é que ainda há
      // ajuda disponível (os guias offline), não o motivo interno da falha.
      const reason = error?.message || 'motivo desconhecido';
      logger.error(`Erro ao contactar a IA (motivo interno: ${reason}):`, error);
      const text = `Vou usar os guias de emergência da app para o ajudar agora.\n\n${getOfflineResponse(userMsg, profile, suggestedGuide)}`;
      setMessages(prev => [...prev, { role: 'assistant', content: text, suggestedGuide, suggestedDestinationType }]);
      voiceService.speak(getOfflineResponse(userMsg, profile, suggestedGuide));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#fbfbfd]">
      {/* Header Info */}
      <div className="glass px-5 py-3 flex items-center justify-between border-b border-black/[0.02]">
        <div className="flex items-center gap-2.5">
          <div className="bg-red-600 w-8 h-8 rounded-xl flex items-center justify-center ios-shadow">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-display font-black text-[11px] uppercase tracking-tight text-slate-800">IA de Resgate</h2>
            <div className="flex items-center gap-1.5">
              <AnimatePresence mode="wait">
                {isSpeaking ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key="speaking"
                    className="flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                    <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest">Voz Ativa</span>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key="idle"
                    className="flex items-center gap-1.5"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sinal Auditado</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
        
        <button
          onClick={() => {
            localStorage.removeItem('sos_mais_chat_history');
            setMessages(freshGreeting());
          }}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          title="Limpar conversa e começar do zero"
          aria-label="Limpar conversa"
        >
          <Trash2 className="w-3.5 h-3.5 text-slate-300 hover:text-slate-500" />
        </button>

      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 p-6 space-y-6 scroll-smooth">
        {messages.map((m, i) => (
          <MessageItem 
            key={i} 
            message={m} 
            onSelectGuide={onSelectGuide}
            onTabChange={onTabChange}
            onFindNearest={handleFindNearestAndNavigate}
            findingDestination={findingDestination}
            onSendSOS={handleSendSOS}
            sosStatus={sosStatus}
            onSendSafetyCheckIn={handleSendSafetyCheckIn}
            safetyCheckInStatus={safetyCheckInStatus}
          />
        ))}
        {isLoading && (
          <div className="flex gap-3 max-w-[85%] mr-auto">
            <div className="bg-white border border-white/50 p-4 rounded-[28px] rounded-tl-lg ios-shadow flex items-center gap-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] animate-pulse">A aguardar resposta...</span>
            </div>
          </div>
        )}
      </div>

      {/* Floating Input area */}
      <div className="px-4 pt-2 pb-24 bg-gradient-to-t from-[#fbfbfd] via-[#fbfbfd]/80 to-transparent">
        <div className="relative flex items-end gap-2 max-w-2xl mx-auto bg-white p-1 rounded-[28px] border border-black/[0.05] shadow-lg ring-1 ring-black/5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              // Enter envia, Shift+Enter quebra linha — assim como noutras apps de chat.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isRecording ? "A ouvir... fale agora" : "Descreva a situação..."}
            rows={1}
            className="flex-1 bg-transparent px-5 py-3 text-sm outline-none placeholder:text-slate-400 text-slate-900 border-none resize-none max-h-40 overflow-y-auto leading-snug"
          />
          <button
            onClick={handleVoiceInput}
            disabled={isLoading}
            title={isRecording ? "Parar gravação" : speechRecognitionSupported ? "Falar em vez de escrever" : "Ditado não suportado — use o microfone do teclado"}
            aria-label={isRecording ? "Parar gravação de voz" : "Ditar mensagem por voz"}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 shrink-0 mb-0.5",
              isRecording
                ? "bg-red-600 text-white animate-pulse shadow-md"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            )}
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-md shrink-0 mb-0.5",
              isLoading || !input.trim() 
                ? "bg-slate-100 text-slate-300" 
                : "bg-red-600 text-white"
            )}
          >
            <Send className="w-4 h-4 translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
