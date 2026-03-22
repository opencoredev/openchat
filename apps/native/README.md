# OpenChat — Native (Expo)

Mobile app for [OpenChat](https://osschat.dev) built with [Expo](https://expo.dev) and [expo-router](https://expo.github.io/router/). Targets full feature parity with the web app, optimised for native mobile UX.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Expo ~53 (React Native 0.79) |
| Router | expo-router v4 (file-based) |
| Backend | Convex (same deployment as the web app) |
| Auth | Better Auth + Convex integration |
| Secure storage | expo-secure-store |
| Markdown | react-native-markdown-display |
| Syntax highlight | react-native-syntax-highlighter (hljs) |
| Model cache | @react-native-async-storage/async-storage |
| Push notifications | expo-notifications + Expo Push API |
| File uploads | expo-document-picker + expo-image-picker |
| CI/CD | EAS Build (eas.json) |

## Getting started

```bash
bun install
cd apps/native
cp .env.example .env
# Fill in EXPO_PUBLIC_CONVEX_URL and EXPO_PUBLIC_AUTH_BASE_URL
bun dev
```

Or from the repo root: `bun dev:native`

## EAS Build

```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# One-time project setup
eas init

# Development client build (for testing with expo-dev-client)
bun build:ios      # eas build --platform ios
bun build:android  # eas build --platform android

# Submit to stores
bun submit:ios
bun submit:android
```

Before submitting, fill in the placeholder values in `eas.json`:
- `appleId` — your Apple ID
- `ascAppId` — App Store Connect app ID
- `appleTeamId` — your Apple Developer team ID
- `google-services-key.json` — Google Play service account key
- `extra.eas.projectId` in `app.json` — from `eas init`

## Environment variables

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_CONVEX_URL` | Convex WebSocket endpoint (= `VITE_CONVEX_URL` in web) |
| `EXPO_PUBLIC_AUTH_BASE_URL` | Better Auth base URL (= `VITE_CONVEX_SITE_URL` in web) |

## Auth flow

1. User taps **Continue with GitHub** on the auth screen.
2. `expo-web-browser` opens the Better Auth GitHub OAuth URL with the app deep-link as `redirect_uri`.
3. After OAuth, Better Auth redirects to `openchat://auth/callback?token=<session_token>`.
4. The app intercepts the link, calls `/api/auth/get-session` to hydrate user profile, stores the session to SecureStore.
5. `ConvexAuthProvider` exchanges the session token for a short-lived Convex JWT via `/api/auth/convex/token` on every Convex request.
6. `useConvexUser` calls `api.users.ensure` to create/update the user record in Convex.
7. `usePushTokenSync` saves the Expo push token to `api.users.savePushToken` once authenticated.

## Push notifications

The `usePushTokenSync` hook saves the device push token to the Convex `users` table.
The Convex backend can then use the Expo Push API to send targeted notifications when a stream completes.

A corresponding `savePushToken` mutation must be added to `apps/server/convex/userAuth.ts` (see TODO below).

## Feature parity with web app

| Web route | Mobile screen | Status |
|-----------|--------------|--------|
| `/` (chat list) | `(tabs)/index.tsx` | ✅ |
| `/c/$chatId` | `chat/[id].tsx` | ✅ |
| `/settings` | `(tabs)/settings.tsx` | ✅ |
| `/settings` → Providers / BYOK | `settings/byok.tsx` | ✅ |
| `/settings` → Account | `settings/account.tsx` | ✅ |
| `/share/$shareId` | `share/[shareId].tsx` | ✅ |
| `/privacy` | `legal/privacy.tsx` | ✅ |
| `/terms` | `legal/terms.tsx` | ✅ |
| Model picker | `new.tsx` | ✅ |
| Auth / sign-in | `auth.tsx` | ✅ |

## TODO

- [ ] Add `savePushToken` mutation to `apps/server/convex/userAuth.ts`
- [ ] Chat export (JSON / Markdown) — share sheet integration
- [ ] Web search toggle in input bar
- [ ] Reasoning effort selector in model picker
- [ ] Multi-modal image previews in message bubbles
- [ ] Dark/light theme preference (currently always dark)
