import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor',
              debugName: 'vendor dependency splitting',
              test: /node_modules[\\/]/,
              minSize: 50 * 1024,
              maxSize: 400 * 1024,
              minShareCount: 1,
            },
          ],
        },
      },
    },
  }
})
