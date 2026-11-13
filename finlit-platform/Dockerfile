# AWS image: website + research API + site backend + job supervisor. Build from finlit-platform/.
FROM node:25-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./
ARG GIT_COMMIT=unknown
# The type check (tsc) runs in CI on every change; the server only bundles. Running both in one process, on a small server, ran Node out of
# memory (exit code 134) and stopped every deploy since 12 Nov. The heap ceiling below is a limit, not a reservation.
RUN NODE_OPTIONS=--max-old-space-size=2048 VITE_BASE=/ APP_VERSION=$GIT_COMMIT npx vite build
# Source maps stay on the build machine: they carry the unminified code and its comments (task #79: the Stress Lab engine was readable through them).
RUN find dist -name '*.map' -delete && ! find dist -name '*.map' | grep -q .

FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
# Two separate Python environments: the research API and the site backend pin different framework versions.
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY site-api/backend/requirements.txt /tmp/site-requirements.txt
RUN python -m venv /opt/site-venv && /opt/site-venv/bin/pip install -r /tmp/site-requirements.txt
COPY backend/finlit ./finlit
COPY backend/finlit_technicals ./finlit_technicals
COPY backend/scripts ./scripts
COPY backend/tests/fixtures ./tests/fixtures
COPY site-api/backend ./site-api/backend
COPY --from=web /web/dist ./web
COPY deploy/start.sh deploy/scheduler.sh ./
RUN chmod +x start.sh scheduler.sh && useradd --create-home finlit && chown -R finlit /app
USER finlit
ARG GIT_COMMIT=unknown
ENV FRONTEND_DIST=/app/web APP_VERSION=$GIT_COMMIT
EXPOSE 8000
CMD ["./start.sh"]
