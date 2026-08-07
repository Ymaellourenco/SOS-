import { EmergencyGuide, UserProfileData } from '../types';
import { OFFLINE_GUIDES } from '../constants';
import { calculateDistance } from '../lib/utils';
import { fetchNearbyEmergencyPOIs, EmergencyPOI } from './emergencyService';

/**
 * Verifica se `keyword` aparece em `input` como palavra/frase inteira, não como
 * pedaço de dentro de outra palavra.
 *
 * BUG REAL que isto corrige (Ago 2026): a palavra-chave solta "mar" (para
 * detetar afogamento) fazia disparar o guia de afogamento sempre que alguém
 * escrevia "câmara municipal" — porque "mar" está literalmente contido dentro
 * de "câMARa". Um simples `input.includes(keyword)` não distingue "mar" como
 * palavra própria de "mar" como pedaço de "câmara", "marido", "mármore", etc.
 * Isto acontece com qualquer palavra-chave curta (rio, água, calor...), por
 * isso a verificação de fronteira de palavra aplica-se a todas, não só a esta.
 */
function containsWholeWord(input: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // \w do JavaScript não inclui letras acentuadas — por isso define-se aqui um
  // conjunto próprio de "caracteres de palavra" em português (com acentos) para
  // que a fronteira funcione corretamente em frases como "café" ou "não".
  const wordChar = 'a-zà-öø-ÿ0-9';
  const pattern = new RegExp(`(?<![${wordChar}])${escaped}(?![${wordChar}])`, 'i');
  return pattern.test(input);
}

// Cache simples: evita repetir o pedido a /api/alerts a cada mensagem enviada.
let situationalContextCache: { data: string; timestamp: number; lat: number; lng: number } | null = null;
const SITUATIONAL_CONTEXT_TTL = 2 * 60 * 1000; // 2 minutos

/**
 * Constrói um resumo em texto dos alertas oficiais reais (incêndios, avisos IPMA, sismos)
 * perto da localização do utilizador, para a IA responder com base em dados verdadeiros
 * e não apenas no que o utilizador escreveu. Nunca deixa a IA "às cegas" quando existe
 * informação oficial disponível sobre a zona.
 */
/**
 * Constrói um bloco de texto com os locais de emergência REAIS e verificados mais
 * próximos (hospital, esquadra, quartel de bombeiros) — a mesma pesquisa usada no
 * botão de "pesquisa real" da app (Overpass/OSM + base curada de reserva).
 *
 * Isto existe para dar à IA de chat dados verdadeiros a que se agarrar. Sem isto, a
 * IA recebia apenas a instrução "nunca invente nomes de hospitais" mas nenhum nome
 * real para usar em alternativa — e, na prática, modelos de linguagem tendem a
 * inventar um nome plausível em vez de admitir que não sabem, especialmente sob
 * pressão de uma pergunta direta numa emergência. Ao fornecer aqui os locais reais,
 * a IA passa a poder responder com factos verificados em vez de arriscar uma
 * alucinação (como aconteceu — nomes de hospital inventados/incorretos).
 */
/**
 * Guarda o último resultado real (por tipo de local) que a função acima já deu à
 * IA para responder no chat — para que o botão "Ver X mais próximo" reutilize
 * exatamente o mesmo local, em vez de fazer uma pesquisa nova e independente.
 *
 * BUG REAL que isto corrige (Ago 2026): o texto do chat e o botão de direções
 * podiam apontar para sítios DIFERENTES na mesma conversa — ex: o chat dizia
 * "Bombeiros Municipais de Viseu, a 0.8km" (vindo da lista curada de reserva,
 * porque a Overpass falhou nesse pedido específico), e o botão pouco depois
 * abria direções para "Bombeiros Sapadores de Viseu, a 1.1km" (porque dessa vez
 * a Overpass respondeu). A Overpass é instável o suficiente para que dois
 * pedidos segundos à parte, mesmo com coordenadas quase iguais, possam ter
 * sucesso/falha diferentes — por isso reutilizar o resultado já obtido em vez de
 * perguntar outra vez é a única forma de garantir que nunca se contradizem.
 */
