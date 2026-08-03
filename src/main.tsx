import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from "react-router-dom";
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './lib/pwa';

// PWA: register the service worker so the app can be installed and boots
// instantly from cache when opened as an installed app.
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
