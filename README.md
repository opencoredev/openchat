<div align="center">
  <img src="https://raw.githubusercontent.com/opentech1/openchat/main/apps/web/public/logo.png" alt="OpenChat Logo" width="120" />

  <h1>OpenChat</h1>

  <p><strong>Open-source AI chat workspace you can self-host or run on OpenChat Cloud</strong></p>

  <p>
    <a href="https://github.com/opentech1/openchat/blob/main/LICENSE">
      <img src="https://img.shields.io/github/license/opentech1/openchat?style=flat-square&color=blue" alt="License" />
    </a>
    <a href="https://github.com/opentech1/openchat/stargazers">
      <img src="https://img.shields.io/github/stars/opentech1/openchat?style=flat-square&color=yellow" alt="Stars" />
    </a>
    <a href="https://github.com/opentech1/openchat/network/members">
      <img src="https://img.shields.io/github/forks/opentech1/openchat?style=flat-square&color=green" alt="Forks" />
    </a>
    <a href="https://github.com/opentech1/openchat/issues">
      <img src="https://img.shields.io/github/issues/opentech1/openchat?style=flat-square&color=red" alt="Issues" />
    </a>
    <a href="https://github.com/opentech1/openchat/pulls">
      <img src="https://img.shields.io/github/issues-pr/opentech1/openchat?style=flat-square&color=purple" alt="Pull Requests" />
    </a>
  </p>

  <p>
    <a href="#features">Features</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#deployment">Deployment</a> •
    <a href="#documentation">Docs</a> •
    <a href="#contributing">Contributing</a>
  </p>
</div>

---

## Overview

OpenChat is a modern, open-source AI chat platform that combines a streaming TanStack Start frontend with Convex for real-time persistence and live sync. It features Better Auth (GitHub OAuth), OpenRouter integration for 100+ AI models, and a beautiful Tailwind v4 + shadcn design system.

The monorepo is managed with Turborepo and Bun, keeping the web app, Convex functions, shared packages, and browser extension in lockstep.

## Features

<table>
  <tr>
    <td width="50%">
      <h3>🤖 Multi-Model AI Chat</h3>
      <ul>
        <li>100+ models via OpenRouter</li>
        <li>Streaming responses with live updates</li>
        <li>Per-user API key support</li>
        <li>Dynamic model pricing & cost tracking</li>
      </ul>
    </td>
    <td width="50%">
      <h3>⚡ Real-Time Sync</h3>
      <ul>
        <li>Convex-powered live data sync</li>
        <li>Optimistic UI updates</li>
        <li>Cross-device persistence</li>
        <li>Offline-ready architecture</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td>
      <h3>🔐 Secure Authentication</h3>
      <ul>
        <li>GitHub OAuth via Better Auth</li>
        <li>Automatic user sync to Convex</li>
        <li>Session-aware analytics</li>
        <li>Encrypted API key storage</li>
      </ul>
    </td>
    <td>
      <h3>🎨 Modern UI/UX</h3>
      <ul>
        <li>Tailwind CSS v4 + shadcn/ui</li>
        <li>Dark mode support</li>
        <li>Command palette navigation</li>
        <li>Responsive design</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td>
      <h3>🔍 Web Search</h3>
      <ul>
        <li>Built-in web search integration</li>
        <li>Valyu API powered</li>
        <li>Daily usage limits</li>
        <li>Search result citations</li>
      </ul>
    </td>
    <td>
      <h3>📦 Self-Hostable</h3>
      <ul>
        <li>Docker Compose ready</li>
        <li>Dokploy integration</li>
        <li>Vercel deployment</li>
        <li>Complete control of your data</li>
      </ul>
    </td>
  </tr>
</table>

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | TanStack Start (Vite), React 19, TypeScript, Tailwind CSS v4, shadcn/ui |
| **Backend** | Convex (real-time database), Better Auth |
| **AI** | OpenRouter (AI SDK 6), 100+ models |
| **Tooling** | Bun 1.3+, Turborepo, Vitest, Oxlint |
| **Analytics** | PostHog, Vercel Analytics |
| **DevOps** | Docker, GitHub Actions |

## Repository Structure

```
openchat/
├── apps/
│   ├── web/              # TanStack Start frontend
│   │   ├── src/routes/   # File-based routing
│   │   ├── src/components/
│   │   └── src/stores/   # Zustand state management
│   ├── server/           # Convex backend
│   │   └── convex/       # Database schema & functions
│   └── extension/        # Browser extension (WXT + React)
├── docs/                 # Documentation
│   └── deployment/       # Docker & Dokploy guides
├── docker/               # Dockerfile images
└── scripts/              # Operational scripts
```

## Quick Start

### Prerequisites

- **Bun** `>= 1.3.0`
- **Node.js** `>= 20` (for tooling)
- **Convex CLI** (auto-installed during dev)

### Installation

```bash
# Clone the repository
git clone https://github.com/opentech1/openchat.git
cd openchat

# Install dependencies
bun install
```

### Configuration

1. Copy environment templates:
   ```bash
   cp env.web.example apps/web/.env.local
   cp env.server.example apps/server/.env.local
   ```

