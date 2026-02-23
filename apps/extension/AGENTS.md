# EXTENSION KNOWLEDGE BASE

## OVERVIEW
`apps/extension` is a WXT browser extension workspace with isolated entrypoints for background, content, and popup behavior.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| WXT config | `apps/extension/wxt.config.ts` | Extension framework/build config |
| Background worker | `apps/extension/entrypoints/background.ts` | Runtime/background behavior |
| Content script | `apps/extension/entrypoints/content.ts` | Injected page-side behavior |
| Popup UI | `apps/extension/entrypoints/popup/` | React popup interface |
| Static assets | `apps/extension/public/` | Icons/manifest assets |

## CONVENTIONS
- Follow WXT entrypoint model: keep logic inside `entrypoints/` by runtime surface.
- Keep popup UI concerns separate from background/content responsibilities.
- Use explicit messaging boundaries between extension surfaces when sharing data.
- Keep extension code self-contained; avoid accidental coupling to web app internals.
- Assume dev servers are already running; do not start `bun dev*` unless explicitly requested.

## ANTI-PATTERNS
- Do not treat extension build/runtime like the web workspace.
- Do not put background/content logic in popup-only files (or the inverse).
- Do not assume direct Convex backend access from all extension contexts.
- Do not hardcode environment-specific URLs without a config strategy.

## COMMANDS
```bash
bun dev:extension
bun build:extension
```
