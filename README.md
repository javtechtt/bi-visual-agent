# BI Visual Agent

Enterprise AI Business Intelligence Platform — multi-agent analytics, visualization, and executive advisory.

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9 (`npm install -g pnpm`)
- **Python** >= 3.10 (for analytics service)
- **Docker** + Docker Compose (for Postgres, Redis, and production builds)

## Quick Start (Local Development)

```bash
# 1. Clone and install
git clone <repo-url> && cd bi-visual-agent
pnpm install

# 2. Start infrastructure
docker compose up -d postgres redis

# 3. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, and any API keys

# 4. Run database migrations
pnpm db:migrate

# 5. Start all services
pnpm dev
```

Services will be available at:

| Service   | URL                    |
|-----------|------------------------|
| Frontend  | http://localhost:3000   |
| API       | http://localhost:4000   |
| Analytics | http://localhost:8100   |

### Starting services individually

```bash
pnpm dev:web        # Next.js frontend
pnpm dev:api        # Node.js API (requires DATABASE_URL, JWT_SECRET)
pnpm dev:worker     # BullMQ workers (requires REDIS_URL, DATABASE_URL)
pnpm dev:analytics  # Python FastAPI (requires pip deps installed)
```

### Python analytics service setup

```bash
cd apps/analytics
pip install -e ".[dev]"      # Install with dev dependencies
uvicorn src.main:app --reload --port 8100
```

## Build

```bash
pnpm build          # Build all TypeScript packages and apps
pnpm typecheck      # Type-check all packages without emitting
pnpm lint           # Lint all packages
```

## Docker (Full Stack)

```bash
cp .env.example .env         # Configure environment
docker compose up --build    # Build and start all services
```

## Project Structure

```
apps/
  web/         Next.js 15 frontend (Tailwind, shadcn patterns)
  api/         Express API + agent orchestration (Drizzle ORM)
  worker/      BullMQ job processors
  analytics/   Python FastAPI (Polars, DuckDB, SciPy)

packages/
  schemas/     Zod schema contracts (shared across all TS services)
  types/       TypeScript types inferred from schemas
  prompts/     Agent system prompts and templates
  agent-tools/ Typed tool definitions per agent
  ui/          Shared React components
```

## Key Commands

| Command              | Description                          |
|----------------------|--------------------------------------|
| `pnpm dev`           | Start all services via Turbo         |
| `pnpm build`         | Build all packages and apps          |
| `pnpm typecheck`     | Type-check everything                |
| `pnpm db:generate`   | Generate Drizzle migrations          |
| `pnpm db:migrate`    | Run database migrations              |
| `pnpm db:studio`     | Open Drizzle Studio                  |
| `docker compose up`  | Start full stack in Docker           |