2. Configure required variables:
   - `VITE_CONVEX_URL` - Convex deployment URL
   - `VITE_CONVEX_SITE_URL` - Convex HTTP actions URL
   - GitHub OAuth credentials (in Convex dashboard)
   - `BETTER_AUTH_SECRET` - Session secret

3. Optional variables:
   - `OPENROUTER_API_KEY` - Server API key for free tier
   - `VALYU_API_KEY` - Web search integration
   - `VITE_POSTHOG_KEY` - Analytics
   - `REDIS_URL` - Distributed rate limiting

### Development

```bash
# Start full development environment
bun dev

# Frontend on http://localhost:3001
# Convex backend runs automatically
```

### Common Commands

| Command | Description |
|---------|-------------|
| `bun dev` | Start full dev environment |
| `bun dev:web` | Frontend only |
| `bun dev:server` | Convex backend only |
| `bun check` | Lint with Oxlint |
| `bun check-types` | Type checking |
| `bun test` | Run test suite |
| `bun build` | Production build |

## Deployment

### Vercel (Recommended)

Deploy the frontend to Vercel with Convex Cloud for the backend:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/opentech1/openchat)

### Docker Compose

```bash
# Production deployment
docker compose up -d
```

See [`docs/deployment/`](docs/deployment/) for detailed Docker and Dokploy guides.

### Rate Limiting

**Single Instance (default):** In-memory rate limiting, no setup required.

**Multi-Instance:** Enable Redis for distributed rate limiting:

```bash
# Set Redis URL
export REDIS_URL=redis://localhost:6379

# Or with Docker
docker run -d -p 6379:6379 redis:alpine
```

## Documentation

| Document | Description |
|----------|-------------|
| [ENVIRONMENT.md](docs/ENVIRONMENT.md) | Environment variables guide |
| [deployment/](docs/deployment/) | Docker & Dokploy setup |
| [SYNC.md](docs/SYNC.md) | Real-time sync architecture |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community standards |

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=opencoredev/openchat&type=date&legend=top-left)](https://www.star-history.com/#opencoredev/openchat&type=date&legend=top-left)

## Sponsors

We're grateful to our sponsors who help make OpenChat possible:

<table>
  <tr>
    <td align="center" width="20%">
      <a href="https://convex.dev">
        <picture>
          <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/d80d057b-e651-49c3-a0eb-ee324274d549">
          <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/04dee790-d23a-4aed-93bb-5943e7f9cd5c">
          <img width="180" height="90" alt="Convex" src="https://github.com/user-attachments/assets/a7de908f-4226-44eb-a7c3-4fe7beb76897">
        </picture>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://greptile.com">
        <img width="180" height="90" alt="Greptile" src="https://github.com/user-attachments/assets/0dc5a5c7-2196-4270-b609-ea5a40f7e13e">
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://gitbook.com">
        <img width="180" height="90" alt="GitBook" src="https://github.com/user-attachments/assets/ef2d2c18-0b94-424c-af39-cd40e0238665">
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://sentry.io">
        <img width="180" height="90" alt="Sentry" src="https://github.com/user-attachments/assets/26266fa9-67a0-4256-9530-614f7ca4d2f5">
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://graphite.dev">
        <picture>
          <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/opentech1/openchat/main/apps/web/public/sponsors/graphite-black.png">
          <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/opentech1/openchat/main/apps/web/public/sponsors/graphite-white.png">
          <img width="120" height="120" alt="Graphite" src="https://raw.githubusercontent.com/opentech1/openchat/main/apps/web/public/sponsors/graphite-black.png">
        </picture>
      </a>
    </td>
  </tr>
</table>

<p align="center">
  <a href="https://github.com/sponsors/opentech1">
    <img src="https://img.shields.io/badge/Become%20a%20Sponsor-❤️-pink?style=for-the-badge" alt="Become a Sponsor" />
  </a>
</p>

## Contributors

Thanks to all the amazing people who have contributed to OpenChat!

<a href="https://github.com/opentech1/openchat/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=opentech1/openchat" alt="Contributors" />
</a>

### Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Use TypeScript with strict mode
- Follow the existing code style (Oxlint enforced)
- Write tests for new features
- Update documentation as needed
- Use conventional commits

## Community

- [GitHub Issues](https://github.com/opentech1/openchat/issues) - Bug reports & feature requests
- [GitHub Discussions](https://github.com/opentech1/openchat/discussions) - Questions & community chat
- [Discord](https://discord.gg/openchat) - Real-time community support

## Security

Found a security vulnerability? Please report it responsibly by emailing security@openchat.dev or through our [security policy](SECURITY.md).

## License

OpenChat is open-source software licensed under the [GNU Affero General Public License v3](LICENSE).

---

<div align="center">
  <p>
    <sub>Built with ❤️ by the OpenChat community</sub>
  </p>
  <p>
    <a href="https://github.com/opentech1/openchat">
      <img src="https://img.shields.io/badge/GitHub-Star%20Us-yellow?style=flat-square&logo=github" alt="Star on GitHub" />
    </a>
  </p>
</div>
