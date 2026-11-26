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
    # Carpeta para copias de seguridad diarias de la base SQLite (vacío = sin copias) y cuántas conservar.
    backup_dir: str = ""
    backup_keep: int = 7
    # IGDB (la base de juegos de Twitch) para la duración: Client ID y secreto de una app registrada
    # en https://dev.twitch.tv/console. Sin los dos no se le pide nada a IGDB ni se muestra su dato.
    igdb_client_id: str = ""
    igdb_client_secret: str = ""
    # Monetización (todo opcional; vacío = no se muestra):
    # links para apoyar el proyecto, "Nombre|URL" separados por coma (ej. "Cafecito|https://cafecito.app/x").
    support_links: str = ""
    # SteamID64 de quienes apoyan el proyecto (insignia en el perfil y el foro), separados por coma.
    supporter_steam_ids: str = ""
    # Tiendas con link de afiliado para el foro de cada juego: "Nombre|URL con {query}" separados por coma.
    # {query} se reemplaza por el nombre del juego (ej. "Humble|https://www.humblebundle.com/store/search?search={query}&partner=TU_ID").
    affiliate_stores: str = ""
    # Mail de contacto que se muestra en la política de privacidad y los términos.
    contact_email: str = "ruletazo007@gmail.com"
    # Formulario de feedback: los comentarios se mandan a FEEDBACK_EMAIL por SMTP. Con Gmail,
    # SMTP_USER es la cuenta y SMTP_PASSWORD una "contraseña de aplicación" (no la contraseña
    # normal). Sin SMTP_USER/SMTP_PASSWORD los comentarios solo se guardan en la base.
    feedback_email: str = "ruletazo007@gmail.com"
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    # Alternativa al SMTP: la API de Resend, que va por HTTPS (sirve en servidores que bloquean
    # los puertos de mail, como DigitalOcean). Si RESEND_API_KEY está, se usa en vez del SMTP.
    # EMAIL_FROM tiene que ser de un dominio verificado en Resend.
    resend_api_key: str = ""
    email_from: str = "Ruletazo <feedback@ruletazo.app>"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS_ORIGINS admite varios orígenes separados por coma."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def has_steam_api_key(self) -> bool:
        return bool(self.steam_api_key)

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_user and self.smtp_password and self.feedback_email)

    @property
    def resend_configured(self) -> bool:
        return bool(self.resend_api_key and self.email_from and self.feedback_email)

    @property
    def igdb_configured(self) -> bool:
        return bool(self.igdb_client_id and self.igdb_client_secret)

    @property
    def is_production(self) -> bool:
        return self.environment.strip().casefold() == "production"

    @property
    def supporter_steam_id_set(self) -> set[str]:
        return {steam_id.strip() for steam_id in self.supporter_steam_ids.split(",") if steam_id.strip()}

    @property
    def support_link_list(self) -> list[dict]:
        return _named_urls(self.support_links)

    @property
    def affiliate_store_list(self) -> list[dict]:
        return [store for store in _named_urls(self.affiliate_stores) if "{query}" in store["url"]]

    @property
    def admin_steam_id_set(self) -> set[str]:
        return {steam_id.strip() for steam_id in self.admin_steam_ids.split(",") if steam_id.strip()}

    def check_production_ready(self) -> None:
        """En producción no se arranca sin SESSION_SECRET: con una clave al azar por proceso,
        cada reinicio (o cada worker) invalidaría todas las sesiones."""
        if self.is_production and len(self.session_secret) < 32:
            raise RuntimeError("En producción SESSION_SECRET es obligatoria (al menos 32 caracteres).")


def _named_urls(value: str) -> list[dict]:
    """ "Nombre|https://..." separados por coma → [{"name", "url"}]. Solo URLs https."""
    result = []
    for item in value.split(","):
        name, _, url = item.partition("|")
        if name.strip() and url.strip().startswith("https://"):
            result.append({"name": name.strip(), "url": url.strip()})
    return result


@lru_cache
def get_settings() -> Settings:
    """Devuelve siempre la misma instancia de Settings (el .env se lee una sola vez)."""
    return Settings()
