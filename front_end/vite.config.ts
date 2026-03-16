import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const port = Number(process.env.VITE_DEV_SERVER_PORT || 5173)
const host = process.env.VITE_DEV_SERVER_HOST || '0.0.0.0'
const publicUrl = process.env.VITE_DEV_SERVER_PUBLIC_URL

const serverConfig: Record<string, any> = {
  host,
  port,
  strictPort: true,
  cors: true,
}

if (publicUrl) {
  serverConfig.origin = publicUrl
  try {
    const parsed = new URL(publicUrl)
    serverConfig.hmr = {
      protocol: parsed.protocol === 'https:' ? 'wss' : 'ws',
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : undefined,
    }
  } catch (error) {
    console.warn('[vite.config] Ignoring invalid VITE_DEV_SERVER_PUBLIC_URL:', publicUrl)
  }
}

export default defineConfig({
  plugins: [react()],
  server: serverConfig,
})
