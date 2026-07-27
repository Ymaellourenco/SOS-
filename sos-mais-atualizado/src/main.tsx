import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { logger } from './lib/logger';
import './index.css';

// eslint-disable-next-line no-console
console.log('%c[SOS MAIS] BUILD MARKER 2026-07-03-v2 — se não vês isto, o browser não está a correr este código.', 'background:#dc2626;color:#fff;font-weight:bold;padding:4px 8px;border-radius:4px;');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      logger.warn('SW registration failed: ', err);
    });
  });
}
