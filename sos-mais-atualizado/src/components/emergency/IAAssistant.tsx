import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, User, Loader2, ShieldCheck, AlertCircle, BookOpen, ChevronRight, Mic, Sparkles, MapPin } from 'lucide-react';
import { EMERGENCY_SYSTEM_PROMPT } from '../../services/geminiService';
import ReactMarkdown from 'react-markdown';
import { cn } from '../../lib/utils';
import { OFFLINE_GUIDES } from '../../constants';
import { EmergencyGuide, UserProfileData } from '../../types';
import { voiceService } from '../../lib/voiceService';
import { findSuggestedGuide, findSuggestedDestinationType, DestinationType, getHumanInstantResponse, getOfflineResponse, callDatabricksAI } from '../../services/aiHelper';
import { logger } from '../../lib/logger';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestedGuide?: EmergencyGuide;
  suggestedDestinationType?: DestinationType;
  isAdvanced?: boolean;
}

const DESTINATION_LABELS: Record<DestinationType, string> = {
  hospital: 'o hospital',
  fire: 'o quartel de bombeiros',
  police: 'a esquadra de polícia',
  shelter: 'um ponto de apoio/abrigo',
  health_center: 'o centro de saúde'
};

interface IAAssistantProps {
  onTabChange?: (tab: string) => void;
  onSelectGuide?: (guide: EmergencyGuide) => void;
}

const MessageItem = React.memo(({ message, onSelectGuide, onTabChange, onFindNearest, findingDestination }: { 
  message: Message, 
  onSelectGuide?: (guide: EmergencyGuide) => void,
  onTabChange?: (tab: string) => void,
  onFindNearest?: (type: DestinationType) => void,
  findingDestination?: DestinationType | null
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
                  onSelectGuide?.(message.suggestedGuide);
                  onTabChange?.('guides');
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
    </div>
  </motion.div>
));

MessageItem.displayName = 'MessageItem';

export function IAAssistant({ onTabChange, onSelectGuide }: IAAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [useAdvancedAI, setUseAdvancedAI] = useState(false);
  const [findingDestination, setFindingDestination] = useState<DestinationType | null>(null);

  const handleFindNearestAndNavigate = async (type: DestinationType) => {
    if (findingDestination) return;
    setFindingDestination(type);
    voiceService.speak("A procurar o local mais próximo. Um momento.");
    try {
      const { fetchNearbyEmergencyPOIs } = await import('../../services/emergencyService');
      const { calculateDistance } = await import('../../lib/utils');

      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
      );
      const { latitude, longitude } = position.coords;

      const poiTypeMap: Record<DestinationType, string> = {
        fire: 'fire', hospital: 'hospital', police: 'police', health_center: 'health_center', shelter: 'municipality'
      };
      const targetType = poiTypeMap[type];

      const pois = await fetchNearbyEmergencyPOIs(latitude, longitude, 25);
      const matching = pois
        .filter(p => p.type === targetType)
        .map(p => ({ ...p, distance: calculateDistance(latitude, longitude, p.location.lat, p.location.lng) }))
        .sort((a, b) => a.distance - b.distance);

      if (matching.length === 0) {
        voiceService.speak("Não encontrei nenhum local desse tipo perto de si. Ligue 112 para assistência.");
        setFindingDestination(null);
        return;
      }

      const nearest = matching[0];
      const url = `https://www.google.com/maps/dir/?api=1&destination=${nearest.location.lat},${nearest.location.lng}&travelmode=driving`;
      window.open(url, '_blank');
      voiceService.speak(`A abrir direções para ${nearest.name}, a ${nearest.distance.toFixed(1)} quilómetros.`);
    } catch (error) {
      logger.error('Falha ao encontrar destino próximo:', error);
      voiceService.speak("Não consegui aceder à sua localização. Verifique as permissões de GPS.");
    } finally {
      setFindingDestination(null);
    }
  };

  useEffect(() => {
    const greeting = localStorage.getItem('sos_mais_greeting') || 'Olá';
    setMessages([
      { role: 'assistant', content: `${greeting}, estou aqui consigo. Pode descrever o que está a acontecer? \n\nVou orientá-lo passo a passo para garantir a sua segurança. \n\n*(Lembre-se: em caso de perigo imediato, ligue 112)*` }
    ]);
  }, []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = voiceService.subscribe(speaking => {
      setIsSpeaking(speaking);
    });
    return () => unsubscribe();
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
    const suggestedDestinationType = findSuggestedDestinationType(userMsg);
    const humanInstant = getHumanInstantResponse(userMsg);

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      // PRIORIDADE 1: Se já existe um guia pronto na app, usamo-lo diretamente.
      // É mais rápido, mais fiável, e poupa a IA (que é um recurso limitado) para os casos que precisam mesmo dela.
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

        setMessages(prev => [...prev, { role: 'assistant', content: responseText, suggestedGuide, suggestedDestinationType }]);
        voiceService.speak(responseText);
        setIsLoading(false);
        return;
      }

      // PRIORIDADE 2: Sem internet e sem guia correspondente — resposta genérica offline.
      if (!navigator.onLine) {
        const text = getOfflineResponse(userMsg, profile, suggestedGuide);
        setMessages(prev => [...prev, { role: 'assistant', content: text, suggestedGuide, suggestedDestinationType }]);
        voiceService.speak(text);
        setIsLoading(false);
        return;
      }

      // PRIORIDADE 3: Não há guia pronto — só agora usamos a IA real.
      let text = "";
      let advancedUsed = false;

      if (useAdvancedAI) {
        const history = messages.slice(-4).map(m => ({
          role: m.role,
          content: m.content
        }));
        text = await callDatabricksAI(userMsg, history) || "";
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

        const greeting = localStorage.getItem('sos_mais_greeting') || 'Olá';
        promptWithContext += `\n\nSAUDAÇÃO LOCALIZADA: ${greeting}. Use-a se for natural para começar a conversa ou ser empático.`;

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              ...messages.slice(-5).map(m => ({ 
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
    } catch (error) {
      const text = getOfflineResponse(userMsg, profile, suggestedGuide);
      setMessages(prev => [...prev, { role: 'assistant', content: text, suggestedGuide, suggestedDestinationType }]);
      voiceService.speak(text);
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
        <div className="relative flex items-center gap-2 max-w-2xl mx-auto bg-white p-1 rounded-full border border-black/[0.05] shadow-lg ring-1 ring-black/5">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Descreva a situação..."
            className="flex-1 bg-transparent px-6 py-3 text-sm outline-none placeholder:text-slate-400 text-slate-900 border-none"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-md",
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
