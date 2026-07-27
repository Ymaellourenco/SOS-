import { EmergencyGuide, UserProfileData } from '../types';
import { OFFLINE_GUIDES } from '../constants';

export const findSuggestedGuide = (text: string): EmergencyGuide | undefined => {
  const input = text.toLowerCase();
  const mappings: Record<string, string[]> = {
    quake: ['sismo', 'terremoto', 'tremor', 'quake', 'terramoto', 'chão a abanar', 'earthquake'],
    fire: ['fogo', 'incêndio', 'chamas', 'smoke', 'fumo', 'fire', 'arder', 'queimado', 'incendio'],
    heart: ['coração', 'enfarte', 'enfarto', 'cardíaco', 'heart', 'dor no peito', 'braço esquerdo', 'heart attack', 'chest pain'],
    choke: ['engasgamento', 'heimlich', 'engasgado', 'asfixia', 'choke', 'não respira', 'comida na garganta', 'choking'],
    drowning: ['afogamento', 'drowning', 'água', 'mar', 'piscina', 'rio', 'afogar', 'drowned'],
    robbery: ['roubo', 'assalto', 'agressão', 'robbery', 'seguir', 'seguindo', 'perseguido', 'arma', 'ameaça', 'estão-me a seguir', 'estão a seguir-me', 'perigo', 'mugging', 'someone is following me'],
    aid: ['cortes', 'sangue', 'hemorragia', 'ferida', 'aid', 'primeiros socorros', 'ferido', 'magoado', 'bleeding', 'injury'],
    flood: ['inundação', 'cheias', 'barrenta', 'águas', 'flood', 'enchente', 'flooding'],
    gas: ['gás', 'cheiro', 'fuga', 'explosão', 'gas leak', 'smell of gas'],
    burns: ['queimadura', 'queimei', 'quente', 'escaldar', 'burn', 'scald']
  };
  for (const [id, keywords] of Object.entries(mappings)) {
    if (keywords.some(kw => input.includes(kw))) {
      return OFFLINE_GUIDES.find(g => g.id === id);
    }
  }
  return undefined;
};

/**
 * Deteta, a partir do texto da conversa, que tipo de local a pessoa provavelmente
 * precisa de encontrar perto de si (hospital, bombeiros, abrigo, etc.), para que a
 * app possa oferecer um botão direto com direções — em vez de a pessoa ter de
 * navegar sozinha até ao mapa a meio de uma emergência.
 */
export type DestinationType = 'hospital' | 'fire' | 'police' | 'shelter' | 'health_center';

export const findSuggestedDestinationType = (text: string): DestinationType | undefined => {
  const input = text.toLowerCase();
  const mappings: Record<DestinationType, string[]> = {
    fire: ['incêndio', 'fogo', 'chamas', 'fire', 'arder', 'incendio', 'fumo'],
    shelter: ['furacão', 'furacao', 'hurricane', 'tempestade', 'storm', 'inundação', 'inundacao', 'flood', 'cheias', 'onde me devo abrigar', 'onde devo ir', 'para onde vou', 'onde é seguro', 'zona segura', 'evacuar', 'evacuação'],
    hospital: ['hospital', 'ferido', 'sangue', 'hemorragia', 'inconsciente', 'não respira', 'urgência', 'emergência médica'],
    police: ['assalto', 'roubo', 'agressão', 'arma', 'seguir', 'perseguido', 'ameaça', 'polícia'],
    health_center: ['centro de saúde', 'mal disposto', 'febre', 'não urgente']
  };
  for (const [type, keywords] of Object.entries(mappings) as [DestinationType, string[]][]) {
    if (keywords.some(kw => input.includes(kw))) {
      return type;
    }
  }
  return undefined;
};

export const getHumanInstantResponse = (text: string): string | null => {
  const input = text.toLowerCase();
  if (input.includes('estão-me a seguir') || input.includes('seguir') || input.includes('perseguido')) {
    return "Mantenha a calma, estou aqui consigo. Procure um local iluminado e com movimento agora mesmo. Não pare de andar. Preparei o guia de segurança para si abaixo.";
  }
  if (input.includes('enfarte') || input.includes('coração') || input.includes('dor no peito')) {
    return "Tente manter-se sentado e respire fundo. Evite qualquer esforço. Já localizei o protocolo de emergência cardíaca para o orientar.";
  }
  if (input.includes('fogo') || input.includes('incêndio')) {
    return "Saia do local imediatamente! Não use elevadores sob nenhuma circunstância. Gatinhe se houver fumo. As instruções de evacuação estão prontas abaixo.";
  }
  return null;
};

export const getOfflineResponse = (query: string, profile: UserProfileData | null, guide?: EmergencyGuide): string => {
  const firstName = profile?.fullName ? profile.fullName.split(' ')[0] : '';
  const namePrefix = firstName ? `${firstName}, ` : '';
  const txt = query.toLowerCase();

  const openers = [
    `Estou a ouvir, ${firstName || 'ajudo já'}.`,
    `Entendido.`,
    `Mantenha a calma, ${firstName || 'estou aqui'}.`,
    `Vou orientar os passos imediatamente.`,
    `Compreendo a situação.`
  ];
  const randomOpener = openers[Math.floor(Math.random() * openers.length)];
  const protocolFooter = `\n\n*Nota: Estou a utilizar o protocolo de emergência local para garantir resposta instantânea sem interrupções.*`;

  if (guide) {
    const formattedSteps = guide.steps.map((step, idx) => `${idx + 1}. ${step}`).join('\n\n');
    return `${randomOpener} Identifiquei um cenário de **${guide.title}**.\n\n${namePrefix}Siga estas instruções agora:\n\n${formattedSteps}${protocolFooter}`;
  }

  if (txt.includes('sismo') || txt.includes('terramoto') || txt.includes('tremor')) {
    return `${randomOpener} Em caso de sismo, o mais importante é não correr.\n\n1. **Baixe-se**.\n2. **Proteja a cabeça**.\n3. **Aguarde** que o tremor pare.`;
  }
  
  if (txt.includes('fogo') || txt.includes('incêndio')) {
    return `${randomOpener} Saia imediatamente do edifício. Use as escadas, nunca o elevador. Se houver fumo, rasteje pelo chão.`;
  }

  if (txt.includes('coração') || txt.includes('enfarte')) {
    return `${randomOpener} ${namePrefix}peça a alguém para ligar para o **112** agora. Mantenha a pessoa sentada e calma.`;
  }

  return `Entendido, ${namePrefix}. Estou a monitorizar a sua segurança. Se tiver uma emergência específica como um sismo ou fogo, diga-me agora.`;
};

export const callDatabricksAI = async (query: string, history: any[] = []) => {
  try {
    const response = await fetch('/api/ai/databricks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        messages: [
          { role: 'system', content: 'Você é um assistente de emergência avançado.' },
          ...history,
          { role: 'user', content: query }
        ] 
      })
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    return null;
  }
};
