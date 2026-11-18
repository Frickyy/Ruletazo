import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.db.session import init_db
from app.routers import auth, games

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# httpx registra cada URL completa en nivel INFO, incluida la STEAM_API_KEY que viaja como parámetro.
logging.getLogger("httpx").setLevel(logging.WARNING)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db()  # crea las tablas de caché si todavía no existen
    yield


app = FastAPI(
    title="Steam Roulette API",
    description="Backend de la Ruleta de Juegos y Analizador de Biblioteca de Steam.",
    version="0.1.0",
    lifespan=lifespan,
)

# Los orígenes permitidos se definen en CORS_ORIGINS (backend/.env).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(games.router)
app.include_router(auth.router)


@app.get("/api/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
