# Ruletazo

**¿No sabés qué jugar?** Ruletazo elige por vos un juego de tu biblioteca de Steam (y, si querés, de la de tu familia), con la información necesaria para decidir si es el momento de empezarlo: cuánto dura, qué opina la comunidad y cuántos logros te faltan.

> Proyecto personal sin afiliación con Valve Corporation ni Steam.

---

## Funcionalidades

### Ruleta
- **Rodillo en vivo**: las portadas de tu biblioteca giran y el juego que frena en el centro es el que te toca. La página toma el color que predomina en su portada.
- **Filtros**: sin estrenar (0 horas), poco jugados (menos de 2 horas), abandonados (jugados, pero no en los últimos 6 meses), favoritos, *Jugando*, *Casi al 100%* (te falta poco para todos los logros), género, duración (cortos, medianos, largos; ver *Duración* más abajo) y modo de juego (un jugador, cooperativo, multijugador, pantalla compartida). Los terminados y los juegos para adultos quedan fuera por defecto.
- **Para jugar juntos**: con la familia sumada, *En común con la familia* deja solo los juegos que tienen los dos; combinado con *Cooperativos*, la ruleta elige qué jugar en pareja o con amigos.
- **Ruleta inteligente** (opcional): todos pueden salir, pero salen más seguido los sin estrenar, los cortos, los bien reseñados, tus favoritos y los que estás jugando.
- **Barra espaciadora** para girar y **sonido** opcional del rodillo.
- **Sin cuenta**: pegando el link de un perfil público de Steam se gira con esa biblioteca. Para guardar favoritos y estados hace falta iniciar sesión.
- **Después de girar**: *Jugar ahora* abre Steam y lanza el juego; *Otro* vuelve a girar y ese juego no sale más por hoy (se puede deshacer); *No me lo muestres más* lo saca de la ruleta (se recupera desde Biblioteca → Ocultos); y se puede marcar como *Jugando*, *Terminado* o *Abandonado*.
- **Historial**: los últimos juegos que salieron, para volver a cualquiera con un clic.

### Salas en grupo
- **Jugar en grupo** arma una sala (`#/sala/<código>`) con los juegos que hoy entran en tu ruleta. Tus amigos entran con el link e inician sesión con Steam.
- Cada uno **veta** los juegos que no quiere. Quien armó la sala gira y el backend elige al azar entre los que nadie vetó: todos ven el mismo rodillo al mismo tiempo.
- Las salas duran 12 horas y entran hasta 8 personas.
- **Antes del primer giro**: juegos sin estrenar para elegir a mano y tus más jugados.

### Ficha de cada juego
Duración (según quienes lo terminaron en Ruletazo), puntaje de la comunidad, **lo bueno y lo malo** en frases cortas tomadas de las reseñas más útiles de Steam (sin groserías ni dibujos con caracteres), dificultad de logros, tu progreso y precio.

### Biblioteca
- Búsqueda instantánea, los mismos filtros que la ruleta y orden por nombre, horas jugadas, última partida, duración, precio o fecha de salida.
- Los datos se completan **solos en segundo plano**, en dos pasadas: primero los de la tienda (géneros, modos de juego, sinopsis en español, portada, precio), de a 50 juegos por pedido, que tarda segundos; después tu progreso de logros (y la duración de HowLongToBeat, solo si está activado), de a un juego. Se puede pausar.
- **Progreso**: cuántos juegos estás jugando, terminaste y abandonaste, y cuántos terminaste y empezaste en el año.
- **Familia**: combina tu biblioteca con la de hasta 5 familiares e indica de quién es cada juego. Un perfil privado o un ID mal escrito se omite sin romper la tuya.

### Foro
Buscador de cualquier juego de Steam, reseñas con puntaje del 1 al 10 y discusiones con respuestas, con formato básico (`**negrita**`, `||spoiler||` y links). Los mensajes propios se pueden **editar**. Cualquiera con sesión puede **denunciar** un mensaje; los **moderadores** (`ADMIN_STEAM_IDS`) ven las denuncias y pueden borrar cualquier mensaje.

### Español e inglés
Botón **ES / EN** en la barra de arriba. La primera vez se elige según el idioma del navegador y después se recuerda. Los textos se escriben en español en el código y pasan por `t()` (`frontend/src/i18n/`); `en.js` tiene la traducción y un test avisa si falta alguna. Los mensajes de error del backend se traducen en el frontend.

### Instalable
En el celular se puede agregar a la pantalla de inicio y se abre como una app (PWA).

### Perfiles
- Página `#/perfil/<steamid>` con lo que estás jugando, lo que terminaste, tus favoritos y tus reseñas del foro.
- **Privado por defecto**: solo lo ves vos hasta que lo hacés público y compartís el link.
- En el perfil de otra persona, **"¿Qué tenemos en común?"** compara las bibliotecas (filtrable por cooperativo o multijugador) y permite sumarla a tu familia para girar entre los juegos en común.
- El seguimiento del progreso de logros (para *Casi al 100%*) se activa desde el perfil.
- **Pila de pendientes y desafíos del mes** (empezar algo nuevo, terminar uno cortito, terminar 3 juegos), calculados con los estados que marcás.
- **Compartir mi año**: genera una imagen con tus números y tus últimos terminados (en el celular abre el menú de compartir).
- Tus favoritos, ocultos, estados y progreso solo los ves vos, aunque alguien conozca tu SteamID.
- **Borrar mis datos** elimina todo lo que la página guarda de vos y cierra las sesiones abiertas en otros dispositivos.

### Cuenta
**Inicio de sesión con Steam** (OpenID, con el botón oficial): no se piden ni se guardan contraseñas. La sesión queda en una cookie firmada por el backend.

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
| `CONTACT_EMAIL` | Mail de contacto de la política de privacidad y los términos. |
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

Abrí <http://localhost:8000>. La imagen compila el frontend y lo sirve desde el backend; la base queda en el volumen `data`, con una copia de seguridad por día en `data/backups`. Usa las variables de `backend/.env` (necesita al menos `STEAM_API_KEY` y un `SESSION_SECRET` de 32 caracteres o más). Si la publicás en otro dominio, poné su URL en `FRONTEND_URL`.

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
- La política de privacidad y los términos (`#/privacidad`, `#/terminos`) son un **borrador**: revisalos con alguien con conocimiento legal de tu país y completá el país del servidor (`frontend/src/pages/LegalPage.jsx`) y `CONTACT_EMAIL`.

## Limitaciones conocidas

- **Juegos gratis que nunca abriste**: la Steam Web API solo devuelve los free-to-play que jugaste al menos una vez, así que los que agregaste y nunca abriste (por ejemplo *Wuthering Waves* o *The First Descendant*) no aparecen en la biblioteca. Alcanza con abrirlos una vez desde Steam para que aparezcan.
- **HowLongToBeat** no tiene una API oficial: se busca por nombre y, si el sitio cambia, la duración puede faltar.
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
