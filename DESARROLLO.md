# Ruletazo: desarrollo

Cómo correr, configurar y publicar el proyecto. Qué hace la página y cómo se usa está en el [README](README.md).

## Tecnologías

| Capa | Herramientas |
|---|---|
| Frontend | React 18, Vite, Axios, Vitest |
| Backend | Python 3.13, FastAPI, SQLAlchemy, Alembic, httpx |
| Datos | Steam Web API, Steam Store API, HowLongToBeat |
| Base de datos | SQLite |
| Tests | pytest, respx, Vitest |

## Arquitectura

```
┌──────────────┐   /api (proxy de Vite)   ┌──────────────────┐        ┌───────────────────┐
│  React + Vite│ ───────────────────────▶ │  FastAPI         │ ─────▶ │ Steam Web API     │
│  :5173       │                          │  :8000           │        │ Steam Store API   │
└──────────────┘                          │  caché SQLite    │        │ HowLongToBeat     │
                                          └──────────────────┘        └───────────────────┘
```

En desarrollo, Vite reenvía todas las rutas `/api` al backend, así frontend y API comparten el mismo origen y el login con Steam vuelve al mismo puerto. En Docker el backend sirve también el frontend compilado: una sola URL para todo.

Los pedidos a servicios externos pasan por un control de ritmo común (`services/throttle.py`): si Steam o HowLongToBeat avisan que nos pasamos, ese servicio se pausa unos minutos en lugar de seguir insistiendo. Además, los endpoints que consultan a Steam con la API key tienen un límite por visitante (`core/rate_limit.py`), para que nadie pueda gastar la cuota de la clave si la app se publica.

Los datos de la tienda vienen de `IStoreBrowseService/GetItems` (el mismo servicio que usa la tienda), que acepta 50 juegos por pedido y no necesita API key.

## Puesta en marcha (desarrollo)

### Requisitos

- Python 3.11 o superior
- Node.js 18 o superior
- Una [clave de la Steam Web API](https://steamcommunity.com/dev/apikey) (gratuita)

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
| `HLTB_ENABLED` | `false` (por defecto). Prenderlo solo con permiso por escrito de Ziff Davis (ver *Riesgos antes de monetizar*). |
| `SUPPORT_LINKS` | Links para apoyar el proyecto en el pie de página: `Cafecito|https://cafecito.app/usuario,Ko-fi|https://ko-fi.com/usuario`. |
| `SUPPORTER_STEAM_IDS` | SteamID64 de quienes apoyan el proyecto: muestran la insignia "Supporter" en su perfil y el foro. |
| `AFFILIATE_STORES` | Tiendas con link de afiliado en el foro de cada juego: `Humble|https://www.humblebundle.com/store/search?search={query}&partner=TU_ID`. |
| `BACKUP_DIR` | Carpeta para una copia diaria de la base (vacío = sin copias). `BACKUP_KEEP` dice cuántas conservar (7). |

Levantá la API:

```bash
uvicorn app.main:app --reload --port 8000
```

Al arrancar se aplican solas las migraciones pendientes de la base (Alembic); una base creada con una versión anterior se actualiza sin perder datos. La documentación interactiva queda en <http://localhost:8000/docs>.

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

- Servidor: DigitalOcean (SFO3), Ubuntu 24.04, código en `/opt/ruletazo` (clonado con una deploy key de solo lectura).
- `backend/.env` con `ENVIRONMENT=production`, `FRONTEND_URL` y `CORS_ORIGINS` en `https://ruletazo.app`, y un `.env` en la raíz con `FRONTEND_URL=https://ruletazo.app` para compilar la vista previa.
- `cloudflared` corre como servicio (`/etc/cloudflared/config.yml`) y manda `ruletazo.app` y `www.ruletazo.app` a `http://127.0.0.1:8000`.
- Actualizar a la última versión de `main`:

  ```bash
  ssh root@IP_DEL_SERVIDOR   # ruletazo.app apunta a Cloudflare, no al servidor
  cd /opt/ruletazo && git pull && docker compose up -d --build
  ```

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

### Riesgos antes de monetizar
- **Steam Web API**: sus términos (de 2010) licencian los datos para el "uso personal" de los usuarios, prohíben dar a entender una relación con Valve y piden una política de privacidad, informar qué datos se guardan y consultar datos de un usuario solo cuando él lo pide. Varios endpoints que usa la app (biblioteca, tienda) no figuran en la documentación oficial. Lo más prudente es **pedir permiso por escrito a Valve** (webapi@valvesoftware.com) antes de monetizar, y no ofrecer planes pagos que den acceso a datos de Steam.
- **HowLongToBeat**: los términos de uso de Ziff Davis, su dueña, prohíben usar robots o programas para extraer datos del sitio y mostrarlos en otro programa, con o sin fines comerciales. Por eso viene **apagado** (`HLTB_ENABLED=false`) y solo debería prenderse con permiso por escrito.

### Duración
Cuando alguien marca un juego como *Terminado*, se guardan sus horas en Steam en ese momento. La duración de cada juego es la **mediana** de esas horas y se muestra recién cuando lo terminaron al menos 3 personas (nunca por persona). Las horas de menos de 30 minutos no cuentan. Al principio casi ningún juego tiene duración, así que el filtro por duración aparece recién cuando hay datos.
- **El nombre**: la app se llama Ruletazo, sin "Steam", para no dar a entender una relación con Valve. Internamente se conservan algunos nombres viejos (la base `steam_roulette.db`, las claves `steamRoulette.*` del navegador) para no perder datos ni preferencias.
- La política de privacidad y los términos (`#/privacidad`, `#/terminos`) son un **borrador**: revisalos con alguien con conocimiento legal de tu país y completá el país del servidor (`DATA_LOCATION` en `frontend/src/pages/LegalPage.jsx`).

## Limitaciones conocidas

- **Juegos gratis que nunca abriste**: la Steam Web API solo devuelve los free-to-play que jugaste al menos una vez, así que los que agregaste y nunca abriste (por ejemplo *Wuthering Waves* o *The First Descendant*) no aparecen en la biblioteca. Alcanza con abrirlos una vez desde Steam para que aparezcan.
- **HowLongToBeat** (apagado por defecto) no tiene una API oficial: si se prende, se busca por nombre y, si el sitio cambia, la duración puede faltar.
- **Reseñas**: Steam limita los pedidos de reseñas; si se pasa, se reintenta más tarde y mientras tanto la ficha sale sin "lo bueno y lo malo".
- **Contenido +18**: se detecta con los descriptores de contenido de la tienda. Hasta que un juego tiene esos datos, se usa una aproximación por el nombre.
- **Inglés**: las sinopsis de los juegos y las frases de reseñas vienen de Steam en español, así que en inglés esas partes siguen en español.
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
| `POST` | `/api/games/library/enrich` | Completa duración (HLTB) y progreso de logros de un lote chico |
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
    services/    clientes de Steam, Store y HowLongToBeat, ritmo de pedidos, biblioteca y foro
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
