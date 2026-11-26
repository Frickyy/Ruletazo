# Ruletazo: desarrollo

Cómo correr, configurar y publicar el proyecto. Qué hace la página y cómo se usa está en el [README](README.md).

## Tecnologías

| Capa | Herramientas |
|---|---|
| Frontend | React 18, Vite, Axios, Vitest |
| Backend | Python 3.13, FastAPI, SQLAlchemy, Alembic, httpx |
| Datos | Steam Web API, Steam Store API, IGDB (duración) |
| Base de datos | SQLite |
| Tests | pytest, respx, Vitest |

## Arquitectura

```
┌──────────────┐   /api (proxy de Vite)   ┌──────────────────┐        ┌───────────────────┐
│  React + Vite│ ───────────────────────▶ │  FastAPI         │ ─────▶ │ Steam Web API     │
│  :5173       │                          │  :8000           │        │ Steam Store API   │
└──────────────┘                          │  caché SQLite    │        │ IGDB              │
                                          └──────────────────┘        └───────────────────┘
```

En desarrollo, Vite reenvía todas las rutas `/api` al backend, así frontend y API comparten el mismo origen y el login con Steam vuelve al mismo puerto. En Docker el backend sirve también el frontend compilado: una sola URL para todo.

Los pedidos a servicios externos pasan por un control de ritmo común (`services/throttle.py`): si Steam o IGDB avisan que nos pasamos, ese servicio se pausa unos minutos en lugar de seguir insistiendo. Además, los endpoints que consultan a Steam con la API key tienen un límite por visitante (`core/rate_limit.py`), para que nadie pueda gastar la cuota de la clave si la app se publica.

Los datos de la tienda vienen de `IStoreBrowseService/GetItems` (el mismo servicio que usa la tienda), que acepta 50 juegos por pedido y no necesita API key.

## Puesta en marcha (desarrollo)

### Requisitos