let lastResolvedNearbyPlaces: {
  byType: Partial<Record<EmergencyPOI['type'], EmergencyPOI & { distance: number }>>;
  lat: number;
  lng: number;
  timestamp: number;
} | null = null;

const NEARBY_PLACES_REUSE_TTL = 5 * 60 * 1000; // 5 minutos
const NEARBY_PLACES_REUSE_MAX_DRIFT_KM = 3; // além disto, a pessoa pode já ter-se movido demasiado

/**
 * Devolve o local já mostrado no chat para este tipo (hospital, bombeiros...), se
 * ainda for recente e a localização atual não tiver mudado muito — para o botão
 * de direções usar exatamente o mesmo sítio que a IA acabou de mencionar, em vez
 * de arriscar uma pesquisa nova que dê uma resposta diferente (ver nota acima).
 */
export function getLastResolvedNearbyPlace(
  type: EmergencyPOI['type'],
  currentLat: number,
  currentLng: number
): (EmergencyPOI & { distance: number }) | null {
  if (!lastResolvedNearbyPlaces) return null;
  if (Date.now() - lastResolvedNearbyPlaces.timestamp > NEARBY_PLACES_REUSE_TTL) return null;
  const drift = calculateDistance(currentLat, currentLng, lastResolvedNearbyPlaces.lat, lastResolvedNearbyPlaces.lng);
  if (drift > NEARBY_PLACES_REUSE_MAX_DRIFT_KM) return null;
  return lastResolvedNearbyPlaces.byType[type] ?? null;
}

async function buildNearbyRealPlacesText(lat: number, lng: number): Promise<string> {
  try {
    const pois = await fetchNearbyEmergencyPOIs(lat, lng, 15);
    if (!pois || pois.length === 0) {
      lastResolvedNearbyPlaces = { byType: {}, lat, lng, timestamp: Date.now() };
      return 'LOCAIS REAIS PRÓXIMOS: pesquisa em tempo real sem resultados nesta zona — não mencione nenhum nome de hospital/esquadra/quartel específico, apenas incentive a usar o botão de pesquisa real da app ou ligar 112/999.';
    }

    const withDistance = pois.map(p => ({
      ...p,
      distance: calculateDistance(lat, lng, p.location.lat, p.location.lng)
    }));

    const pickNearest = (type: EmergencyPOI['type'], preferPublic = false) => {
      let candidates = withDistance.filter(p => p.type === type);
      if (preferPublic) {
        const publicOnes = candidates.filter(p => !p.isPrivate);
        if (publicOnes.length > 0) candidates = publicOnes;
      }
      return candidates.sort((a, b) => a.distance - b.distance)[0];
    };

    const nearestHospital = pickNearest('hospital', true);
    const nearestHealthCenter = pickNearest('health_center');
    const nearestPolice = pickNearest('police');
    const nearestFire = pickNearest('fire');
    const nearestMunicipality = pickNearest('municipality');

    // Guarda o que foi encontrado para o botão reutilizar depois (ver função acima).
    lastResolvedNearbyPlaces = {
      byType: {
        hospital: nearestHospital,
        health_center: nearestHealthCenter,
        police: nearestPolice,
        fire: nearestFire,
        municipality: nearestMunicipality
      },
      lat, lng,
      timestamp: Date.now()
    };

    const lines: string[] = [];
    const describe = (label: string, p?: typeof withDistance[number]) => {
      if (!p) return;
      const addr = p.address ? `, ${p.address}` : '';
      const estimateNote = p.isEstimate ? ' (posição aproximada — confirme ligando 112 ou pelo botão de pesquisa)' : '';
      lines.push(`- ${label}: ${p.name}${addr} — a ${p.distance.toFixed(1)}km${estimateNote}`);
    };
    describe('Hospital mais próximo', nearestHospital);
    describe('Centro de Saúde mais próximo', nearestHealthCenter);
    describe('Esquadra/Polícia mais próxima', nearestPolice);
    describe('Bombeiros mais próximos', nearestFire);
    describe('Câmara Municipal/Proteção Civil mais próxima', nearestMunicipality);

    if (lines.length === 0) {
      return 'LOCAIS REAIS PRÓXIMOS: pesquisa em tempo real sem resultados nesta zona — não mencione nenhum nome de hospital/esquadra/quartel específico, apenas incentive a usar o botão de pesquisa real da app ou ligar 112/999.';
    }

    return `LOCAIS REAIS PRÓXIMOS (verificados agora, via pesquisa real da app):\n${lines.join('\n')}\n\nPode mencionar estes nomes e distâncias EXATAMENTE como estão acima, se for útil para a pessoa. NUNCA invente outro nome, endereço ou distância que não esteja nesta lista.`;
  } catch (error) {
    return 'LOCAIS REAIS PRÓXIMOS: não foi possível confirmar agora (falha de rede) — não mencione nenhum nome de hospital/esquadra/quartel específico, apenas incentive a usar o botão de pesquisa real da app ou ligar 112/999.';
  }
}

