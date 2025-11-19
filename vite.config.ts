import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['swagger-ui-react', 'react-window'],
  },
  build: {
    commonjsOptions: {
      include: [/swagger-ui-react/, /react-window/, /node_modules/],
      transformMixedEsModules: true,
    },
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'syntax-highlighter': ['react-syntax-highlighter'],
          'mermaid': ['mermaid'],
          'markdown': ['react-markdown', 'remark-gfm', 'rehype-sanitize'],
          'supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});
