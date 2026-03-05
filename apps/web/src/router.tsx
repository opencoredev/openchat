import * as Sentry from '@sentry/tanstackstart-react'
import { createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

const DEFAULT_SENTRY_TUNNEL = '/api/monitoring'
const DEFAULT_TRACES_SAMPLE_RATE = 0.1

function readClientDsn(): string | undefined {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
  return dsn && dsn.length > 0 ? dsn : undefined
}

function readClientSendDefaultPii(): boolean {
  return import.meta.env.VITE_SENTRY_SEND_DEFAULT_PII === 'true'
}

function readClientTracesSampleRate(): number {
  const raw = import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE
  if (!raw) return DEFAULT_TRACES_SAMPLE_RATE

  const parsed = Number.parseFloat(raw)
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed
  }

  return DEFAULT_TRACES_SAMPLE_RATE
}

// Create a new router instance
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 30000,
    defaultPendingMs: 150,
    defaultPendingMinMs: 200,
  })

  const dsn = readClientDsn()

  if (!router.isServer && dsn && !Sentry.getClient()) {
    Sentry.init({
      dsn,
      tunnel: import.meta.env.VITE_SENTRY_TUNNEL || DEFAULT_SENTRY_TUNNEL,
      sendDefaultPii: readClientSendDefaultPii(),
      enabled: import.meta.env.MODE !== 'test',
      environment:
        import.meta.env.VITE_SENTRY_ENVIRONMENT ||
        (import.meta.env.PROD ? 'production' : import.meta.env.MODE),
      integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
      tracesSampleRate: readClientTracesSampleRate(),
    })
  }

  return router
}
