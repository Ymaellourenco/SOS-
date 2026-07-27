/**
 * Quando a app corre no BROWSER (dev, ou publicada num domínio a sério), os
 * pedidos a "/api/..." resolvem automaticamente para o mesmo servidor que
 * serviu a página — não precisam de nada especial.
 *
 * Mas quando a app corre como APP NATIVA (via Capacitor, no Android Studio ou
 * já instalada no telemóvel), o HTML/JS vem embutido dentro da app, servido
 * de um esquema interno (ex: "capacitor://localhost" ou "https://localhost"),
 * e NÃO de um servidor real — por isso "/api/..." nunca chega ao backend, e
 * o pedido acaba a apanhar uma página de erro em HTML em vez de JSON (o erro
 * "Unexpected token '<'" que viste é exatamente isto a acontecer).
 *
 * Para a app nativa funcionar, precisa de saber o endereço REAL do servidor.
 *
 * IMPORTANTE — emulador vs telemóvel real usam endereços DIFERENTES:
 * - No EMULADOR do Android Studio: usa "10.0.2.2" — é um endereço especial
 *   fixo que o Android reserva para significar "o computador que está a
 *   correr o emulador". Confirmado a funcionar diretamente (testado no Chrome
 *   dentro do emulador). NUNCA é o IP normal da tua rede Wi-Fi.
 * - No TELEMÓVEL REAL, ligado à mesma Wi-Fi do computador: usa o IP normal
 *   da tua rede (ex: 192.168.1.69) — o mesmo que já usaste para testar pelo
 *   browser.
 * Muda a linha USING_EMULATOR consoante o que estiveres a testar agora.
 *
 * IMPORTANTE — nunca uses "import.meta.env.PROD" para decidir isto: o
 * "npm run build" usado para gerar a app nativa é SEMPRE uma build de
 * produção do Vite, mesmo quando estás só a testar no emulador — por isso
 * "import.meta.env.PROD" é sempre verdadeiro aqui, mesmo sem teres publicado
 * nada a sério ainda. Foi exatamente isto que causou o "base vazio" que
 * apanhámos nos registos de diagnóstico. Usa sempre o interruptor manual
 * abaixo, que só tu controlas.
 *
 * QUANDO PUBLICARES A SÉRIO: muda IS_DEPLOYED_TO_PRODUCTION para true, e
 * preenche PRODUCTION_SERVER_URL com o domínio real do servidor.
 */
const USING_EMULATOR = true; // <- muda para false quando testares num telemóvel Android real
const IS_DEPLOYED_TO_PRODUCTION = false; // <- muda para true só quando publicares a sério
const DEV_LAN_IP = "192.168.1.69"; // <- o IP da tua rede Wi-Fi, para telemóvel real (atualiza se mudar)
const DEV_SERVER_URL = USING_EMULATOR ? "http://10.0.2.2:3000" : `http://${DEV_LAN_IP}:3000`;
const PRODUCTION_SERVER_URL = ""; // <- preenche quando publicares (ex: "https://api.sosmais.pt")

function isNativePlatform(): boolean {
  const capacitor = (window as any).Capacitor;
  return !!(capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform());
}

/**
 * NUNCA calcular isto uma única vez num valor fixo à parte — "window.Capacitor"
 * pode ainda não estar pronto no instante exato em que este módulo carrega
 * (é injetado pela ponte nativa, que pode chegar um instante depois do nosso
 * próprio código JavaScript). Se calculássemos isto só uma vez cedo demais,
 * ficaria "trancado" a vazio para sempre, mesmo a app sendo mesmo nativa —
 * foi exatamente isso que aconteceu (confirmado: window.Capacitor.isNativePlatform()
 * já devolvia true mais tarde, mas o valor tinha ficado preso a "falso" no arranque).
 * Por isso calculamos isto de novo, a cada pedido, nunca uma vez só.
 */
export function getApiBaseUrl(): string {
  if (!isNativePlatform()) return ""; // browser normal — caminhos relativos funcionam sozinhos
  return IS_DEPLOYED_TO_PRODUCTION ? PRODUCTION_SERVER_URL : DEV_SERVER_URL;
}

// Mantido por compatibilidade com quem já importa API_BASE_URL diretamente (ex: para
// construir o link de acompanhamento) — mas para decisões feitas ANTES da app estar
// totalmente carregada, prefere sempre chamar getApiBaseUrl() em vez desta constante.
export const API_BASE_URL: string = getApiBaseUrl();

/**
 * Substitui o fetch global para reescrever automaticamente caminhos relativos
 * ("/api/...", "/track.html...") quando a app corre nativa — assim nenhum dos
 * ficheiros que já chamam fetch('/api/...') precisa de ser alterado um a um.
 * A verificação de "é nativo?" acontece SEMPRE dentro da função, a cada pedido —
 * nunca fica presa a um valor antigo calculado só uma vez no arranque.
 */
export function patchFetchForNativeApp() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const base = getApiBaseUrl();
    const isRelativeApiPath = typeof input === 'string' && input.startsWith('/');
    if (base && isRelativeApiPath) {
      return originalFetch(base + input, init);
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}
