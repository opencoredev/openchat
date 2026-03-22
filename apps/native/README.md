# OpenChat — Native (Expo)

Mobile app for [OpenChat](https://osschat.dev) built with [Expo](https://expo.dev) and [expo-router](https://expo.github.io/router/).

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Expo (React Native) |
| Router | expo-router v4 (file-based) |
| Backend | Convex (same deployment as the web app) |
| Auth | Better Auth + Convex integration |
| Secure storage | expo-secure-store |

## Getting started

```bash
# From the repo root
bun install
cd apps/native
cp .env.example .env
# Fill in EXPO_PUBLIC_CONVEX_URL and EXPO_PUBLIC_AUTH_BASE_URL
bun dev          # or: npx expo start
```

Or from the repo root:

```bash
bun dev:native
```

## Environment variables

See `.env.example`. Both variables point at your Convex deployment:

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_CONVEX_URL` | WebSocket endpoint for the Convex client (same as `VITE_CONVEX_URL` in the web app) |
| `EXPO_PUBLIC_AUTH_BASE_URL` | HTTP base URL for Better Auth endpoints (same as `VITE_CONVEX_SITE_URL` in the web app) |

## Auth flow

1. User taps **Sign in with GitHub** on the auth screen.
2. `expo-web-browser` opens the Better Auth GitHub OAuth URL, passing the app's deep-link URI as `redirect_uri`.
3. After OAuth completes, Better Auth redirects to `openchat://auth/callback?token=<session_token>`.
4. The app intercepts the deep link, stores the session token in SecureStore, and redirects to the home screen.
5. `ConvexAuthProvider` calls `fetchConvexToken` on every Convex request, exchanging the session token for a short-lived Convex JWT via `{AUTH_BASE_URL}/api/auth/convex/token`.

## Project structure

```
apps/native/
├── app/                  # expo-router screens (file-based routing)
│   ├── _layout.tsx       # Root layout — initialises auth, wraps in ConvexAuthProvider
│   ├── auth.tsx          # Sign-in screen (GitHub OAuth)
│   ├── +not-found.tsx
│   └── (tabs)/
│       ├── _layout.tsx   # Tab bar (redirects to /auth if unauthenticated)
│       ├── index.tsx     # Chat list screen (real-time via Convex)
│       └── settings.tsx  # Settings / sign-out
├── lib/
│   ├── convex.ts         # Singleton ConvexReactClient
│   └── auth.ts           # SecureStore helpers + fetchConvexToken
├── providers/
│   └── ConvexAuthProvider.tsx  # ConvexProviderWithAuth bridge
├── stores/
│   └── auth.ts           # Zustand auth state store
├── app.json
├── babel.config.js
├── package.json
└── tsconfig.json
```

## TODO / next steps

- [ ] Add individual chat screen (`app/chat/[id].tsx`) with streaming message rendering
- [ ] Add new-chat screen (`app/chat/new.tsx`) with model selector
- [ ] Wire up OpenRouter BYOK settings in the settings screen
- [ ] Add push notifications for background stream completion
- [ ] EAS Build configuration for TestFlight / Play Store
