import * as Sentry from '@sentry/tanstackstart-react'

export const DEFAULT_SENTRY_TUNNEL = '/api/monitoring'
const DEFAULT_TRACES_SAMPLE_RATE = 0.1

function readRaw(key) {
  const value = process.env[key]
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readTracesSampleRate() {
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

function readBoolean(key) {
  return readRaw(key)?.toLowerCase() === 'true'
}

function readServerDsn() {
  return readRaw('SENTRY_DSN') ?? readRaw('VITE_SENTRY_DSN')
}

export function getServerSentryOptions() {
  const dsn = readServerDsn()
  if (!dsn) {
    return undefined
  }

  return {
    dsn,
    tunnel:
      readRaw('SENTRY_TUNNEL') ??
      readRaw('VITE_SENTRY_TUNNEL') ??
      DEFAULT_SENTRY_TUNNEL,
    sendDefaultPii: readBoolean('SENTRY_SEND_DEFAULT_PII'),
    enabled: (readRaw('NODE_ENV') ?? 'development') !== 'test',
    environment:
      readRaw('SENTRY_ENVIRONMENT') ??
      readRaw('VERCEL_ENV') ??
      readRaw('NODE_ENV') ??
      'development',
    tracesSampleRate: readTracesSampleRate(),
  }
}

export function initServerSentry() {
  if (Sentry.getClient()) {
    return Sentry.getClient()
  }

  const options = getServerSentryOptions()
  if (!options) {
    return undefined
  }

  return Sentry.init(options)
}
