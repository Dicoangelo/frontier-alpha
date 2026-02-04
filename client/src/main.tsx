import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

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

// Register service worker for PWA support
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[App] Service worker registered:', registration.scope);
      })
      .catch((error) => {
        console.log('[App] Service worker registration failed:', error);
      });
  });
}
