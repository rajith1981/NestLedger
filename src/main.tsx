import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { StatementProvider } from './context/StatementContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <StatementProvider>
        <App />
      </StatementProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// Register offline Service Worker for instant loading and 100% offline capability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Automatically check for updates
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[NestLedger] New version available.');
              }
            };
          }
        };
      })
      .catch((err) => {
        console.warn('[NestLedger] Service Worker registration failed:', err);
      });
  });
}

