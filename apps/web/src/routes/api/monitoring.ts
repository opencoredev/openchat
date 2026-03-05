import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getAuthUser, isSameOrigin } from '@/lib/server-auth'
import { authRatelimit } from '@/lib/upstash'

const MAX_ENVELOPE_BYTES = 512 * 1024
const MAX_ENVELOPE_HEADER_BYTES = 2048
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6_REGEX = /^[0-9a-fA-F:]+$/

function readSentryDsn(): string | null {
  const dsn =
    process.env.SENTRY_DSN?.trim() || process.env.VITE_SENTRY_DSN?.trim()
  return dsn || null
}

function normalizeDsn(dsn: string): string {
  const parsed = new URL(dsn)
  const path = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.protocol}//${parsed.username}@${parsed.host}${path}`
}

function isValidIpFormat(ip: string): boolean {
  return IPV4_REGEX.test(ip) || IPV6_REGEX.test(ip)
}

function getRateLimitIdentifier(
  request: Request,
  userId: string | null,
): string {
  if (userId) {
    return `user:${userId}`
  }

  const candidates = [
    request.headers.get('cf-connecting-ip')?.trim(),
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim(),
    request.headers.get('x-real-ip')?.trim(),
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
  ]

  for (const candidate of candidates) {
    if (candidate && isValidIpFormat(candidate)) {
      return `ip:${candidate}`
    }
  }

  return 'anonymous'
}

function validateEnvelopeDsn(body: Uint8Array, expectedDsn: string): boolean {
  const [headerLine] = new TextDecoder()
    .decode(body.subarray(0, MAX_ENVELOPE_HEADER_BYTES))
    .split('\n')
  if (!headerLine) return false

  try {
    const envelopeHeader = JSON.parse(headerLine) as { dsn?: string }
    if (!envelopeHeader.dsn) return false
    return normalizeDsn(envelopeHeader.dsn) === normalizeDsn(expectedDsn)
  } catch {
    return false
  }
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
        if (!isSameOrigin(request)) {
          return json({ error: 'Invalid origin' }, { status: 403 })
        }

        const contentLengthHeader = request.headers.get('content-length')
        if (contentLengthHeader) {
          const contentLength = Number.parseInt(contentLengthHeader, 10)
          if (
            Number.isFinite(contentLength) &&
            contentLength > MAX_ENVELOPE_BYTES
          ) {
            return json({ error: 'Payload too large' }, { status: 413 })
          }
        }

        const authUser = await getAuthUser(request)
        if (authRatelimit) {
          const identifier = getRateLimitIdentifier(
            request,
            authUser?.id ?? null,
          )
          const rate = await authRatelimit.limit(`sentry-tunnel:${identifier}`)
          if (!rate.success) {
            const retryAfterSeconds = Math.max(
              1,
              Math.ceil((rate.reset - Date.now()) / 1000),
            )
            return json(
              {
                error:
                  'Too many monitoring requests. Please try again shortly.',
              },
              {
                status: 429,
                headers: { 'Retry-After': String(retryAfterSeconds) },
              },
            )
          }
        }

        const expectedDsn = readSentryDsn()
        if (!expectedDsn) {
          return json({ error: 'Sentry tunnel misconfigured' }, { status: 503 })
        }

        const body = new Uint8Array(await request.arrayBuffer())
        if (body.byteLength > MAX_ENVELOPE_BYTES) {
          return json({ error: 'Payload too large' }, { status: 413 })
        }

        if (!validateEnvelopeDsn(body, expectedDsn)) {
          return json({ error: 'Invalid Sentry envelope' }, { status: 403 })
        }

        let endpoint: string
        try {
          endpoint = getSentryEnvelopeEndpoint(expectedDsn)
        } catch (error) {
          console.error('[Sentry Tunnel] Invalid DSN configuration', error)
          return json({ error: 'Sentry tunnel misconfigured' }, { status: 500 })
        }

        try {
          const upstreamResponse = await fetch(endpoint, {
            method: 'POST',
            headers: createProxyHeaders(request),
            body,
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
