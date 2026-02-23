# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-23T16:51:02-05:00
**Commit:** 3e6fb1f
**Branch:** main

## OVERVIEW
OpenChat is a Turborepo + Bun monorepo with a TanStack Start web app, a Convex backend, and a WXT browser extension.
Core product path is Better Auth session -> Convex user sync -> streamed AI chat with OpenRouter.

## STRUCTURE
```text
openchat/
|- apps/web/              # TanStack Start + file-based routes + server functions
|- apps/server/convex/    # Convex schema, queries, mutations, actions, crons
|- apps/extension/        # WXT extension entrypoints (background/content/popup)
|- docs-site/             # Mintlify docs subtree (external repo)
|- scripts/               # Bun TypeScript ops/deploy/verification scripts
|- convex-rules.txt       # Convex function and schema rules reference
`- AGENTS.md              # Root policy; children add scoped overrides
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Web routing and pages | `apps/web/src/routes/` | TanStack Router file-based routes |
| Auth/session flow | `apps/web/src/lib/auth-client.tsx` | Better Auth client and stable session pattern |
| Provider bootstrapping | `apps/web/src/providers/index.tsx` | Includes critical Convex user sync |
| Convex schema and indexes | `apps/server/convex/schema.ts` | Source of truth for tables/indexes |
| Chat/message backend logic | `apps/server/convex/messages.ts` | Streaming + persistence behaviors |
| Convex migrations | `apps/server/convex/migrations.ts` | Idempotent, production-safe migration patterns |
| Extension entrypoints | `apps/extension/entrypoints/` | WXT background/content/popup |
| Ops and deploy scripts | `scripts/` | `dev.ts`, `deploy.ts`, `prod-canary.ts` |

## CODE MAP
| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `Route` | route export | `apps/web/src/routes/__root.tsx` | Root app shell + auth/session gate |
| `createRouter` | function | `apps/web/src/router.tsx` | Router factory for route tree |
| `Providers` | component | `apps/web/src/providers/index.tsx` | Auth/Convex/query/theme provider composition |
| `schema` default export | schema | `apps/server/convex/schema.ts` | Convex tables/indexes |
| `insertOrUpdateMessage` | function | `apps/server/convex/message_helpers.ts` | Message upsert and idempotency logic |
| `http` router | HTTP router | `apps/server/convex/http.ts` | Convex HTTP action endpoints |

## CONVENTIONS
- Package manager/runtime is Bun (`bun`, `bunx`) across local and CI workflows.
- Linting is Oxlint (`bun check`), not ESLint.
- Web is TanStack Start on Vite (not Next.js); client env vars must use `VITE_`.
- Convex backend code lives under `apps/server/convex/`; keep function registration style consistent.
- Tests are Vitest; colocated `*.test.ts(x)` and `__tests__/` are both used.
- Assume dev servers are already running; do not start `bun dev*` unless explicitly requested.
- Prefer build/typecheck/test verification when runtime validation is needed.

## ANTI-PATTERNS (THIS PROJECT)
- Do not use `NEXT_PUBLIC_*` env vars in web code.
- Do not treat `docs-site/` like a regular workspace; it is a git subtree.
- Do not introduce new logic against deprecated message fields when `chainOfThoughtParts` exists.
- Do not add sensitive server operations as public Convex functions when internal variants are correct.
- Do not commit secrets (`OPENROUTER_API_KEY`, `VALYU_API_KEY`, local env files).

## CONVEX RULES
- Follow `convex-rules.txt` for function syntax, validators, schema/index conventions, and call patterns.
- All public Convex functions require argument validation and auth/ownership checks.
- Prefer `internalQuery`/`internalMutation`/`internalAction` for sensitive/private workflows.
- Prefer indexed queries (`withIndex`) over broad `.filter()` scans in hot paths.
- Keep message/stream mutations idempotent; preserve resume-safe semantics.
- Use explicit return validators (`returns`), including `v.null()` when returning null/void.

## UNIQUE STYLES
- Better Auth identity is synced to Convex user docs (`users.ensure`) before most app operations.
- Stream/message flows are designed for idempotency around message IDs and resume behavior.
- Root policy is compact; deeper operational rules live in child files:
  - `apps/web/AGENTS.md`
  - `apps/server/convex/AGENTS.md`
  - `apps/extension/AGENTS.md`

## COMMANDS
```bash
bun install
bun dev
bun dev:web
bun dev:server
bun dev:extension
bun build
bun check
bun check-types
bun test
bun run convex:migrate
bun run verify:prod
```

## NOTES
- `docs-site/` sync commands:
  - `git subtree pull --prefix=docs-site https://github.com/tryosschat/docs.git main --squash`
  - `git subtree push --prefix=docs-site https://github.com/tryosschat/docs.git main`
- `docs-site/` is external Mintlify docs; `docs/` contains internal deployment docs.
- `bunfig.toml` isolates Bun's own test discovery; use Vitest commands for project tests.
