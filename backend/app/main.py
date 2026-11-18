import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.db.backup import backup_loop
from app.db.session import init_db
from app.routers import auth, forum, games, profiles, rooms

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# httpx registra cada URL completa en nivel INFO, incluida la STEAM_API_KEY que viaja como parámetro.
logging.getLogger("httpx").setLevel(logging.WARNING)

settings = get_settings()
settings.check_production_ready()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db()  # aplica las migraciones pendientes
    backup_task = None
    if settings.backup_dir:
        backup_task = asyncio.create_task(backup_loop(settings.database_url, settings.backup_dir, settings.backup_keep))
    yield
    if backup_task is not None:
        backup_task.cancel()


app = FastAPI(
    title="Ruletazo API",
    description="Backend de la Ruleta de Juegos y Analizador de Biblioteca de Steam.",
    version="0.1.0",
    lifespan=lifespan,
)

# Los orígenes permitidos se definen en CORS_ORIGINS (backend/.env).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(games.router)
app.include_router(auth.router)
app.include_router(forum.router)
app.include_router(profiles.router)
app.include_router(rooms.router)


@app.get("/api/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


# En producción (Docker) el backend también sirve el frontend ya compilado: una sola URL para
# la página, la API y la vuelta del login de Steam. En desarrollo lo sirve Vite y esto no se monta.
# Las rutas del frontend van con hash (#/foro/...), así que alcanza con servir los archivos.
_frontend_dist = Path(settings.frontend_dist).resolve() if settings.frontend_dist else None
if _frontend_dist and (_frontend_dist / "index.html").is_file():
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
