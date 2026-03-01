# Release Readiness Checklist

Complete this checklist before merging to `main`.

## Mandatory Gates

- [ ] `bun run check:runtime-policies`
- [ ] `bun run check:complexity`
- [ ] `bun run check`
- [ ] `bun run check-types`
- [ ] `bun run build:web`
- [ ] `bunx vitest run`

## Contract and Safety

- [ ] Convex migration verify run: `bun run convex:verify`
- [ ] Migration report produced (if migration touched):
      `bun ./scripts/run-migrations.ts --verify-only --report <report-path>.json`
- [ ] No production `as any` or `as unknown as` introduced.
- [ ] No empty catch/swallowed catch introduced.

## Critical Smoke Paths

- [ ] Auth sign-in and session sync succeed.
- [ ] Chat send persists user + assistant messages.
- [ ] Stream resume after refresh works.
- [ ] Workflow endpoints validate auth/token and return safe errors.

## Evidence to Attach in PR

- [ ] command outputs for all gates
- [ ] migration verification output (if applicable)
- [ ] note any explicit complexity exceptions with rationale
