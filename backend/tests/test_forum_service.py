import pytest

from app.services import forum_service
from app.services.forum_service import Author, ForumError

ANA = Author(steam_id="76561198000000001", name="Ana", avatar="https://a/ana.jpg")
BETO = Author(steam_id="76561198000000002", name="Beto")
APPID = 367520


def test_review_is_created_and_listed(db_session):
    forum_service.upsert_review(db_session, APPID, "Hollow Knight", ANA, 9, "  Excelente  ")

    reviews = forum_service.list_reviews(db_session, APPID, viewer_steam_id=ANA.steam_id)

    assert len(reviews) == 1
    assert reviews[0]["score"] == 9
    assert reviews[0]["body"] == "Excelente"
    assert reviews[0]["author"]["name"] == "Ana"
    assert reviews[0]["is_mine"] is True


def test_second_review_from_same_user_replaces_the_first(db_session):
    forum_service.upsert_review(db_session, APPID, "Hollow Knight", ANA, 9, "Muy bueno")
    forum_service.upsert_review(db_session, APPID, "Hollow Knight", ANA, 6, "Lo pensé mejor")

    reviews = forum_service.list_reviews(db_session, APPID)

    assert [review["score"] for review in reviews] == [6]


def test_review_stats_average_scores(db_session):
    forum_service.upsert_review(db_session, APPID, "Hollow Knight", ANA, 9, "Bueno")
    forum_service.upsert_review(db_session, APPID, "Hollow Knight", BETO, 6, "Normal")

    assert forum_service.review_stats(db_session, APPID) == {"review_count": 2, "average_score": 7.5}
    assert forum_service.review_stats(db_session, 1) == {"review_count": 0, "average_score": None}


@pytest.mark.parametrize("score", [0, 11, -3])
def test_score_out_of_range_is_rejected(db_session, score):
    with pytest.raises(ForumError):
        forum_service.upsert_review(db_session, APPID, "Hollow Knight", ANA, score, "Texto")


def test_empty_review_is_rejected(db_session):
    with pytest.raises(ForumError):
        forum_service.upsert_review(db_session, APPID, "Hollow Knight", ANA, 5, "   ")


def test_delete_review(db_session):
    forum_service.upsert_review(db_session, APPID, "Hollow Knight", ANA, 9, "Bueno")

    forum_service.delete_review(db_session, APPID, ANA.steam_id)

    assert forum_service.list_reviews(db_session, APPID) == []


def test_thread_with_replies(db_session):
    thread = forum_service.create_thread(db_session, APPID, "Hollow Knight", ANA, "¿Vale la pena?", "Lo dudo")
    forum_service.add_post(db_session, thread["id"], BETO, "Sí, totalmente")

    detail = forum_service.get_thread(db_session, thread["id"], viewer_steam_id=BETO.steam_id)
    listing = forum_service.list_threads(db_session, APPID)

    assert detail["title"] == "¿Vale la pena?"
    assert [post["body"] for post in detail["posts"]] == ["Sí, totalmente"]
    assert detail["posts"][0]["is_mine"] is True
    assert detail["is_mine"] is False
    assert listing[0]["reply_count"] == 1


def test_short_title_is_rejected(db_session):
    with pytest.raises(ForumError):
        forum_service.create_thread(db_session, APPID, "Hollow Knight", ANA, "Ok", "Texto")


def test_only_the_author_can_delete_a_thread(db_session):
    thread = forum_service.create_thread(db_session, APPID, "Hollow Knight", ANA, "Título largo", "Texto")

    with pytest.raises(ForumError) as error:
        forum_service.delete_thread(db_session, thread["id"], BETO.steam_id)
    assert error.value.status_code == 403

    forum_service.delete_thread(db_session, thread["id"], ANA.steam_id)
    assert forum_service.list_threads(db_session, APPID) == []


def test_only_the_author_can_delete_a_reply(db_session):
    thread = forum_service.create_thread(db_session, APPID, "Hollow Knight", ANA, "Título largo", "Texto")
    post = forum_service.add_post(db_session, thread["id"], BETO, "Respuesta")

    with pytest.raises(ForumError):
        forum_service.delete_post(db_session, post["id"], ANA.steam_id)

    forum_service.delete_post(db_session, post["id"], BETO.steam_id)
    assert forum_service.get_thread(db_session, thread["id"])["posts"] == []


def test_reply_to_missing_thread_is_404(db_session):
    with pytest.raises(ForumError) as error:
        forum_service.add_post(db_session, 999, ANA, "Hola")
    assert error.value.status_code == 404


def test_recent_activity_mixes_reviews_and_threads(db_session):
    forum_service.upsert_review(db_session, APPID, "Hollow Knight", ANA, 9, "Bueno")
    forum_service.create_thread(db_session, 620, "Portal 2", BETO, "Mejor puzzle", "Texto")

    activity = forum_service.recent_activity(db_session)

    assert {item["kind"] for item in activity} == {"review", "thread"}
    assert forum_service.known_game_name(db_session, 620) == "Portal 2"