export const buildSituationalContext = async (lat: number | null, lng: number | null): Promise<string> => {
  if (lat === null || lng === null) {
    return 'LOCALIZAÇÃO: não disponível — não é possível cruzar com alertas oficiais próximos, nem confirmar hospitais/esquadras/quartéis reais perto da pessoa. Se perguntarem por um local concreto, peça para ativar a localização ou use o botão de pesquisa real da app.';
  }

  if (
    situationalContextCache &&
    Date.now() - situationalContextCache.timestamp < SITUATIONAL_CONTEXT_TTL &&
    calculateDistance(lat, lng, situationalContextCache.lat, situationalContextCache.lng) < 2
  ) {
    return situationalContextCache.data;
  }

  // As duas pesquisas (alertas oficiais + locais reais próximos) são independentes
  // uma da outra — a falha de uma nunca deve impedir a outra de ser usada.
  const [alertsText, nearbyPlacesText] = await Promise.all([
    (async () => {
      try {
        const response = await fetch('/api/alerts');
        if (!response.ok) throw new Error('Falha ao obter alertas');
        const alerts: any[] = await response.json();

        const nearby = alerts
          .map(a => ({ ...a, distance: calculateDistance(lat, lng, a.location.lat, a.location.lng) }))
          .filter(a => a.distance <= 50)
          .sort((a, b) => {
            const rank = (s: string) => s === 'high' ? 0 : s === 'medium' ? 1 : 2;
            const rankDiff = rank(a.severity) - rank(b.severity);
            return rankDiff !== 0 ? rankDiff : a.distance - b.distance;
          })
          .slice(0, 5);

        if (nearby.length === 0) {
          return 'ALERTAS OFICIAIS PRÓXIMOS: nenhum alerta ativo dentro de 50km da localização do utilizador neste momento, segundo as fontes oficiais (ANEPC/IPMA).';
        }
        const severityLabel = (s: string) => s === 'high' ? 'CRÍTICO' : s === 'medium' ? 'IMPORTANTE' : 'INFORMATIVO';
        const lines = nearby.map(a =>
          `- [${severityLabel(a.severity)}] ${a.title} — a ${a.distance.toFixed(1)}km${a.isActive ? ' (ainda ATIVO/em curso)' : ''}. ${a.description}`
        );
        return `ALERTAS OFICIAIS PRÓXIMOS (ANEPC/IPMA, confirmados, dentro de 50km):\n${lines.join('\n')}\n\nCruze estes dados com o que o utilizador descrever. Se o utilizador mencionar algo consistente com um destes alertas, trate como corroborado e aumente a urgência. Se um alerta oficial existir mas o utilizador disser que está tudo bem, informe-o da existência do alerta na mesma, sem alarmismo.`;
      } catch (error) {
        return 'ALERTAS OFICIAIS PRÓXIMOS: não foi possível consultar neste momento (falha de rede) — responda apenas com base no relato do utilizador e peça mais detalhes se necessário.';
      }
    })(),
    buildNearbyRealPlacesText(lat, lng)
  ]);

  const text = `${alertsText}\n\n${nearbyPlacesText}`;
  situationalContextCache = { data: text, timestamp: Date.now(), lat, lng };
  return text;
};

