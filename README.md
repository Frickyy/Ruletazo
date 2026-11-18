# Steam Roulette

**¿No sabés qué jugar?** Steam Roulette elige por vos un juego de tu biblioteca de Steam (y, si querés, de la de tu familia), con la información necesaria para decidir si es el momento de empezarlo: cuánto dura, qué opina la comunidad y cuántos logros te faltan.

> Proyecto personal sin afiliación con Valve Corporation ni Steam.

---

## Funcionalidades

### Ruleta
- **Rodillo en vivo**: las portadas de tu biblioteca giran y el juego que frena en el centro es el que te toca. La página toma el color que predomina en su portada.
- **Filtros**: sin estrenar (0 horas), poco jugados (menos de 2 horas), abandonados (jugados, pero no en los últimos 6 meses), favoritos, género y duración según HowLongToBeat (cortos, medianos, largos). Los juegos para adultos se ocultan por defecto.
- **Después de girar**: *Jugar ahora* abre Steam y lanza el juego; *Otro* vuelve a girar sin ese juego; *No me lo muestres más* lo saca de la ruleta (se recupera desde Biblioteca → Ocultos).
- **Historial**: los últimos juegos que salieron, para volver a cualquiera con un clic.
- **Antes del primer giro**: juegos sin estrenar para elegir a mano y tus más jugados.

### Ficha de cada juego
Duración estimada (HowLongToBeat), puntaje de la comunidad, **lo bueno y lo malo** en frases cortas tomadas de las reseñas más útiles de Steam (sin groserías ni dibujos con caracteres), dificultad de logros, tu progreso y precio.

### Biblioteca
- Búsqueda instantánea, los mismos filtros que la ruleta y orden por nombre, horas jugadas, última partida, duración, precio o fecha de salida.
- Los datos de la tienda (género, sinopsis en español, duración, reseñas) se completan **solos en segundo plano**, de a poco para no saturar a Steam. Se puede pausar.
- **Familia**: combina tu biblioteca con la de hasta 5 familiares e indica de quién es cada juego. Un perfil privado o un ID mal escrito se omite sin romper la tuya.

### Foro
Buscador de cualquier juego de Steam, reseñas con puntaje del 1 al 10 y discusiones con respuestas. Cualquiera con sesión puede **denunciar** un mensaje; los **moderadores** (`ADMIN_STEAM_IDS`) ven las denuncias y pueden borrar cualquier mensaje.

### Cuenta
**Inicio de sesión con Steam** (OpenID): no se piden ni se guardan contraseñas. La sesión queda en una cookie firmada por el backend.

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

Los pedidos a servicios externos pasan por un control de ritmo común (`services/throttle.py`): si Steam o HowLongToBeat avisan que nos pasamos, ese servicio se pausa unos minutos en lugar de seguir insistiendo.

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

Abrí <http://localhost:8000>. La imagen compila el frontend y lo sirve desde el backend; la base queda en el volumen `data`. Usa las variables de `backend/.env` (necesita al menos `STEAM_API_KEY` y un `SESSION_SECRET` de 32 caracteres o más). Si la publicás en otro dominio, poné su URL en `FRONTEND_URL`.

## Tests

```bash
cd backend && pytest          # backend
cd frontend && npm test       # frontend (Vitest)
```

El CI (GitHub Actions) corre los dos, verifica que las migraciones coincidan con los modelos y que la imagen de Docker compile.

## Limitaciones conocidas

- **Juegos gratis que nunca abriste**: la Steam Web API solo devuelve los free-to-play que jugaste al menos una vez, así que los que agregaste y nunca abriste (por ejemplo *Wuthering Waves* o *The First Descendant*) no aparecen en la biblioteca. Alcanza con abrirlos una vez desde Steam para que aparezcan.
- **HowLongToBeat** no tiene una API oficial: se busca por nombre y, si el sitio cambia, la duración puede faltar.
- **Reseñas**: Steam limita los pedidos de reseñas; si se pasa, se reintenta más tarde y mientras tanto la ficha sale sin "lo bueno y lo malo".
- **Contenido +18**: se detecta con los descriptores de contenido de la tienda. Hasta que un juego tiene esos datos, se usa una aproximación por el nombre.

## Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/games/library` | Biblioteca completa (con la de la familia), con filtros y orden opcionales |
| `GET` | `/api/games/details` | Ficha completa del juego que frenó en el rodillo |
| `GET` | `/api/games/random` | Juego aleatorio según los filtros |
| `GET` | `/api/games/genres` | Géneros disponibles en la biblioteca |
| `GET` | `/api/games/library/classification-status` | Cuántos juegos tienen datos de la tienda |
| `POST` | `/api/games/library/classify` | Completa los datos de un lote de juegos pendientes |
| `GET` | `/api/games/achievements` | Progreso de logros de un juego |
| `POST` / `DELETE` | `/api/games/favorites` | Agrega o quita un favorito (requiere sesión) |
| `POST` / `DELETE` | `/api/games/hidden` | Oculta un juego de la ruleta o lo vuelve a mostrar (requiere sesión) |
| `GET` | `/api/auth/login` | Inicia sesión con Steam (OpenID) |
| `GET` | `/api/auth/me` | Usuario de la sesión actual (incluye si es moderador) |
| `POST` | `/api/auth/logout` | Cierra la sesión |
| `GET` | `/api/auth/profile` | Nombre y avatar de un perfil |
| `GET` | `/api/forum/search` | Busca juegos en la tienda de Steam |
| `GET` | `/api/forum/recent` | Últimas reseñas y discusiones |
| `GET` | `/api/forum/games/{appid}` | Puntaje promedio y totales del foro de un juego |
| `GET` / `PUT` / `DELETE` | `/api/forum/games/{appid}/reviews` | Reseñas del juego; publicar o borrar la propia |
| `DELETE` | `/api/forum/reviews/{id}` | Borrar una reseña (la propia o, moderadores, cualquiera) |
| `GET` / `POST` | `/api/forum/games/{appid}/threads` | Discusiones del juego; abrir una nueva |
| `GET` / `DELETE` | `/api/forum/threads/{id}` | Una discusión con sus respuestas; borrarla |
| `POST` | `/api/forum/threads/{id}/posts` | Responder en una discusión |
| `DELETE` | `/api/forum/posts/{id}` | Borrar una respuesta |
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
