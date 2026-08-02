import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

export default defineConfig({
  // Relative assets allow the same build to run at a GitHub Pages project subpath.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Forge — Character Progression',
        short_name: 'Forge',
        description: 'Local-first personal development system',
        theme_color: '#151814',
        background_color: '#10120f',
        display: 'standalone',
        start_url: './#/',
        scope: './',
        icons: [
          { src: './icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: { navigateFallback: 'index.html', globPatterns: ['**/*.{js,css,html,svg}'] },
    }),
  ],
  test: { environment: 'jsdom', setupFiles: ['./src/tests/setup.ts'] },
});
