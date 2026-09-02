import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/alphaveil/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'og.png', 'showcase/*.webp'],
      manifest: {
        name: 'Alphaveil',
        short_name: 'Alphaveil',
        description: 'Remove backgrounds, crop and upscale images with AI, 100% in your browser.',
        start_url: '/alphaveil/',
        scope: '/alphaveil/',
        display: 'standalone',
        background_color: '#151310',
        theme_color: '#151310',
        lang: 'en',
        categories: ['photo', 'productivity', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,wasm,woff2}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        navigateFallback: '/alphaveil/index.html',
        navigateFallbackDenylist: [/^\/alphaveil\/(og\.png|robots\.txt|sitemap\.xml)$/],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  build: {
    target: 'esnext',
  },
  worker: {
    format: 'es',
  },
})
