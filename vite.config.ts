import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'favicon-32x32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'TeamKode',
        short_name: 'TeamKode',
        description: '팀 협업 워크스페이스 — 메신저·티켓·간트·체크리스트',
        lang: 'ko',
        theme_color: '#b7004f',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Supabase/MCP 호출은 항상 네트워크 — 캐시 금지(로그인·실시간 데이터 정확성)
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin.includes('supabase.co') || url.origin.includes('onrender.com'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
})
