import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const root = document.getElementById('root');

if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // noop
    });
  });
}
