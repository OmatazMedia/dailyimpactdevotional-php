import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
