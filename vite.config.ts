import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'iCloud Music Player',
        short_name: 'Music Player',
        description: 'iCloud Drive 음악 플레이어 - 오프라인 재생 지원',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/music_player/',
        start_url: '/music_player/',
        icons: [
          {
            src: '/music_player/icons.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ],
        categories: ['music', 'entertainment'],
        screenshots: [],
        shortcuts: [
          {
            name: '음악 재생',
            short_name: '재생',
            description: '마지막 재생 위치부터 음악 재생',
            url: '/music_player/',
            icons: [{ src: '/music_player/icons.svg', sizes: '96x96' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/youngtaek-Leem\.github\.io\/music_player\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'github-pages-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ],
  base: '/music_player/',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor';
            }
            if (id.includes('music-metadata') || id.includes('idb')) {
              return 'music';
            }
            return 'vendor';
          }
        }
      }
    }
  },
  server: {
    port: 3000,
    host: true
  }
})