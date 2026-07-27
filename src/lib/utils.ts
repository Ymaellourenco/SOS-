import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { logger } from "./logger";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(date: Date): string {
  const now = new Date();
  const isToday = date.getDate() === now.getDate() && 
                  date.getMonth() === now.getMonth() && 
                  date.getFullYear() === now.getFullYear();
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.getDate() === yesterday.getDate() && 
                      date.getMonth() === yesterday.getMonth() && 
                      date.getFullYear() === yesterday.getFullYear();

  const timeStr = new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  if (isToday) return `Hoje, ${timeStr}`;
  if (isYesterday) return `Ontem, ${timeStr}`;
  
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Vai buscar a última coisa que a pessoa descreveu à IA de Resgate, se houver
 * uma conversa recente guardada — para o SOS disparado a partir de outros
 * sítios da app (ex: o botão de Contactos) poder incluir esse contexto numa
 * mensagem de SMS, em vez de um texto genérico sem informação nenhuma.
 * Só considera conversas dos últimos 15 minutos — mais antigo do que isso já
 * não reflete necessariamente a situação atual.
 */
export function getRecentEmergencyContext(): string | null {
  try {
    const savedRaw = localStorage.getItem('sos_mais_chat_history');
    if (!savedRaw) return null;
    const saved = JSON.parse(savedRaw);
    const age = Date.now() - (saved.timestamp || 0);
    const RECENT_WINDOW_MS = 15 * 60 * 1000;
    if (age >= RECENT_WINDOW_MS || !Array.isArray(saved.messages)) return null;

    const lastUserMessage = [...saved.messages].reverse().find((m: any) => m.role === 'user');
    if (!lastUserMessage?.content) return null;

    // Mensagens de SMS têm limite de espaço — cortamos para caber sem ficar cortado a meio de uma palavra.
    const MAX_LEN = 120;
    const text = lastUserMessage.content.trim();
    return text.length > MAX_LEN ? text.slice(0, MAX_LEN).trim() + '…' : text;
  } catch (e) {
    return null;
  }
}

/**
 * Tenta obter a localização mais precisa possível, esgotando várias hipóteses
 * antes de aceitar uma aproximação — usado em todas as ações de emergência
 * (SOS, procurar hospital) para nunca desistir cedo demais de uma localização
 * real e útil.
 *
 * Ordem de tentativas:
 * 1. GPS de alta precisão (o melhor, mas pode falhar/demorar em interiores ou
 *    em computadores sem chip GPS).
 * 2. Localização de precisão normal — mais rápida, e funciona por Wi-Fi/rede
 *    mesmo quando não há satélite GPS disponível.
 * 3. Só como último recurso: localização aproximada pela ligação à internet
 *    (a menos fiável — pode indicar a cidade errada da região).
 */
export async function getBestAvailableLocation(): Promise<{ lat: number; lon: number; isApproximate: boolean }> {
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 2 * 60 * 1000 })
    );
    return { lat: position.coords.latitude, lon: position.coords.longitude, isApproximate: false };
  } catch (e) {
    logger.warn('[Localização] GPS de alta precisão falhou, a tentar precisão normal:', e);
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 })
    );
    return { lat: position.coords.latitude, lon: position.coords.longitude, isApproximate: false };
  } catch (e) {
    logger.warn('[Localização] Precisão normal também falhou, a tentar aproximação por IP:', e);
  }

  const { fetchApproximateLocation } = await import('../services/ipLocationService');
  const approx = await fetchApproximateLocation();
  if (approx) {
    return { lat: approx.lat, lon: approx.lon, isApproximate: true };
  }

  throw new Error('Sem localização disponível por nenhum método (GPS nem aproximação por IP).');
}

/**
 * Abre a app de mensagens do telemóvel com o número e o texto já preenchidos —
 * a pessoa só precisa de tocar em "Enviar". Não depende de nenhum serviço externo,
 * por isso funciona sempre, mesmo que o Twilio ou qualquer outra API estejam em baixo.
 * iOS e Android usam separadores diferentes no URI (& vs ?), por isso detetamos a plataforma.
 */
export function openPrefilledSMS(phone: string, message: string): boolean {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  if (!cleanPhone) {
    logger.warn('[SMS] Número de telefone vazio/inválido após limpeza — não é possível abrir o composer.', phone);
    return false;
  }
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const separator = isIOS ? '&' : '?';
  const uri = `sms:${cleanPhone}${separator}body=${encodeURIComponent(message)}`;
  window.location.href = uri;
  return true;
}
