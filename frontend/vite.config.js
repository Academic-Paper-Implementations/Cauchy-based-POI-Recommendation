import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// The dev server proxies /api to the FastAPI backend so the frontend can call
// same-origin relative URLs in both development and production. The single entry
// point is index.html, which mounts the Explorer app (src/explorer/main.jsx).
export default defineConfig({
  plugins: [react()],
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
