import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'frontier-worker-bootstrap',
      apply: 'build',
      transformIndexHtml: () => [{
        tag: 'script',
        injectTo: 'head-prepend',
        children: `
          if ('serviceWorker' in navigator) {
            let recovered = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              const root = document.getElementById('root');
              if (!recovered && root && root.childElementCount === 0) {
                recovered = true;
                location.reload();
              }
            });
            navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
              .then(registration => registration.update())
              .catch(() => { /* The app also works without offline support. */ });
          }
        `,
      }],
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Optimize chunk size
    chunkSizeWarningLimit: 500,

    // Vendor chunks load through the normal module graph. Avoid redundant
    // preloads when the service worker satisfies immutable assets from cache.
    modulePreload: {
      resolveDependencies: (_filename, deps) => deps.filter((d) => !/vendor-/.test(d)),
    },

    rollupOptions: {
      output: {
        // Manual chunks for better caching
        manualChunks: {
          // Vendor chunks - these change rarely
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts', 'd3'],
          'vendor-state': ['zustand', '@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-utils': ['axios', 'date-fns', 'decimal.js'],
          'vendor-icons': ['lucide-react'],
        },

        // Asset file naming - organize by type
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico)$/i.test(name)) {
            return `assets/images/[name]-[hash][extname]`;
          }
          if (/\.(woff2?|eot|ttf|otf)$/i.test(name)) {
            return `assets/fonts/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },

        // Chunk file naming
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
      },
    },

    // Minification settings
    minify: 'esbuild',
    target: 'es2020',

    // CSS code splitting
    cssCodeSplit: true,
  },

  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'zustand',
      '@tanstack/react-query',
      'axios',
      'date-fns',
      'lucide-react',
    ],
  },

  server: {
    port: 5173,
    host: true,
    allowedHosts: ['host.docker.internal', 'localhost'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },

  // Preview server (for testing production builds)
  preview: {
    port: 4173,
  },
})
