from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración de la app, cargada desde variables de entorno / archivo `.env`."""

    steam_api_key: str = ""
    database_url: str = "sqlite:///./steam_roulette.db"
    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS_ORIGINS admite varios orígenes separados por coma."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def has_steam_api_key(self) -> bool:
        return bool(self.steam_api_key)


@lru_cache
def get_settings() -> Settings:
    """Devuelve siempre la misma instancia de Settings (el .env se lee una sola vez)."""
    return Settings()
