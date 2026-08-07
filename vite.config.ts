import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

// Developer credit injected as a comment at the TOP of every built JS + CSS
// file. Visible when inspecting the bundle in DevTools; never rendered on the
// website. (The /*! keeps it in the minified output.)
const OMATAZ_BANNER = `/*!
 * ══════════════════════════════════════════════════════════
 *   Omataz Media — Web Development & Design
 *   Project   : Daily Impact Devotional
 *   Website   : https://www.omatazmedia.com.ng
 *   Email     : hello@omatazmedia.com.ng
 *   Phone     : +234 9024599289, +234 7037373304
 *   WhatsApp  : https://wa.me/message/M3QUHNVONY6NK1
 *   Social    : @omatazmedia — Facebook · Instagram · X · YouTube
 *   GitHub    : https://github.com/omatazmedia
 *   Contact   : Johnson Toluwani
 * ══════════════════════════════════════════════════════════
 */
`;

// Vite only prepends Rollup banners to JS chunks — this small plugin does the
// same for the emitted CSS asset (runs after Vite's own CSS generation).
function omatazCssBanner(banner: string): Plugin {
  return {
    name: 'omataz-css-banner',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.css') && typeof file.source === 'string') {
          file.source = banner + file.source;
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), omatazCssBanner(OMATAZ_BANNER)],
    build: {
      rollupOptions: {
        output: {
          // Credit comment at the top of every generated JS chunk.
          banner: OMATAZ_BANNER,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Forward API requests to the local dev backend (server.ts on :3001).
      // In production the same /backend/api/* paths are served by PHP directly.
      proxy: {
        '/backend/api': 'http://localhost:3001',
        '/uploads': 'http://localhost:3001',
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // src/data/** holds the mock server's JSON files (settings, analytics, ...)
      // which are never imported by the app — ignoring them prevents full-page
      // reloads every time the analytics heartbeat writes a visit row.
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/src/data/**'] },
    },
  };
});
