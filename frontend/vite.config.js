import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
// The dev server proxies /api to the FastAPI backend so the frontend can call
// same-origin relative URLs in both development and production.
//
// Two entry points: the research app (index.html) and the separate end-user
// Explorer app (explorer.html). They share build tooling and the low-level
// utilities, but have independent component trees and HTML pages.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        explorer: resolve(__dirname, 'explorer.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    // Leaflet needs a real layout engine; the map is verified in a browser, not
    // here. Everything else in src/ is fair game.
    exclude: ['node_modules/**', 'dist/**', '.venv/**'],
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
