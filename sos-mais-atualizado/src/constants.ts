import { EmergencyGuide } from './types';

export const OFFLINE_GUIDES: EmergencyGuide[] = [
  {
    id: 'choke',
    title: 'Engasgamento',
    description: 'Manobra de Heimlich imediata.',
    category: 'heart',
    steps: [
      'Incentive a pessoa a tossir se ela ainda conseguir respirar.',
      'Se não conseguir respirar, coloque-se atrás da pessoa.',
      'Feche o punho acima do umbigo e abaixo do esterno.',
      'Aplique pressões rápidas para cima e para dentro.',
      'Repita até que o objeto seja expelido ou a pessoa perca os sentidos.',
      'Se ficar inconsciente, ligue 112 imediatamente.'
    ]
  },
  {
    id: 'drowning',
    title: 'Afogamento',
    description: 'Resgate e estabilização de vítima.',
    category: 'drowning',
    steps: [
      'Peça ajuda imediata (Ligue 112).',
      'Não tente nadar até a vítima se não for treinado.',
      'Lance um objeto flutuante (boia, corda, ramo).',
      'Se remover a vítima da água, coloque-a de lado e verifique a respiração.',
      'Inicie RCP se necessário e souber como fazer.'
    ]
  },
  {
    id: 'heart',
    title: 'Ataque Cardíaco',
    description: 'Primeiros socorros para suspeita de enfarte.',
    category: 'heart',
    steps: [
      'Ligue imediatamente para o 112.',
      'Mantenha a pessoa sentada e calma.',
      'Desperte roupas apertadas.',
      'Pergunte se a pessoa toma medicação para o coração.',
      'Se a pessoa ficar inconsciente, inicie manobras de reanimação (RCP) se souber.'
    ]
  },
  {
    id: 'fire',
    title: 'Incêndio',
    description: 'Como evacuar um edifício em chamas.',
    category: 'fire',
    steps: [
      'Gatinhe pelo chão para evitar o fumo (o ar é mais limpo junto ao solo).',
      'Antes de abrir uma porta, toque nela. Se estiver quente, não abra.',
      'Use as escadas, nunca os elevadores.',
      'Se as roupas pegarem fogo: Pare, Deite-se e Role.',
      'Ligue para o 112 assim que estiver em segurança.'
    ]
  },
  {
    id: 'quake',
    title: 'Sismo / Terremoto',
    description: 'Instruções imediatas durante um abalo sísmico.',
    category: 'quake',
    steps: [
      'BAIXAR: Ponha-se de joelhos. Esta posição protege-o de quedas.',
      'PROTEGER: Proteja a cabeça e o pescoço sob uma mesa ou secretária resistente.',
      'AGUARDAR: Segure-se à sua proteção até que o abalo pare.',
      'Afaste-se de janelas, espelhos e objetos que possam cair.',
      'Não use elevadores.'
    ]
  },
  {
    id: 'robbery',
    title: 'Assalto / Confronto',
    description: 'Gestão de risco em situações de roubo.',
    category: 'heart',
    steps: [
      'Mantenha a calma e não resista. O pânico agrava a situação.',
      'Não faça movimentos bruscos. Mantenha as mãos visíveis.',
      'Evite o contacto visual direto se sentir que o agressor está agitado.',
      'Entregue os bens solicitados. A vida vale mais que objetos.',
      'Após a saída do agressor, peça ajuda e ligue GNR/PSP ou 112.'
    ]
  },
  {
    id: 'aid',
    title: 'Primeiros Socorros',
    description: 'Cortes, hemorragias e ferimentos leves.',
    category: 'heart',
    steps: [
      'Lave as mãos antes de tocar em feridas.',
      'Aplique pressão direta com pano limpo para parar hemorragias.',
      'Lave feridas superficiais com água e sabão neutro.',
      'Não aplique álcool ou tinturas diretamente em cortes abertos.',
      'Se o ferimento for profundo ou não parar de sangrar, procure um posto médico.'
    ]
  },
  {
    id: 'flood',
    title: 'Inundação',
    description: 'Procedimentos em caso de cheias repentinas.',
    category: 'flood',
    steps: [
      'Suba para o ponto mais alto possível.',
      'Não tente atravessar águas correntes a pé ou de carro.',
      'Desligue a eletricidade e o gás se houver tempo.',
      'Mantenha-se informado através da rádio ou telemóvel.'
    ]
  },
  {
    id: 'heat',
    title: 'Onda de Calor',
    description: 'Prevenção contra temperaturas extremas.',
    category: 'heart',
    steps: [
      'Beba água regularmente, mesmo sem sede.',
      'Evite a exposição direta ao sol entre as 11h e as 17h.',
      'Procure ambientes frescos, arejados ou com ar condicionado.',
      'Use roupas leves, largas e de cores claras.',
      'Verifique regularmente idosos ou pessoas que vivem isoladas.'
    ]
  },
  {
    id: 'gas',
    title: 'Fuga de Gás',
    description: 'Procedimentos de segurança imediatos.',
    category: 'fire',
    steps: [
      'Não ligue nem desligue interruptores ou aparelhos elétricos.',
      'Abra imediatamente janelas e portas para ventilar.',
      'Feche a válvula de corte geral do gás.',
      'Não fume nem utilize fósforos ou isqueiros.',
      'Abandone o local e ligue para os bombeiros ou piquete de emergência.'
    ]
  },
  {
    id: 'burns',
    title: 'Queimaduras',
    description: 'Procedimentos básicos para queimaduras térmicas ou químicas.',
    category: 'heart',
    steps: [
      'Afaste a vítima da fonte de calor.',
      'Resfrie a queimadura com água corrente fria por pelo menos 10 minutos.',
      'Não aplique gelo, manteiga ou outros remédios caseiros.',
      'Cubra a queimadura com um pano limpo e seco.',
      'Procure ajuda médica para queimaduras graves ou que afetem áreas extensas.'
    ]
  }
];
