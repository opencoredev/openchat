import * as Sentry from '@sentry/tanstackstart-react'
import { createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

const DEFAULT_SENTRY_TUNNEL = '/api/monitoring'
const DEFAULT_TRACES_SAMPLE_RATE = 0.1
const NUMERIC_RATE_REGEX = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/
const DEFAULT_LOG_LEVELS = ['warn', 'error'] as const

function readClientDsn(): string | undefined {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
  return dsn && dsn.length > 0 ? dsn : undefined
}

function readClientEnableLogs(): boolean {
  return import.meta.env.VITE_SENTRY_ENABLE_LOGS !== 'false'
}

function readClientSendDefaultPii(): boolean {
  return import.meta.env.VITE_SENTRY_SEND_DEFAULT_PII === 'true'
}

function readClientTracesSampleRate(): number {
  const raw = import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE
  if (!raw) return DEFAULT_TRACES_SAMPLE_RATE

  if (!NUMERIC_RATE_REGEX.test(raw)) {
    return DEFAULT_TRACES_SAMPLE_RATE
  }

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
    const enableLogs = readClientEnableLogs()
    const integrations = [
      Sentry.tanstackRouterBrowserTracingIntegration(router),
    ]

    if (enableLogs) {
      integrations.push(
        Sentry.consoleLoggingIntegration({ levels: [...DEFAULT_LOG_LEVELS] }),
      )
    }

    Sentry.init({
      dsn,
      tunnel: import.meta.env.VITE_SENTRY_TUNNEL || DEFAULT_SENTRY_TUNNEL,
      enableLogs,
      sendDefaultPii: readClientSendDefaultPii(),
      enabled: import.meta.env.MODE !== 'test',
      environment:
        import.meta.env.VITE_SENTRY_ENVIRONMENT ||
        (import.meta.env.PROD ? 'production' : import.meta.env.MODE),
      integrations,
      tracesSampleRate: readClientTracesSampleRate(),
    })
  }

  return router
}
