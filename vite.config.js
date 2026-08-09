import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The editor is the heaviest dependency and is only needed once a
        // thread is open. Splitting it keeps it out of the first paint and
        // lets it cache independently of app code.
        //
        // Matched by path rather than package name: @tiptap/pm exposes only
        // subpath exports, so naming it directly fails to resolve.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](@tiptap|prosemirror-|orderedmap|rope-sequence|w3c-keyname)/.test(id)) return 'editor';
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor';
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/auth': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: ["www.branddesk.in","branddesk-frontend-production.up.railway.app","internal.branddesk.in"]
  }
});