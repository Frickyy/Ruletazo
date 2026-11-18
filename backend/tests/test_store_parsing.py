from app.services.store_client import HIGHLIGHT_MAX_LENGTH, parse_search_results, pick_highlight


def test_pick_highlight_skips_ascii_art_and_short_reviews():
    reviews = [
        "10/10",
        "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
        "Muy buen juego, la exploración es excelente y el combate se siente preciso.",
    ]

    assert pick_highlight(reviews).startswith("Muy buen juego")


def test_pick_highlight_truncates_long_reviews():
    long_review = "Una aventura enorme con jefes difíciles y mucho para explorar. " * 20

    highlight = pick_highlight([long_review])

    assert len(highlight) <= HIGHLIGHT_MAX_LENGTH + 1
    assert highlight.endswith("…")


def test_pick_highlight_without_candidates_is_empty():
    assert pick_highlight([]) == ""


def test_parse_search_results_keeps_only_apps():
    payload = {
        "items": [
            {"type": "app", "id": 367520, "name": "Hollow Knight"},
            {"type": "sub", "id": 1, "name": "Bundle"},
            {"type": "app", "id": 620, "name": "Portal 2"},
        ]
    }

    results = parse_search_results(payload, limit=10)

    assert [result["appid"] for result in results] == [367520, 620]
    assert results[0]["image"].endswith("/367520/header.jpg")


def test_parse_search_results_skips_soundtracks_and_prefers_store_image():
    payload = {
        "items": [
            {"type": "app", "id": 367520, "name": "Hollow Knight", "tiny_image": "https://cdn/367520/capsule.jpg"},
            {"type": "app", "id": 598190, "name": "Hollow Knight - Official Soundtrack"},
            {"type": "app", "id": 3928720, "name": "Hollow Knight: Silksong OST"},
        ]
    }

    results = parse_search_results(payload)

    assert [result["appid"] for result in results] == [367520]
    assert results[0]["image"] == "https://cdn/367520/capsule.jpg"
