import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('firebase/app') || id.includes('firebase/auth')) {
            return 'firebase-core';
          }
          if (id.includes('firebase/firestore')) {
            return 'firebase-db';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor';
          }
          if (id.includes('lucide-react')) {
            return 'icons';
          }
        }
      }
    },
    chunkSizeWarningLimit: 600
  }
})
