import * as Sentry from '@sentry/tanstackstart-react'

const DEFAULT_SENTRY_DSN =
  'https://55642b0aa02b402d9bd330b8831dfbf7@o4510196637499392.ingest.us.sentry.io/4510993969709056'
const DEFAULT_SENTRY_TUNNEL = '/api/monitoring'
const DEFAULT_TRACES_SAMPLE_RATE = 0.1

function readRaw(key: string): string | undefined {
  const value = process.env[key]
  if (!value) return undefined

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readTracesSampleRate(): number {
  const raw =
    readRaw('SENTRY_TRACES_SAMPLE_RATE') ??
    readRaw('VITE_SENTRY_TRACES_SAMPLE_RATE')
  if (!raw) return DEFAULT_TRACES_SAMPLE_RATE

  const parsed = Number.parseFloat(raw)
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed
  }

  return DEFAULT_TRACES_SAMPLE_RATE
}

export function initServerSentry() {
  if (Sentry.getClient()) {
    return Sentry.getClient()
  }

  return Sentry.init({
    dsn:
      readRaw('SENTRY_DSN') ?? readRaw('VITE_SENTRY_DSN') ?? DEFAULT_SENTRY_DSN,
    tunnel:
      readRaw('SENTRY_TUNNEL') ??
      readRaw('VITE_SENTRY_TUNNEL') ??
      DEFAULT_SENTRY_TUNNEL,
    sendDefaultPii: true,
    enabled: (readRaw('NODE_ENV') ?? 'development') !== 'test',
    environment:
      readRaw('SENTRY_ENVIRONMENT') ??
      readRaw('VERCEL_ENV') ??
      readRaw('NODE_ENV') ??
      'development',
    tracesSampleRate: readTracesSampleRate(),
  })
}
