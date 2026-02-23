# WEB KNOWLEDGE BASE

## OVERVIEW
`apps/web` is a TanStack Start app (Vite + TanStack Router) that owns UI, routing, auth client integration, and web-side server functions.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Route shells/pages | `apps/web/src/routes/` | File-based routing, root route in `__root.tsx` |
| Provider wiring | `apps/web/src/providers/index.tsx` | Includes critical user sync to Convex |
| Auth/session | `apps/web/src/lib/auth-client.tsx` | Stable auth/session pattern |
| Server route handlers | `apps/web/src/routes/api/` | TanStack Start server functions |
| State management | `apps/web/src/stores/` | Zustand stores for model/provider/ui/stream |
| Chat UX logic | `apps/web/src/hooks/` | Send/edit/retry/fork/stream hooks |

## CONVENTIONS
- TanStack Start + Vite, not Next.js; use `VITE_` for client env vars.
- Keep route logic under `src/routes/` and share reusable code under `src/lib/` or `src/hooks/`.
- Preserve auth flow: Better Auth user -> Convex user via `users.ensure` before app actions.
- Keep UI/state patterns consistent with existing Zustand stores and component structure.
- Testing uses Vitest + Testing Library; tests are mostly in colocated `__tests__/` directories.
- Assume dev servers are already running; do not start `bun dev*` unless explicitly requested.

## ANTI-PATTERNS
- Do not use `NEXT_PUBLIC_*` variables in web code.
- Do not bypass `Providers` or remove `UserSyncProvider`; it breaks `convexUserId` dependent flows.
- Do not move route files out of `src/routes/` or manually wire route trees.
- Do not add direct backend logic to UI components when an API/server function already exists.
- Do not duplicate store responsibilities across multiple stores without a clear boundary.

## COMMANDS
```bash
bun dev:web
bun build:web
bun test:web
bun check-types --filter web
bun check --filter web
```
