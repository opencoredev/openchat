import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

const DEFAULT_SENTRY_DSN =
  'https://55642b0aa02b402d9bd330b8831dfbf7@o4510196637499392.ingest.us.sentry.io/4510993969709056'

function readSentryDsn(): string {
  const dsn =
    process.env.SENTRY_DSN?.trim() || process.env.VITE_SENTRY_DSN?.trim()
  return dsn || DEFAULT_SENTRY_DSN
}

function getSentryEnvelopeEndpoint(dsn: string): string {
  const parsedDsn = new URL(dsn)
  const projectId = parsedDsn.pathname.replace(/^\/+/, '')

  if (!parsedDsn.username || !projectId) {
    throw new Error('Invalid Sentry DSN')
  }

  return `${parsedDsn.protocol}//${parsedDsn.host}/api/${projectId}/envelope/`
}

function createProxyHeaders(request: Request): Headers {
  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  const contentEncoding = request.headers.get('content-encoding')

  if (contentType) headers.set('content-type', contentType)
  if (contentEncoding) headers.set('content-encoding', contentEncoding)

  return headers
}

function createResponseHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers()
  const contentType = upstreamHeaders.get('content-type')
  const retryAfter = upstreamHeaders.get('retry-after')
  const sentryRateLimits =
    upstreamHeaders.get('x-sentry-rate-limits') ??
    upstreamHeaders.get('sentry-rate-limits')

  if (contentType) headers.set('content-type', contentType)
  if (retryAfter) headers.set('retry-after', retryAfter)
  if (sentryRateLimits) headers.set('x-sentry-rate-limits', sentryRateLimits)

  return headers
}

export const Route = createFileRoute('/api/monitoring')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let endpoint: string
        try {
          endpoint = getSentryEnvelopeEndpoint(readSentryDsn())
        } catch (error) {
          console.error('[Sentry Tunnel] Invalid DSN configuration', error)
          return json({ error: 'Sentry tunnel misconfigured' }, { status: 500 })
        }

        try {
          const upstreamResponse = await fetch(endpoint, {
            method: 'POST',
            headers: createProxyHeaders(request),
            body: await request.arrayBuffer(),
          })

          return new Response(upstreamResponse.body, {
            status: upstreamResponse.status,
            headers: createResponseHeaders(upstreamResponse.headers),
          })
        } catch (error) {
          console.error('[Sentry Tunnel] Failed to proxy envelope', error)
          return json({ error: 'Sentry tunnel unavailable' }, { status: 502 })
        }
      },
    },
  },
})