export const findSuggestedGuide = (text: string): EmergencyGuide | undefined => {
  const input = text.toLowerCase();
  const mappings: Record<string, string[]> = {
    quake: [
      'sismo', 'terremoto', 'tremor', 'quake', 'terramoto', 'chão a abanar', 'earthquake',
      'a casa abanou', 'o chão mexeu', 'os móveis começaram a mexer', 'os candeeiros abanam',
      'caiu tudo da prateleira', 'senti uma vibração enorme', 'parece que houve um sismo'
    ],
    fire: [
      'fogo', 'incêndio', 'chamas', 'smoke', 'fumo', 'fire', 'arder', 'queimado', 'incendio',
      'fogo enorme perto', 'muito fumo', 'cheio de cinzas', 'cheira a queimado', 'cheira muito a queimado',
      'árvores estão a arder', 'vejo chamas', 'incêndio está a aproximar', 'fogo está quase aqui',
      'o monte está a arder', 'incêndio vem nesta direção', 'está tudo laranja', 'os bombeiros passaram',
      'helicópteros a apagar', 'ouço explosões', 'o fogo parece perto', 'prédio está a arder',
      'apartamento cheio de fumo', 'corredor cheio de fumo', 'disparou o alarme', 'não consigo sair',
      'telhado começou a estalar', 'a eletricidade foi abaixo'
    ],
    heart: [
      'coração', 'enfarte', 'enfarto', 'cardíaco', 'heart', 'dor no peito', 'braço esquerdo', 'heart attack', 'chest pain',
      'não consigo respirar', 'tenho dores no peito', 'estou a desmaiar', 'estou muito tonto', 'não sinto um braço',
      'a minha cara está estranha', 'não consigo falar', 'acho que tive um avc', 'ataque cardíaco'
    ],
    choke: ['engasgamento', 'heimlich', 'engasgado', 'engasgada', 'engasgou', 'engasgando', 'asfixia', 'choke', 'não respira', 'nao respira', 'comida na garganta', 'choking'],
    drowning: ['afogamento', 'drowning', 'água', 'mar', 'piscina', 'rio', 'afogar', 'afogado', 'afogada', 'drowned'],
    robbery: ['roubo', 'assaltaram', 'assaltar-me', 'ladrão', 'querem o meu dinheiro', 'querem o meu telemóvel', 'mugging'],
    pursuit: ['seguir', 'seguindo', 'perseguido', 'perseguida', 'arma', 'ameaça', 'ameaçou', 'agressão', 'estão-me a seguir', 'estão a seguir-me', 'vai bater', 'vai me bater', 'bateu-me', 'bateu me', 'quer bater', 'a seguir-me', 'me a seguir', 'someone is following me'],
    aid: [
      'cortes', 'sangue', 'hemorragia', 'ferida', 'aid', 'primeiros socorros', 'ferido', 'magoado', 'bleeding', 'injury',
      'estou a perder muito sangue', 'houve uma explosão', 'o carro capotou', 'houve uma colisão', 'vi um acidente', 'estou preso no carro'
    ],
    flood: [
      'inundação', 'cheias', 'barrenta', 'águas', 'flood', 'enchente', 'flooding', 'furacão', 'furacao', 'hurricane',
      'tempestade', 'storm', 'vento forte', 'ciclone', 'tornado', 'tufão', 'tufao', 'typhoon', 'vento estranho', 'céu está verde', 'vento fortíssimo',
      'árvores todas a dobrar', 'caiu granizo enorme', 'barulho parecido com um comboio', 'nuvem em funil',
      'vai formar um tornado', 'tempestade muito agressiva', 'água está a subir', 'rua cheia de água',
      'rio saiu da margem', 'garagem inundada', 'não consigo sair de casa', 'estou preso', 'corrente é muito forte',
      'caiu uma encosta', 'veio lama', 'estrada desapareceu', 'pedras enormes', 'a montanha caiu', 'terreno está a deslizar'
    ],
    gas: ['gás', 'cheiro', 'fuga', 'explosão', 'gas leak', 'smell of gas'],
    burns: ['queimadura', 'queimei', 'quente', 'escaldar', 'burn', 'scald'],
    heat: ['onda de calor', 'muito calor', 'calor extremo', 'insolação', 'desidratado', 'desidratação', 'heatwave', 'heat stroke']
  };
  for (const [id, keywords] of Object.entries(mappings)) {
    if (keywords.some(kw => containsWholeWord(input, kw))) {
      return OFFLINE_GUIDES.find(g => g.id === id);
    }
  }
  return undefined;
};

