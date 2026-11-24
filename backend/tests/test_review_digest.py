import httpx
import respx

from app.services import review_digest
from app.services.store_client import SteamStoreClient

GOOD = "La exploración es excelente y el combate se siente preciso en todo momento. Muy recomendable."


def test_skips_ascii_art_profanity_shouting_and_links():
    reviews = [
        "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
        "Es una mierda de juego, no lo compren bajo ningún punto de vista por favor.",
        "Un juego ESTÚPIDO con una historia que no tiene ningún sentido de principio a fin.",
        "ESTE JUEGO ES LO MEJOR QUE JUGUÉ EN TODA MI VIDA, COMPRENLO YA MISMO AMIGOS",
        "Miren mi análisis completo en https://example.com antes de comprarlo, vale la pena.",
        "10/10",
        GOOD,
    ]

    assert review_digest.pick_excerpts(reviews) == [GOOD]


def test_strips_steam_bbcode_and_keeps_first_sentences():
    review = "[h1]Gran juego[/h1] [b]La historia atrapa desde el primer minuto.[/b] " + "Relleno. " * 60

    excerpt = review_digest.pick_excerpts([review])[0]

    assert excerpt.startswith("Gran juego La historia atrapa")
    assert "[" not in excerpt
    assert len(excerpt) <= review_digest.EXCERPT_MAX_LENGTH


def test_long_first_sentence_is_cut_on_a_word():
    review = "Este juego tiene " + "muchísimas cosas para hacer y explorar " * 20

    excerpt = review_digest.first_sentences(review)

    assert excerpt.endswith("…")
    assert len(excerpt) <= review_digest.EXCERPT_MAX_LENGTH + 1


def test_limits_and_deduplicates():
    reviews = [GOOD, GOOD, GOOD.replace("excelente", "muy buena"), GOOD.replace("preciso", "ágil"), GOOD + " Extra."]

    excerpts = review_digest.pick_excerpts(reviews, limit=2)

    assert len(excerpts) == 2
    assert len(set(excerpts)) == 2


def test_profanity_ignores_accents_and_substrings():
    assert review_digest.contains_profanity("Qué juego más estúpido")
    assert not review_digest.contains_profanity("Una clase de juego clásico")  # "ass" dentro de "class"


def _reviews_payload(reviews, score="Very Positive"):
    return {
        "success": 1,
        "query_summary": {"review_score_desc": score, "total_reviews": 1000, "total_positive": 900},
        "reviews": [{"review": text, "voted_up": voted_up} for text, voted_up in reviews],
    }


@respx.mock
async def test_review_digest_splits_good_and_bad():
    bad = "Los menús son lentos y el rendimiento cae mucho en las zonas con muchos enemigos."
    respx.get("https://store.steampowered.com/appreviews/10").mock(
        return_value=httpx.Response(200, json=_reviews_payload([(GOOD, True), (bad, False)]))
    )

    async with SteamStoreClient() as client:
        digest = await client.get_review_digest(10)

    assert digest["failed"] is False
    assert "score_desc" not in digest  # el puntaje sale de la tienda (store_browse), no de acá
    assert digest["good"] == [GOOD]
    assert digest["bad"] == [bad]


@respx.mock
async def test_review_digest_reports_rate_limit_redirect_as_failure():
    respx.get("https://store.steampowered.com/appreviews/10").mock(
        return_value=httpx.Response(302, headers={"Location": "https://store.steampowered.com/"})
    )

    async with SteamStoreClient() as client:
        digest = await client.get_review_digest(10)

    assert digest == {"failed": True}
