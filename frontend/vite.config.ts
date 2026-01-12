import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 443,
    https: {
      key: fs.readFileSync('localhost.key'),
      cert: fs.readFileSync('localhost.crt')
    },
    // ADD THIS PROXY:
    proxy: {
      '/ws': {
        target: 'ws://10.10.1.243:3001',
        ws: true,
        changeOrigin: true
      },
      '^/(health|api)': {
        target: 'http://10.10.1.243:3001',
        changeOrigin: true
      }
    }
  }
})