- Python 3.11 o superior
- Node.js 22.12 o superior (24 recomendado)
- Una [clave de la Steam Web API](https://steamcommunity.com/dev/apikey) (gratuita) para cargar bibliotecas reales. Sin ella la página anda con una biblioteca de ejemplo.

Para contribuir, mirá también [CONTRIBUTING.md](CONTRIBUTING.md).

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # En macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # En macOS/Linux: cp .env.example .env
```

Completá `backend/.env`:

| Variable | Para qué |
|---|---|
| `STEAM_API_KEY` | Tu clave de la Steam Web API. Sin ella la ruleta usa una biblioteca de ejemplo. |
| `SESSION_SECRET` | Firma la cookie de sesión. Generala con `python -c "import secrets; print(secrets.token_hex(32))"`. Si queda vacía, las sesiones se cierran al reiniciar. |
| `DATABASE_URL` | Por defecto `sqlite:///./steam_roulette.db`. |
| `FRONTEND_URL` | Adonde vuelve el login de Steam. En desarrollo, `http://localhost:5173`. |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma. |
| `ADMIN_STEAM_IDS` | SteamID64 de los moderadores del foro, separados por coma. |
| `ENVIRONMENT` | `development` o `production` (en producción `SESSION_SECRET` es obligatoria). |
| `CONTACT_EMAIL` | Mail de contacto de la política de privacidad y los términos (por defecto `ruletazo007@gmail.com`). |
| `FEEDBACK_EMAIL` | Adónde llegan los comentarios del botón "Mandar comentario" (por defecto `ruletazo007@gmail.com`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Cuenta que manda esos mails. Con Gmail: `smtp.gmail.com`, `587`, la cuenta y una [contraseña de aplicación](https://myaccount.google.com/apppasswords) (hace falta la verificación en dos pasos). Sin usuario y contraseña, los comentarios solo quedan en la tabla `feedback`. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Alternativa al SMTP por HTTPS con [Resend](https://resend.com), para servidores que bloquean los puertos de mail (DigitalOcean lo hace en cuentas nuevas). Si hay clave, tiene prioridad sobre el SMTP. `EMAIL_FROM` tiene que ser de un dominio verificado en Resend (en producción, `Ruletazo <feedback@ruletazo.app>`). |
| `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | Claves de una app registrada en la [consola de Twitch](https://dev.twitch.tv/console) (tipo de cliente *Confidencial*, redirección `http://localhost`; Twitch pide la verificación en dos pasos). Con ellas la duración sale de IGDB (ver *Duración*); sin ellas no se le pide nada. |
| `REVIEW_HIGHLIGHTS_ENABLED` | `false` (por defecto). "Lo bueno y lo malo" de las reseñas de Steam: está apagado porque Steam redirige ese pedido (`/appreviews`) a su portada desde noviembre de 2026. Prenderlo si vuelve a responder. |
| `SUPPORT_LINKS` | Links para apoyar el proyecto en el pie de página: `Cafecito|https://cafecito.app/usuario,Ko-fi|https://ko-fi.com/usuario`. |
| `SUPPORTER_STEAM_IDS` | SteamID64 de quienes apoyan el proyecto: muestran la insignia "Supporter" en su perfil y el foro. |
| `AFFILIATE_STORES` | Tiendas con link de afiliado en el foro de cada juego: `Humble|https://www.humblebundle.com/store/search?search={query}&partner=TU_ID`. |
| `BACKUP_DIR` | Carpeta para una copia diaria de la base (vacío = sin copias). `BACKUP_KEEP` dice cuántas conservar (7). |

Levantá la API:

```bash
uvicorn app.main:app --reload --port 8000
```

Al arrancar se aplican solas las migraciones pendientes de la base (Alembic); una base creada con una versión anterior se actualiza sin perder datos. La documentación interactiva queda en <http://localhost:8000/docs> (solo en desarrollo: en producción está apagada).

### 2. Frontend

```bash
cd frontend
npm install
copy .env.example .env          # En macOS/Linux: cp .env.example .env
npm run dev
```

Abrí <http://localhost:5173>.

### Atajo en Windows

Con las dependencias ya instaladas, `iniciar.bat` levanta el backend y el frontend en dos ventanas.

## Docker

```bash
docker compose up --build
```

Abrí <http://localhost:8000>. La imagen compila el frontend y lo sirve desde el backend; la base queda en el volumen `data`, con una copia de seguridad por día en `data/backups`. Usa las variables de `backend/.env` (necesita al menos `STEAM_API_KEY` y un `SESSION_SECRET` de 32 caracteres o más). Si la publicás en otro dominio, poné su URL en `FRONTEND_URL`. Esa misma URL se usa al compilar para la vista previa del link al compartirlo (imagen `frontend/public/og-image.png`, que se regenera desde `frontend/scripts/og-image.html`); sin Docker, compilá con `SITE_URL=https://tu-dominio npm run build`.

El puerto queda abierto solo en `127.0.0.1`: desde afuera se entra por un túnel de Cloudflare o un proxy con HTTPS.

### Producción (ruletazo.app)

- Corre con este mismo `docker compose`, detrás de un túnel de Cloudflare: el puerto del backend no queda abierto a internet.
- `backend/.env` con `ENVIRONMENT=production`, `FRONTEND_URL` y `CORS_ORIGINS` en `https://ruletazo.app`, y un `.env` en la raíz con `FRONTEND_URL=https://ruletazo.app` para compilar la vista previa.
- Todas las respuestas llevan encabezados de seguridad (`core/security_headers.py`): solo corre JavaScript del mismo dominio y la página no se puede meter en un iframe de otro sitio (salvo el modo streamer). En producción, además, el navegador entra siempre por HTTPS.
- Para actualizar a la última versión de `main`: `git pull && docker compose up -d --build` en la carpeta del proyecto.

## Tests

```bash
cd backend && pytest          # backend
cd frontend && npm test       # frontend (Vitest)
```

El CI (GitHub Actions) corre los dos, verifica que las migraciones coincidan con los modelos y que la imagen de Docker compile.

## Monetización

Pensada para no tocar la experiencia: **la plata nunca influye en qué juego sale en la ruleta** y no se venden datos.

- **Apoyo voluntario** (`SUPPORT_LINKS`): botones en el pie de página. Quien aporta puede recibir la insignia "Supporter" (`SUPPORTER_STEAM_IDS`, por ahora se carga a mano).
- **Links de afiliado** (`AFFILIATE_STORES`): en el foro de cada juego, "Buscar en otras tiendas", marcados como afiliados y con `rel="sponsored"`.
- Sin publicidad ni planes pagos por ahora.
- Los datos de Steam de una persona se piden solo cuando carga su perfil, y la página no da a entender ninguna relación con Valve. La duración de IGDB se muestra con un link a su ficha y la mención en el pie de página.

## Duración

Sale de [IGDB](https://www.igdb.com), la base de juegos de Twitch (`services/igdb_client.py`): se busca por appid de Steam, de a muchos juegos por pedido, y solo se le manda ese número. Los tiempos los cargan sus usuarios y en multijugador o sandbox hay valores absurdos, así que solo se usa un dato **creíble**: al menos 3 personas, entre 15 minutos y 150 horas, y con los tiempos rápido, normal y completo en orden (con un margen del 25 %, porque cada promedio sale de gente distinta). Se muestra el normal (la historia con algunos extras), con un link a la ficha de IGDB y la mención en el pie de página. La segunda pasada de cada biblioteca busca la duración de todos sus juegos de una (de a 200 por pedido) y guarda también el tiempo rápido: en un juego largo con multijugador competitivo, si el rápido falta o es casi igual al normal, el número son horas de online y no se muestra (`igdb_client.makes_sense`). Con las bibliotecas de noviembre de 2026, un tercio de los juegos sin jugar tenía un dato creíble (la mitad de los populares).

Si IGDB no tiene el dato, se usa el de quienes lo terminaron en Ruletazo: al marcar un juego como *Terminado* se guardan sus horas en Steam en ese momento, y la duración es la **mediana** de esas horas, que se muestra recién cuando lo terminaron al menos 3 personas (nunca por persona). Las horas de menos de 30 minutos no cuentan. El filtro y el orden por duración aparecen recién cuando al menos la mitad de los juegos tiene el dato (`durationFilterAvailable`).

Con esos datos también hay páginas para buscadores: `/cuanto-dura/<juego>` (una por juego popular con un dato creíble), el índice `/cuanto-dura/` y su sitemap (`/cuanto-dura/sitemap.xml`, anotado en `robots.txt`). Las arma el backend sin la app de React (`routers/duration_pages.py`). Qué juegos entran lo decide `services/duration_pages.py`: los más jugados y los más vendidos de la semana en Steam, más los populares que ya aparecieron en bibliotecas. En producción se actualiza solo una vez por día.

## Otras notas

- **El nombre**: la app se llama Ruletazo, sin "Steam", para no dar a entender una relación con Valve. Internamente se conservan algunos nombres viejos (la base `steam_roulette.db`, las claves `steamRoulette.*` del navegador) para no perder datos ni preferencias.
- **Privacidad y términos** (`/privacidad`, `/terminos`, en `frontend/src/pages/LegalPage.jsx`): si un cambio guarda datos nuevos o los usa de otra forma, hay que actualizarlos en el mismo pull request.

## Limitaciones conocidas

- **Juegos gratis que nunca abriste**: la Steam Web API solo devuelve los free-to-play que jugaste al menos una vez, así que los que agregaste y nunca abriste (por ejemplo *Wuthering Waves* o *The First Descendant*) no aparecen en la biblioteca. Alcanza con abrirlos una vez desde Steam para que aparezcan.
- **Duración**: IGDB tiene un dato creíble para pocos juegos chicos; esos juegos salen sin duración hasta que alguien la cargue en IGDB o lo terminen 3 personas en Ruletazo.
- **Lo bueno y lo malo de las reseñas**: Steam dejó de responder el pedido de reseñas (`/appreviews` redirige a su portada desde noviembre de 2026), así que está apagado (`REVIEW_HIGHLIGHTS_ENABLED`). El puntaje y el total de reseñas siguen viniendo de la tienda.
- **Contenido +18**: se detecta con los descriptores de contenido de la tienda. Hasta que un juego tiene esos datos, se usa una aproximación por el nombre.
- **Inglés**: las sinopsis de los juegos vienen de Steam en español, así que en inglés siguen en español.
- **Logros**: el filtro *Casi al 100%* necesita que tus logros sean públicos en Steam; si son privados, esos juegos cuentan como "sin logros".
- **Límite por visitante y rate limits**: viven en memoria, así que valen para un solo proceso del backend.

## Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/games/library` | Biblioteca completa (con la de la familia), con filtros y orden opcionales |
| `GET` | `/api/games/details` | Ficha completa del juego que frenó en el rodillo |
| `GET` | `/api/games/random` | Juego aleatorio según los filtros |
| `GET` | `/api/games/genres` | Géneros disponibles en la biblioteca |
| `GET` | `/api/games/library/classification-status` | Cuántos juegos tienen datos de la tienda |
| `POST` | `/api/games/library/classify` | Completa los datos de la tienda de un lote de juegos (de a 50 por pedido) |
| `POST` | `/api/games/library/enrich` | Busca en IGDB la duración de toda la biblioteca (la primera vez) y completa tu progreso de logros de un lote chico (si lo activaste en tu perfil) |
| `PUT` | `/api/games/state` | Marca un juego como jugando, terminado o abandonado (requiere sesión) |
| `GET` | `/api/games/states/summary` | Cuántos juegos hay en cada estado y cuántos se terminaron en el año |
| `GET` | `/api/games/achievements` | Progreso de logros de un juego |
| `POST` / `DELETE` | `/api/games/favorites` | Agrega o quita un favorito (requiere sesión) |
| `POST` / `DELETE` | `/api/games/hidden` | Oculta un juego de la ruleta o lo vuelve a mostrar (requiere sesión) |
| `GET` | `/api/auth/login` | Inicia sesión con Steam (OpenID) |
| `GET` | `/api/auth/me` | Usuario de la sesión actual (incluye si es moderador) |
| `POST` | `/api/auth/logout` | Cierra la sesión |
| `GET` | `/api/auth/profile` | Nombre y avatar de un perfil |
| `GET` | `/api/config` | Configuración pública (links de apoyo, afiliados, si hay duración) |
| `GET` | `/api/profiles/{steamid}` | Perfil de un usuario (los privados solo los ve su dueño) |
| `GET` | `/api/profiles/{steamid}/common` | Juegos en común con el dueño del perfil (requiere sesión) |
| `PUT` / `DELETE` | `/api/profiles/me` | Cambiar las preferencias del perfil / borrar todos tus datos |
| `GET` | `/api/forum/search` | Busca juegos en la tienda de Steam |
| `GET` | `/api/forum/recent` | Últimas reseñas y discusiones |
| `GET` | `/api/forum/games/{appid}` | Puntaje promedio y totales del foro de un juego |
| `GET` / `PUT` / `DELETE` | `/api/forum/games/{appid}/reviews` | Reseñas del juego; publicar o borrar la propia |
| `DELETE` | `/api/forum/reviews/{id}` | Borrar una reseña (la propia o, moderadores, cualquiera) |
| `GET` / `POST` | `/api/forum/games/{appid}/threads` | Discusiones del juego; abrir una nueva |
| `GET` / `PUT` / `DELETE` | `/api/forum/threads/{id}` | Una discusión con sus respuestas; editarla o borrarla |
| `POST` | `/api/forum/threads/{id}/posts` | Responder en una discusión |
| `PUT` / `DELETE` | `/api/forum/posts/{id}` | Editar o borrar una respuesta |
| `POST` | `/api/forum/reports` | Denunciar un mensaje |
| `GET` | `/api/forum/reports` | Denuncias pendientes (moderadores) |
| `DELETE` | `/api/forum/reports/{kind}/{id}` | Descartar las denuncias de un mensaje (moderadores) |

Leer el foro es público; publicar, denunciar y borrar requiere haber iniciado sesión con Steam.

## Estructura

```
backend/
  app/
    core/        configuración (.env) y sesión firmada
    db/          sesión de SQLAlchemy y migraciones al arrancar
    models/      tablas de caché, favoritos, ocultos y foro
    routers/     endpoints de juegos, autenticación y foro
    schemas/     modelos de respuesta
    services/    clientes de Steam, Store e IGDB, ritmo de pedidos, biblioteca y foro
  migrations/    migraciones de Alembic
  tests/
frontend/
  src/
    components/  rodillo, ficha del juego, historial y paneles
    pages/       Ruleta, Biblioteca y Foro
    services/    API, biblioteca compartida, filtros y color de portada
    __tests__/   tests de Vitest
Dockerfile, docker-compose.yml
```
