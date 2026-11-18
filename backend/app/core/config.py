from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración de la app, cargada desde variables de entorno / archivo `.env`."""

    steam_api_key: str = ""
    database_url: str = "sqlite:///./steam_roulette.db"
    cors_origins: str = "http://localhost:5173"
    frontend_url: str = "http://localhost:5173"
    # Clave para firmar la cookie de sesión. Si queda vacía se genera una al azar en cada arranque
    # (las sesiones se pierden al reiniciar el backend). Ver core/security.py.
    session_secret: str = ""
    # "development" (por defecto) o "production". En producción SESSION_SECRET es obligatoria.
    environment: str = "development"
    # SteamID64 de los moderadores del foro, separados por coma: pueden borrar cualquier mensaje y ver denuncias.
    admin_steam_ids: str = ""
    # Carpeta con el frontend compilado (`npm run build`). Si existe, el backend lo sirve en "/".
    frontend_dist: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS_ORIGINS admite varios orígenes separados por coma."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def has_steam_api_key(self) -> bool:
        return bool(self.steam_api_key)

    @property
    def is_production(self) -> bool:
        return self.environment.strip().casefold() == "production"

    @property
    def admin_steam_id_set(self) -> set[str]:
        return {steam_id.strip() for steam_id in self.admin_steam_ids.split(",") if steam_id.strip()}

    def check_production_ready(self) -> None:
        """En producción no se arranca sin SESSION_SECRET: con una clave al azar por proceso,
        cada reinicio (o cada worker) invalidaría todas las sesiones."""
        if self.is_production and len(self.session_secret) < 32:
            raise RuntimeError("En producción SESSION_SECRET es obligatoria (al menos 32 caracteres).")


@lru_cache
def get_settings() -> Settings:
    """Devuelve siempre la misma instancia de Settings (el .env se lee una sola vez)."""
    return Settings()
