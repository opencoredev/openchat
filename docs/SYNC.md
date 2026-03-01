# Convex sync

This document tracks how chat data moves through the system after the migration from the bespoke `/sync` WebSocket hub to Convex. The legacy Elysia socket service no longer ships with the app; Convex now owns persistence and realtime behaviour for chats and messages.

## Data model
- `users` – mirrors the WorkOS session. Populated by `users.ensure` and indexed by `externalId` so every auth event can upsert quickly.
- `chats` – one row per user conversation. Indexed by `(userId, updatedAt)` to support dashboard ordering and bulk fetches.
- `messages` – user/assistant entries keyed by chat. Indexed by `(chatId, createdAt)` for timeline reads and `(chatId, clientMessageId)` so streaming upserts remain idempotent.

The schema lives in `apps/server/convex/schema.ts` and is generated into `@server/convex/_generated` for type-safe usage inside the Next.js app.

## Read path
1. **Session bootstrap** – all server requests call `ensureConvexUser` from `apps/web/src/lib/convex-server.ts`. This mutation either returns the existing Convex user id or inserts a new one with synced profile metadata.
2. **Dashboard layout** – `apps/web/src/app/dashboard/layout.tsx` loads the sidebar chats via `chats.list`, serialises them with `serializeChat`, and passes them to the client component.
3. **Chat pages** – `apps/web/src/app/dashboard/chat/[id]/page.tsx` fetches messages with `messages.list` and normalises them for the feed.

All reads use the `ConvexHttpClient`, which respects `CONVEX_URL`/`NEXT_PUBLIC_CONVEX_URL` so both server and browser requests point at the active deployment.

## Write path & streaming
1. **Chat creation / deletion** – `/api/chats` and `/api/chats/[id]` call the `chats.create` and `chats.remove` mutations. Both re-check ownership server-side before mutating state.
2. **Message send** – `/api/chat/send` forwards the user and assistant payloads to `messages.send`, which records the pair in a single mutation so sidebar ordering can update deterministically.
3. **Streaming updates** – the `createChatHandler` in `apps/web/src/app/api/chat/chat-handler.ts` streams OpenRouter responses. Each delta calls `messages.streamUpsert` with either a Convex `messageId` or a client-generated id, guaranteeing that retries and reconnects merge instead of duplicating rows. When the assistant finishes, the mutation patches the parent chat’s timestamps.
4. **Client transport** – on the browser we use `DefaultChatTransport` from the `ai` SDK. It listens to the SSE stream exposed by the handler and reflects persisted message ids back into the store so optimistic UI and Convex stay aligned.

## Realtime considerations
Convex watches give us live updates out of the box, but the current Next.js surface still relies on request/response patterns. When we adopt Convex subscriptions on the client, the existing mutations already emit consistent timestamps and ids, so the change will be additive: wire `convex/react` hooks in the chat room and sidebar, and rely on the same queries used for SSR.

## Operational notes
- `convex/http.ts` exposes `/health`, used for deployment readiness checks.
- `convex-rules.txt` documents the “new function syntax” expectations. Keep new work aligned so codegen remains stable across the monorepo.

## Open questions
- Should we surface Convex mutations to the browser for real-time optimistic updates, or continue routing through Next's API for policy enforcement?
