// Clock Canvas - React Entry Point

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './store.js';
import App from './App.js';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
