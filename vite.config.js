import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}']
      },
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'BetMates',
        short_name: 'BetMates',
        description: 'Best-odds comparison and social bet-sharing for football',
        theme_color: '#15120f',
        background_color: '#15120f',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  server: {
    fs: { strict: false },
    proxy: {
      '/api': {
        target: 'http://localhost:8888/.netlify/functions',
        rewrite: (path) => path.replace(/^\/api/, ''),
        changeOrigin: true
      }
    }
  }
})
