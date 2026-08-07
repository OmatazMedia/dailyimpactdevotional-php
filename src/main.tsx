import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from "react-router-dom";
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './lib/pwa';

// Developer credit — styled message shown only in the browser DevTools
// console. Invisible on the website itself; safe, no functionality impact.
console.log(
  "%cOmataz Media%c — Daily Impact Devotional\n%cWebsite  : https://www.omatazmedia.com.ng\nEmail    : hello@omatazmedia.com.ng\nPhone    : +234 9024599289, +234 7037373304\nWhatsApp : https://wa.me/message/M3QUHNVONY6NK1\nSocial   : @omatazmedia (Facebook · Instagram · X · YouTube · GitHub)\nContact  : Johnson Toluwani",
  "background:#0d9488;color:#fff;font-weight:bold;padding:4px 10px;border-radius:4px;font-size:13px;",
  "color:#0f172a;font-weight:bold;font-size:13px;",
  "color:#475569;font-size:11px;line-height:1.7;",
);

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
