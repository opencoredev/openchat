import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getAuthUser, isSameOrigin } from '@/lib/server-auth'
import { authRatelimit } from '@/lib/upstash'

const MAX_ENVELOPE_BYTES = 512 * 1024
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6_REGEX = /^[0-9a-fA-F:]+$/
const FINGERPRINT_HEADERS = [
  'user-agent',
  'accept-language',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
]

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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function getFingerprintSource(request: Request): string {
  return FINGERPRINT_HEADERS.map((header) => {
    const value = request.headers.get(header)?.trim() ?? ''
    return `${header}:${value}`
  }).join('|')
}

function getRateLimitIdentifier(
  request: Request,
  userId: string | null,
): Promise<string> | string {
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

  return sha256Hex(getFingerprintSource(request)).then(
    (fingerprint) => `fingerprint:${fingerprint}`,
  )
}

function validateEnvelopeDsn(body: Uint8Array, expectedDsn: string): boolean {
  const [headerLine] = new TextDecoder()
    .decode(body.subarray(0, MAX_ENVELOPE_BYTES))
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

async function readRequestBodyWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!request.body) {
    return new Uint8Array()
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel('Payload too large')
        return null
      }

      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0

  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return body
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
          const identifier = await getRateLimitIdentifier(
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

        const body = await readRequestBodyWithinLimit(
          request,
          MAX_ENVELOPE_BYTES,
        )
        if (!body) {
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
