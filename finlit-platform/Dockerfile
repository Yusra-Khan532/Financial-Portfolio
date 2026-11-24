# AWS image: website + research API + site backend + job supervisor. Build from finlit-platform/.
FROM node:22-slim AS web
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

# Task #365: the news-sentiment model, exported once here to an int8 ONNX file (about 83 MB) so the server needs no PyTorch. The model revision is
# pinned in the script; this stage's tools never reach the final image.
FROM python:3.13-slim AS sentiment
ENV PIP_NO_CACHE_DIR=1
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.5.1 \
 && pip install numpy==2.5.4 "onnx==1.23.2" onnxruntime==1.20.1 transformers==4.46.3 tokenizers==0.20.3
COPY backend/scripts/export_sentiment_model.py /tmp/export_sentiment_model.py
# A failed export (the model host down, a network fault) must never stop a deploy: the image then ships without the model, the nightly
# news-sentiment job scores nothing (finlit/sentiment.py returns None) and the next build tries again.
RUN mkdir -p /models/sentiment && (python /tmp/export_sentiment_model.py /models/sentiment || (echo "sentiment model export failed; shipping without it" && rm -f /models/sentiment/*))

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
COPY --from=sentiment /models/sentiment ./models/sentiment
COPY deploy/start.sh deploy/scheduler.sh deploy/jobs.sh ./
RUN chmod +x start.sh scheduler.sh jobs.sh && useradd --create-home finlit && chown -R finlit /app
# task #326: the scores export folder; a new named volume mounted here takes this owner, so the job (user finlit) can write it
RUN mkdir -p /data/exports/scores && chown -R finlit /data/exports
USER finlit
ARG GIT_COMMIT=unknown
ENV FRONTEND_DIST=/app/web APP_VERSION=$GIT_COMMIT
EXPOSE 8000
CMD ["./start.sh"]
