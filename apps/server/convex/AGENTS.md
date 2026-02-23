# CONVEX KNOWLEDGE BASE

## OVERVIEW
`apps/server/convex` is the backend source of truth for schema, authz, streaming, message persistence, and migration-safe data operations.

## IMPORTANT RULES
- Follow Convex function/schema rules in `convex-rules.txt` and official docs (`https://docs.convex.dev/ai`).
- Do not use `.filter()` for common query paths when an index can be defined; prefer `.withIndex(...)`.
- Always include `args` and `returns` validators on Convex functions; use `returns: v.null()` when returning null/void.
- Use `internalQuery`/`internalMutation`/`internalAction` for private operations; keep sensitive logic off public API exports.
- Ensure all public functions enforce auth + ownership (`ctx.auth.getUserIdentity()` and row-level checks).
- Name indexes with all fields (`by_field1_and_field2`) and query fields in index order.
- Avoid large `.collect()` reads; use pagination/limits/indexed ranges.
- Await all async work in functions/actions; avoid fire-and-forget side effects.
- Validate return shapes for public functions so sensitive fields are never leaked accidentally.
- Batch related reads/writes in as few transactions as possible; avoid long chains of sequential `ctx.run*` calls from actions.
- Prefer helper modules for shared business logic and keep function handlers thin.
- Keep externally visible APIs stable; move sensitive orchestration into internal functions.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Schema/indexes | `apps/server/convex/schema.ts` | Table shape + index strategy |
| Auth config | `apps/server/convex/auth.config.ts` | Better Auth provider config |
| User sync/auth ops | `apps/server/convex/users.ts` | Public user APIs and helpers |
| Chat/message core | `apps/server/convex/chats.ts`, `apps/server/convex/messages.ts` | Ownership + persistence |
| Stream execution | `apps/server/convex/streamExecution.ts`, `apps/server/convex/backgroundStream.ts` | Async streaming pipeline |
| Query helpers | `apps/server/convex/message_queries.ts` | Read/query patterns |
| Migrations | `apps/server/convex/migrations.ts` | Idempotent production-safe migrations |

## CONVENTIONS
- Keep functions in the Convex new syntax and preserve explicit validators.
- Use helper modules in `apps/server/convex/lib/` for shared logic, keep handlers thin.
- Preserve idempotency for message/stream updates (client message IDs and resume-safe behavior).
- Prefer internal functions for cross-function orchestration and scheduled/internal work.
- Keep migration functions rerunnable and verification-first.
- Assume dev servers are already running; do not start `bun dev*` unless explicitly requested.

## ANTI-PATTERNS
- Do not add new features on deprecated message fields when `chainOfThoughtParts` is available.
- Do not expose internal billing, cleanup, or destructive ops as public functions.
- Do not add extra `v.any()` usage unless unavoidable and documented.
- Do not weaken ownership checks for chat/message/file access paths.
- Do not perform query patterns that force table scans in hot paths.

## COMMANDS
```bash
bun dev:server
bun run convex:codegen
bun run convex:migrate
bun run convex:verify
bun test:server
```
