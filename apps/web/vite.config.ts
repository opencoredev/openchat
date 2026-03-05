import { defineConfig } from 'vite'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  server: {
    port: parseInt(process.env.PORT ?? '3000'),
    host: '127.0.0.1',
  },
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    sentryTanstackStart({
      org: 'osschat',
      project: 'tanstack-web',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
    }),
    nitro({ preset: process.env.VERCEL ? 'vercel' : 'bun' }),
    viteReact(),
  ],
})

export default config
