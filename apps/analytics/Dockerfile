FROM python:3.12-slim AS base
WORKDIR /app

# ─── Install dependencies ────────────────────────────────
FROM base AS deps
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

# ─── Production ──────────────────────────────────────────
FROM base AS runner
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY src src

EXPOSE 8100
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8100"]
