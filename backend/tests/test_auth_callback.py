"""Vuelta del login de Steam (OpenID): solo valen las respuestas firmadas para esta página."""

import httpx
import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.security import SESSION_COOKIE
from app.routers import auth

STEAM_ID = "76561198000000000"
CALLBACK = "http://testserver/api/auth/callback"


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(auth.router)
    return TestClient(app, follow_redirects=False)


def _assertion(**overrides) -> dict:
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "id_res",
        "openid.op_endpoint": auth.STEAM_OPENID_URL,
        "openid.claimed_id": f"https://steamcommunity.com/openid/id/{STEAM_ID}",
        "openid.identity": f"https://steamcommunity.com/openid/id/{STEAM_ID}",
        "openid.return_to": CALLBACK,
        "openid.response_nonce": "2026-11-24T10:00:00Zabc",
        "openid.assoc_handle": "1234567890",
        "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
        "openid.sig": "firma",
    }
    params.update(overrides)
    return params


@respx.mock
def test_login_for_this_site_opens_a_session():
    steam = respx.post(auth.STEAM_OPENID_URL).mock(return_value=httpx.Response(200, text="ns:http://specs.openid.net/auth/2.0\nis_valid:true\n"))

    response = _client().get("/api/auth/callback", params=_assertion())

    assert steam.called
    assert response.headers["location"].endswith("/?login=success")
    assert SESSION_COOKIE in response.headers.get("set-cookie", "")


@respx.mock
def test_login_signed_for_another_site_is_rejected():
    # Steam dice que la firma es válida, pero la respuesta era para otra página.
    steam = respx.post(auth.STEAM_OPENID_URL).mock(return_value=httpx.Response(200, text="is_valid:true\n"))

    response = _client().get("/api/auth/callback", params=_assertion(**{"openid.return_to": "https://otro-sitio.example/login"}))

    assert not steam.called
    assert response.headers["location"].endswith("/?auth_error=invalid_response")
    assert SESSION_COOKIE not in response.headers.get("set-cookie", "")


@respx.mock
def test_login_with_unsigned_return_to_is_rejected():
    respx.post(auth.STEAM_OPENID_URL).mock(return_value=httpx.Response(200, text="is_valid:true\n"))

    response = _client().get(
        "/api/auth/callback", params=_assertion(**{"openid.signed": "signed,op_endpoint,claimed_id,identity,response_nonce,assoc_handle"})
    )

    assert response.headers["location"].endswith("/?auth_error=invalid_response")


@respx.mock
def test_login_from_another_provider_is_rejected():
    respx.post(auth.STEAM_OPENID_URL).mock(return_value=httpx.Response(200, text="is_valid:true\n"))

    response = _client().get("/api/auth/callback", params=_assertion(**{"openid.op_endpoint": "https://evil.example/openid"}))

    assert response.headers["location"].endswith("/?auth_error=invalid_response")
