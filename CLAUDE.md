# BI Visual Agent

Enterprise AI Business Intelligence Platform — multi-agent system for data analysis, visualization, and executive advisory.

## Architecture

```
apps/
  web/        → Next.js frontend (port 3000)
  api/        → Express API + agent orchestration (port 4000)
  worker/     → BullMQ job processors
  analytics/  → Python FastAPI analytics service (port 8100)

packages/
  schemas/      → Zod schema contracts (shared between all TS services)
  types/        → TypeScript types inferred from schemas
  prompts/      → Agent system prompts and templates
  agent-tools/  → Tool definitions for each agent
  ui/           → Shared React components (shadcn-based)
```

## Agent System

- **Orchestrator**: Routes queries to specialized agents, decomposes complex tasks
- **Data Agent**: File parsing, data profiling, semantic modeling, queries
- **Analytics Agent**: KPI computation, trend detection, anomaly detection, forecasting
- **Advisory Agent**: Executive summaries, strategic recommendations, risk assessment

All inter-agent communication uses structured JSON contracts defined in `@bi/schemas`.

## Development

```bash
pnpm install           # Install all dependencies
pnpm dev               # Start all services (via Turbo)
pnpm dev:web           # Start frontend only
pnpm dev:api           # Start API only
pnpm dev:analytics     # Start Python service

# Database
pnpm db:generate       # Generate Drizzle migrations
pnpm db:migrate        # Run migrations
pnpm db:studio         # Open Drizzle Studio

# Docker
docker compose up -d   # Start infrastructure (Postgres + Redis)
pnpm docker:build      # Build all Docker images
```

## Key Conventions

- All schemas live in `@bi/schemas` — never define ad-hoc Zod schemas in app code
- Types are inferred from schemas via `z.infer<typeof Schema>` in `@bi/types`
- Agent prompts are centralized in `@bi/prompts` — never hardcode prompts in agent code
- Tool definitions in `@bi/agent-tools` are the source of truth for agent capabilities
- API responses always use the `ApiResponseSchema` envelope
- All agents return confidence scores on their outputs
- Heavy computation is delegated from Node.js to the Python analytics service
