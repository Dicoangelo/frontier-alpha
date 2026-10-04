import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './customer-theme.css';
import { initSentry } from './lib/sentry';

// Initialize error tracking
initSentry();

// Hide initial loader after React mounts
function hideLoader() {
  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), 300);
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Hide loader once DOM is ready
requestAnimationFrame(hideLoader);

// Production worker registration is injected into HTML before the entry module.
// It can repair an old cached entry bundle even when React cannot boot.
