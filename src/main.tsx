import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { logger } from './lib/logger';
import { patchFetchForNativeApp, getApiBaseUrl } from './lib/apiConfig';
import './index.css';

// Tem de correr antes de qualquer componente fazer o primeiro pedido à API —
// sem isto, a app nativa (Android Studio, telemóvel instalado) não sabe onde
// está o servidor e todos os pedidos falham com "Unexpected token '<'".
patchFetchForNativeApp();

// eslint-disable-next-line no-console
console.log('%c[SOS MAIS] BUILD MARKER 2026-08-04-FIX-PERMISSION-CRASH — se não vês ESTA versão exata, a app/browser não está a correr o código mais recente.', 'background:#dc2626;color:#fff;font-weight:bold;padding:4px 8px;border-radius:4px;');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${getApiBaseUrl()}/sw.js`).catch(err => {
      logger.warn('SW registration failed: ', err);
    });
  });
}
