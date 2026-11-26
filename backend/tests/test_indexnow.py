import json
from pathlib import Path

import httpx
import respx

from app.services import indexnow


@respx.mock
async def test_submit_sends_the_key_and_only_our_addresses():
    route = respx.post(indexnow.ENDPOINT).mock(return_value=httpx.Response(202))

    ok = await indexnow.submit(
        ["https://ruletazo.app/cuanto-dura/portal-2", "https://otro.com/x", "https://ruletazo.app/cuanto-dura/portal-2"]
    )

    assert ok is True
    assert json.loads(route.calls.last.request.content) == {
        "host": "ruletazo.app",
        "key": indexnow.KEY,
        "keyLocation": f"https://ruletazo.app/{indexnow.KEY}.txt",
        "urlList": ["https://ruletazo.app/cuanto-dura/portal-2"],
    }


@respx.mock
async def test_a_rejected_submission_does_not_raise():
    respx.post(indexnow.ENDPOINT).mock(return_value=httpx.Response(403, text="clave inválida"))

    assert await indexnow.submit(["https://ruletazo.app/"]) is False


@respx.mock
async def test_a_network_failure_does_not_raise():
    respx.post(indexnow.ENDPOINT).mock(side_effect=httpx.ConnectError("sin red"))

    assert await indexnow.submit(["https://ruletazo.app/"]) is False


async def test_nothing_to_submit_makes_no_request():
    assert await indexnow.submit([]) is True
    assert await indexnow.submit(["https://otro.com/"]) is True


def test_the_key_file_is_published_with_the_page():
    key_file = Path(__file__).resolve().parents[2] / "frontend" / "public" / f"{indexnow.KEY}.txt"

    assert key_file.read_text(encoding="utf-8").strip() == indexnow.KEY
