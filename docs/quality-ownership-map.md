# Quality Ownership Map

This map defines responsible owners and must-pass checklists for reliability-critical subsystems.

## Auth and Identity

- Scope: Better Auth session flow, Convex user sync, token handling.
- Primary owner: `@web-auth`.
- Backup owner: `@server-auth`.
- Checklist:
  - auth/session failures are surfaced in UI
  - no silent token-fetch failures
  - ownership checks enforced on user-scoped functions

## Streaming Runtime

- Scope: stream orchestration, resume flow, tool events, usage accounting.
- Primary owner: `@server-streaming`.
- Backup owner: `@web-chat`.
- Checklist:
  - stream start/fail/complete paths are persisted atomically
  - timeout/abort cleanup guaranteed in `finally`
  - retryable vs terminal errors are typed and logged

## Message Persistence

- Scope: send/edit/retry/fork message durability and idempotency.
- Primary owner: `@web-chat`.
- Backup owner: `@server-messages`.
- Checklist:
  - critical send mutations are awaited
  - no best-effort persistence in core send path
  - resume-safe message identity preserved

## Workflow APIs

- Scope: cleanup/export/delete-account/title workflows and signed endpoints.
- Primary owner: `@web-workflows`.
- Backup owner: `@server-workflows`.
- Checklist:
  - workflow tokens validated and timing-safe compared
  - env/config reads centralized and validated
  - structured logging includes request correlation fields

## Migration Reliability

- Scope: schema/data migrations and verification tooling.
- Primary owner: `@server-data`.
- Backup owner: `@infra-release`.
- Checklist:
  - migration idempotency verified
  - dry-run and verify modes available
  - machine-readable migration report archived

## CI Quality Gates

- Scope: policy enforcement, lint/type/build/test checks.
- Primary owner: `@infra-release`.
- Backup owner: `@repo-maintainers`.
- Checklist:
  - policy scripts fail build on violations
  - typecheck and build are mandatory pre-merge
  - complexity budgets enforced with explicit exception list only
