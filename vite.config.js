import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  server: {
    port: 5173
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        learn: resolve(__dirname, 'learn.html'),
        fraud: resolve(__dirname, 'fraud.html'),
        profile: resolve(__dirname, 'profile.html'),
        services: resolve(__dirname, 'services.html'),
      }
    }
  }
})
