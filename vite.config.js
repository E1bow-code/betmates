import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // React and supabase-js are both needed before anything renders, so
        // splitting them out doesn't cut what a first-time visitor downloads
        // - it cuts what a returning one re-downloads. They're ~2/3 of the
        // entry chunk and change only when a dependency is upgraded, but
        // sharing a chunk with app code meant every deploy rehashed the lot
        // and invalidated it. Separate chunks keep them cached across the
        // frequent deploys where only app code moved.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          // posthog-js is eagerly imported by ~8 startup files (AuthContext,
          // RouteTitle, ErrorBoundary...) so it lands in the entry chunk. Same
          // rationale as react/supabase above: it's a chunky vendor lib that
          // changes only on upgrade, so splitting it keeps it cached across the
          // frequent app-only deploys instead of rehashing with app code every
          // time. (Deferring it off first paint entirely is a bigger change -
          // it needs the analytics calls gated behind consent - tracked as a
          // follow-up, not done here.)
          'vendor-posthog': ['posthog-js']
        }
      }
    }
  },
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
        id: '/',
        name: 'BetMates',
        short_name: 'BetMates',
        description: 'Compare odds and settle scores with your mates - leaderboards, streaks, and shared bet slips.',
        theme_color: '#f6f5f1',
        background_color: '#f6f5f1',
        display: 'standalone',
        start_url: '/',
        categories: ['sports', 'social', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        screenshots: [
          {
            src: '/screenshots/mobile-home.png',
            sizes: '1080x2400',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Home feed with streaks and rank'
          },
          {
            src: '/screenshots/desktop-home.png',
            sizes: '2400x1350',
            type: 'image/png',
            form_factor: 'wide',
            label: 'BetMates on desktop'
          }
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
