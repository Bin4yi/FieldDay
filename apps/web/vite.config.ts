import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'pwa/icon-180.png'],
      manifest: {
        name: 'FieldDay',
        short_name: 'FieldDay',
        description: 'Say any game. Play it outside. The phone is the referee.',
        theme_color: '#0B1C3D',
        background_color: '#0B1C3D',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'pwa/icon-48.png', sizes: '48x48', type: 'image/png' },
          { src: 'pwa/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs to work with no signal.
        globPatterns: ['**/*.{js,css,html,ico,png,webp,woff2,svg}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: { host: true },
});