/**
 * Frases curtas e vagas que, numa emergência já em curso, provavelmente significam
 * "sim, preciso de ajuda" — usadas para oferecer o envio de localização de imediato
 * em vez de exigir que a pessoa formule uma frase completa sob pressão.
 */
export const isShortAffirmativeDistressReply = (text: string): boolean => {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/, '');
  const shortAffirmatives = [
    'sim', 'ajuda', 'socorro', 'salvem-me', 'salve-me', 'depressa', 'não consigo', 'nao consigo',
    'quero', 'quero sim', 'sim por favor', 'sim, por favor', 'quero que sim', 'por favor', 'ok', 'okay'
  ];
  return shortAffirmatives.includes(normalized);
};

/** Frases que indicam que a pessoa pode estar fisicamente impedida de sair/fugir. */
export const indicatesTrappedOrSurrounded = (text: string): boolean => {
  const input = text.toLowerCase();
  const keywords = [
    'não consigo sair', 'nao consigo sair', 'estou preso', 'estou rodeado', 'estou cercado',
    'fumo é muito intenso', 'não vejo nada', 'nao vejo nada', 'estou encurralado', 'estou bloqueado',
    'não consigo respirar', 'nao consigo respirar'
  ];
  return keywords.some(kw => containsWholeWord(input, kw));
};

/**
 * Deteta ideação suicida ou desejo de autoagressão. Tratada em separado do perigo
 * físico: aqui a resposta certa nunca é "enviar localização" ou "ligar 112 para
 * apagar um incêndio" — é validação emocional e encaminhamento para linhas de
 * apoio especializadas, sempre com o mesmo texto verificado, nunca gerado
 * livremente, para nunca arriscar um número de telefone errado numa situação
 * potencialmente fatal.
 */
export const indicatesSuicidalIdeation = (text: string): boolean => {
  const input = text.toLowerCase();
  const keywords = [
    'quero me matar', 'quero matar-me', 'quero morrer', 'quero acabar com a minha vida',
    'acabar com a vida', 'não quero viver', 'nao quero viver', 'não aguento mais viver',
    'nao aguento mais viver', 'quero parar de sofrer', 'suicídio', 'suicidio',
    'pensamentos suicidas', 'tirar a minha vida', 'já não vale a pena viver',
    'ja nao vale a pena viver', 'quero desaparecer para sempre'
  ];
  return keywords.some(kw => containsWholeWord(input, kw));
};

/**
 * Deteta quando a pessoa quer avisar os contactos de que está segura/bem — ex: em
 * resposta à pergunta de acompanhamento pós-navegação ("já chegou a um local
 * seguro?"). Nestes casos mostramos um botão real que envia essa mensagem, em vez
 * de a IA descrever um processo que não existe.
 */
export const indicatesWantsToConfirmSafety = (text: string): boolean => {
  const input = text.toLowerCase();
  const keywords = [
    'desejo', 'quero avisar', 'avisar que estou bem', 'avisar os meus contactos',
    'estou bem e em seguranca', 'estou bem e em segurança', 'diz-lhes que estou bem',
    'avisa que estou bem', 'informar que estou bem'
  ];
  return keywords.some(kw => containsWholeWord(input, kw));
};

/**
 * Deteta, a partir do texto da conversa, que tipo de local a pessoa provavelmente
 * precisa de encontrar perto de si (hospital, bombeiros, câmara, etc.), para que a
 * app possa oferecer um botão direto com direções — em vez de a pessoa ter de
 * navegar sozinha até ao mapa a meio de uma emergência.
 */
export type DestinationType = 'hospital' | 'fire' | 'police' | 'municipality' | 'health_center';

