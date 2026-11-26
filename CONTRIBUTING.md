# Cómo contribuir

¡Gracias por querer mejorar Ruletazo! Cualquiera puede proponer cambios con un pull request: lo revisamos y, si entra, queda en [ruletazo.app](https://ruletazo.app) después del merge.

> **English:** pull requests are welcome in English or Spanish. Fork the repo, make your change on a branch, run the tests and open a PR against `main`.

## Antes de empezar

- Para un arreglo chico (un error, un texto, una traducción) mandá el pull request directamente.
- Para algo más grande (una función nueva, un cambio de diseño) abrí antes un *issue* contando la idea, así no trabajás en algo que después no entra.
- Si encontraste una **falla de seguridad**, no abras un issue público: seguí [SECURITY.md](SECURITY.md).

## Correrlo en tu compu

Los pasos completos están en [DESARROLLO.md](DESARROLLO.md). En resumen, con Python 3.11 o superior y Node.js 22.12 o superior:

```bash
# Backend (http://localhost:8000)
cd backend
python -m venv .venv
.venv\Scripts\activate            # En macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
copy .env.example .env            # En macOS/Linux: cp .env.example .env
uvicorn app.main:app --reload --port 8000

# Frontend (http://localhost:5173), en otra terminal
cd frontend
npm install
npm run dev
```

No hace falta ninguna clave para empezar: sin `STEAM_API_KEY` la ruleta usa una biblioteca de ejemplo. Para probar con bibliotecas reales, sacá una clave gratis en <https://steamcommunity.com/dev/apikey> y ponela en `backend/.env` (ese archivo no se sube nunca).

## Antes de mandar el pull request

1. Corré los tests:

   ```bash
   cd backend && python -m pytest        # backend
   cd frontend && npm test && npm run build   # frontend
   ```

2. Si cambiaste un modelo de la base, sumá una migración de Alembic (`cd backend && alembic revision --autogenerate -m "qué cambia"`) y revisala a mano.
3. Si agregaste o cambiaste textos de la página, escribilos en español y sumá la traducción en `frontend/src/i18n/en.js`.
4. Si el cambio se ve, agregá una captura en la descripción del pull request.

El CI (GitHub Actions) corre todo eso solo en cada pull request. La primera vez que contribuís, alguien del proyecto tiene que aprobar que corra.

## Reglas del proyecto

- **La plata nunca influye en qué juego sale en la ruleta**, y no se venden datos ni se agregan anuncios invasivos.
- Nada de rastreo de terceros: sin cookies de publicidad ni scripts de otros sitios.
- Solo se usan datos de servicios que lo permiten (la Steam Web API, IGDB). No se aceptan cambios que extraigan datos de sitios cuyos términos lo prohíben.
- Nunca subas claves, contraseñas ni archivos `.env`.
- Mantené el estilo del código que tocás. Los comentarios y los textos de la página van en español.

## Licencia de tus cambios

Ruletazo no es software libre: el código se publica para leerlo y mejorarlo (ver [LICENSE](LICENSE)). Al mandar un pull request confirmás que el cambio es tuyo (o que tenés derecho a mandarlo) y aceptás que se use en Ruletazo, como dice la sección 3 de la licencia.
