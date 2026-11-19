from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, Response

from app.core.config import get_settings
from app.core.rate_limit import steam_reads
from app.core.security import (
    SESSION_COOKIE,
    SESSION_MAX_AGE_SECONDS,
    create_session_token,
    current_steam_id,
    is_moderator,
)
from app.services.steam_client import InvalidSteamIDError, SteamAPIError, SteamClient

router = APIRouter(prefix="/api/auth", tags=["auth"])
STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"


@router.get("/profile", dependencies=[Depends(steam_reads)])
async def steam_profile(steamid: str) -> dict:
    """Comprueba el perfil autenticado y devuelve su nombre y avatar público."""
    try:
        async with SteamClient() as client:
            resolved_id = await client.resolve_steam_id(steamid)
            return await client.get_profile(resolved_id)
    except InvalidSteamIDError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SteamAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/login")
async def steam_login(request: Request) -> RedirectResponse:
    """Inicia el flujo Steam OpenID y vuelve al frontend al terminar."""
    callback_url = str(request.url_for("steam_auth_callback"))
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": callback_url,
        "openid.realm": f"{request.url.scheme}://{request.url.netloc}",
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return RedirectResponse(f"{STEAM_OPENID_URL}?{urlencode(params)}")


@router.get("/callback", name="steam_auth_callback")
async def steam_auth_callback(request: Request) -> RedirectResponse:
    """Valida la respuesta OpenID con Steam y entrega el SteamID al frontend."""
    params = dict(request.query_params)
    frontend_url = get_settings().frontend_url.rstrip("/")

    if params.get("openid.mode") != "id_res":
        return RedirectResponse(f"{frontend_url}/?auth_error=cancelled")

    verification_data = {key: value for key, value in params.items() if key.startswith("openid.")}
    verification_data["openid.mode"] = "check_authentication"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(STEAM_OPENID_URL, data=verification_data)
    except httpx.HTTPError:
        return RedirectResponse(f"{frontend_url}/?auth_error=steam_unavailable")

    if response.status_code >= 400 or "is_valid:true" not in response.text:
        return RedirectResponse(f"{frontend_url}/?auth_error=invalid_response")

    claimed_id = params.get("openid.claimed_id", "")
    prefixes = ("https://steamcommunity.com/openid/id/", "http://steamcommunity.com/openid/id/")
    steam_id = claimed_id
    for prefix in prefixes:
        if claimed_id.startswith(prefix):
            steam_id = claimed_id.removeprefix(prefix)
            break
    if not (steam_id.isdigit() and len(steam_id) == 17):
        return RedirectResponse(f"{frontend_url}/?auth_error=invalid_steamid")

    # El SteamID viaja en una cookie firmada (HttpOnly): el frontend lo obtiene de /api/auth/me
    # y nadie puede hacerse pasar por otro usuario editando la URL o localStorage.
    redirect = RedirectResponse(f"{frontend_url}/?login=success")
    redirect.set_cookie(
        SESSION_COOKIE,
        create_session_token(steam_id),
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https" or get_settings().is_production,
        path="/",
    )
    return redirect


@router.get("/me")
async def current_session(steam_id: str | None = Depends(current_steam_id)) -> dict:
    """Usuario de la sesión actual (perfil público de Steam). 401 si no inició sesión."""
    if steam_id is None:
        raise HTTPException(status_code=401, detail="No hay una sesión iniciada.")
    try:
        async with SteamClient() as client:
            profile = await client.get_profile(steam_id)
    except SteamAPIError:
        profile = {"steam_id": steam_id, "name": "Jugador de Steam", "avatar": ""}
    return {**profile, "is_moderator": is_moderator(steam_id)}


@router.post("/logout", status_code=204)
async def logout() -> Response:
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response