/**
 * Palavras que nomeiam um tipo de local concretamente — quando aparecem, mostramos
 * logo o botão certo, sem precisar de perguntar mais nada.
 */
const EXPLICIT_DESTINATION_KEYWORDS: Record<DestinationType, string[]> = {
  fire: ['bombeiros', 'quartel de bombeiros', 'quartel dos bombeiros'],
  hospital: ['hospital', 'urgência', 'urgencia', 'emergência médica', 'emergencia medica'],
  police: ['polícia', 'policia', 'esquadra', 'psp', 'gnr'],
  municipality: ['câmara', 'camara', 'câmara municipal', 'camara municipal', 'junta de freguesia', 'autarquia', 'proteção civil', 'protecao civil'],
  health_center: ['centro de saúde', 'centro de saude', 'posto de saúde', 'posto de saude']
};

/**
 * Palavras que indicam que a pessoa precisa de ir para algum lado, mas sem dizer
 * qual — nestes casos a app deve perguntar antes de adivinhar, em vez de escolher
 * um tipo de local sozinha.
 */
const VAGUE_RELOCATION_KEYWORDS = [
  'furacão', 'furacao', 'hurricane', 'tempestade', 'storm', 'inundação', 'inundacao', 'flood', 'cheias',
  'onde me devo abrigar', 'onde devo ir', 'para onde vou', 'onde é seguro', 'onde e seguro', 'zona segura',
  'evacuar', 'evacuação', 'evacuacao', 'sítio seguro', 'sitio seguro', 'lugar seguro', 'local seguro',
  'preciso ir embora', 'quero ir embora', 'preciso de ir a algum sítio', 'preciso de ir a algum lado',
  'para onde gostaria', 'preciso de ir'
];

/** Se o texto nomear um local concreto (hospital, bombeiros, câmara...), devolve logo esse tipo. */
export const findExplicitDestinationType = (text: string): DestinationType | undefined => {
  const input = text.toLowerCase();
  for (const [type, keywords] of Object.entries(EXPLICIT_DESTINATION_KEYWORDS) as [DestinationType, string[]][]) {
    if (keywords.some(kw => containsWholeWord(input, kw))) {
      return type;
    }
  }
  return undefined;
};

/** Se o texto expressar vontade de ir para algum lado sem dizer qual. */
export const isVagueRelocationRequest = (text: string): boolean => {
  const input = text.toLowerCase();
  return VAGUE_RELOCATION_KEYWORDS.some(kw => containsWholeWord(input, kw));
};

export const getHumanInstantResponse = (text: string): string | null => {
  const input = text.toLowerCase();
  if (containsWholeWord(input, 'estão-me a seguir') || containsWholeWord(input, 'seguir') || containsWholeWord(input, 'perseguido')) {
    return "Mantenha a calma, estou aqui consigo. Procure um local iluminado e com movimento agora mesmo. Não pare de andar. Preparei o guia de segurança para si abaixo.";
  }
  if (containsWholeWord(input, 'enfarte') || containsWholeWord(input, 'coração') || containsWholeWord(input, 'dor no peito')) {
    return "Tente manter-se sentado e respire fundo. Evite qualquer esforço. Já localizei o protocolo de emergência cardíaca para o orientar.";
  }
  if (containsWholeWord(input, 'fogo') || containsWholeWord(input, 'incêndio')) {
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

  if (guide) {
    const formattedSteps = guide.steps.map((step, idx) => `${idx + 1}. ${step}`).join('\n\n');
    return `${randomOpener} Identifiquei um cenário de **${guide.title}**.\n\n${namePrefix}Siga estas instruções agora:\n\n${formattedSteps}`;
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

  return `Entendido${firstName ? `, ${firstName}` : ''}. Não tenho a certeza se está em perigo — pode dizer-me o que está a acontecer, se está em segurança, e se precisa de ajuda imediata?`;
};

export const callDatabricksAI = async (query: string, history: any[] = [], systemContext?: string) => {
  try {
    const response = await fetch('/api/ai/databricks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        messages: [
          { role: 'system', content: `Você é um assistente de emergência avançado.${systemContext ? `\n\n${systemContext}` : ''}` },
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
