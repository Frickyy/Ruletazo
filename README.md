# Steam Roulette

**¿No sabés qué jugar?** Steam Roulette elige por vos un juego de tu biblioteca de Steam (y, si querés, de la de tu familia), con la información necesaria para decidir si es el momento de empezarlo: cuánto dura, qué opina la comunidad y cuántos logros te faltan.

> Proyecto personal sin afiliación con Valve Corporation ni Steam.

---

## Funcionalidades

- **Ruleta de juegos**: elige un título al azar de tu biblioteca, filtrando por juegos sin estrenar (0 horas), poco jugados (menos de 2 horas), favoritos o género.
- **Inicio de sesión con Steam** mediante Steam OpenID: no se piden ni se guardan contraseñas.
- **Biblioteca familiar**: combina tu biblioteca con la de hasta 5 familiares e indica de quién es cada juego.
- **Ficha de cada juego**: duración estimada (HowLongToBeat), resumen de reseñas, dificultad de logros y tu progreso.
- **Explorador de biblioteca**: búsqueda por nombre, orden por nombre, precio o fecha de salida, y favoritos.
- **Caché en SQLite**: la biblioteca y los datos de cada juego se guardan localmente para no saturar las APIs de Steam.

## Tecnologías

| Capa | Herramientas |
|---|---|
| Frontend | React 18, Vite, Axios |
| Backend | Python 3.13, FastAPI, SQLAlchemy, httpx |
| Datos | Steam Web API, Steam Store API, HowLongToBeat |
| Base de datos | SQLite |
| Tests | pytest, pytest-asyncio, respx |

## Arquitectura

```
┌──────────────┐   /api (proxy de Vite)   ┌──────────────────┐        ┌───────────────────┐
│  React + Vite│ ───────────────────────▶ │  FastAPI         │ ─────▶ │ Steam Web API     │
│  :5173       │                          │  :8000           │        │ Steam Store API   │
└──────────────┘                          │  caché SQLite    │        │ HowLongToBeat     │
                                          └──────────────────┘        └───────────────────┘
```

En desarrollo, Vite reenvía todas las rutas `/api` al backend, así frontend y API comparten el mismo origen y el login con Steam vuelve al mismo puerto.

## Puesta en marcha

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

Completá `backend/.env` con tu clave:

```env
STEAM_API_KEY=tu_api_key_de_steam
DATABASE_URL=sqlite:///./steam_roulette.db
CORS_ORIGINS=http://localhost:5173
```

Levantá la API:

```bash
uvicorn app.main:app --reload --port 8000
```

La documentación interactiva queda disponible en <http://localhost:8000/docs>.

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

> Sin `STEAM_API_KEY` o sin iniciar sesión, la ruleta funciona igual con una biblioteca de ejemplo.

## Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/games/random` | Juego aleatorio según los filtros |
| `GET` | `/api/games/library` | Biblioteca completa, con filtros y orden |
| `GET` | `/api/games/genres` | Géneros disponibles en la biblioteca |
| `GET` | `/api/games/library/classification-status` | Progreso de la clasificación de la biblioteca |
| `POST` | `/api/games/library/classify` | Clasifica un lote de juegos pendientes |
| `GET` | `/api/games/achievements` | Progreso de logros de un juego |
| `POST` / `DELETE` | `/api/games/favorites` | Agrega o quita un favorito |
| `GET` | `/api/auth/login` | Inicia sesión con Steam (OpenID) |
| `GET` | `/api/auth/profile` | Nombre y avatar de un perfil |

## Tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

## Estructura

```
backend/
  app/
    core/        configuración (.env)
    db/          sesión de SQLAlchemy
    models/      tablas de caché y favoritos
    routers/     endpoints de juegos y autenticación
    schemas/     modelos de respuesta
    services/    clientes de Steam, Store y HowLongToBeat, lógica de biblioteca
  tests/
frontend/
  src/
    components/  tarjeta de juego y controles
    hooks/       lógica de la ruleta
    pages/       Ruleta y Biblioteca
    services/    cliente de la API
```

## Próximos pasos

- Sesión firmada en el backend para que los favoritos solo puedan modificarse desde la cuenta que inició sesión.
- Despliegue con Docker.

## Notas

- Bitburner
- Bless Unleashed
- The First Descendant
- Wuthering Waves
