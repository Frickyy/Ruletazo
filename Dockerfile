# Imagen única: compila el frontend y lo sirve el backend (una sola URL para la página,
# la API y la vuelta del login de Steam).
#   docker compose up --build
# Ver la sección "Docker" de DESARROLLO.md.

FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# URL pública (ej. https://ruletazo.app) para la vista previa al compartir el link.
ARG SITE_URL=""
ENV SITE_URL=${SITE_URL}
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ENVIRONMENT=production \
    FRONTEND_DIST=/app/frontend-dist \
    DATABASE_URL=sqlite:////data/steam_roulette.db

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /frontend/dist ./frontend-dist

# La base SQLite vive en un volumen para no perderla al recrear el contenedor.
RUN useradd --create-home app && mkdir /data && chown app /data
USER app
VOLUME /data
EXPOSE 8000

# --proxy-headers: detrás de un proxy con HTTPS, el login de Steam arma bien la URL de vuelta.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
