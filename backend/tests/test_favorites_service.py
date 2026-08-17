from app.services import favorites_service

STEAM_ID = "76561198000000000"


def test_add_and_list_favorite(db_session):
    favorites_service.add_favorite(db_session, STEAM_ID, 10)

    assert favorites_service.get_favorite_appids(db_session, STEAM_ID) == {10}


def test_add_favorite_is_idempotent(db_session):
    favorites_service.add_favorite(db_session, STEAM_ID, 10)
    favorites_service.add_favorite(db_session, STEAM_ID, 10)

    assert favorites_service.get_favorite_appids(db_session, STEAM_ID) == {10}


def test_remove_favorite(db_session):
    favorites_service.add_favorite(db_session, STEAM_ID, 10)

    favorites_service.remove_favorite(db_session, STEAM_ID, 10)

    assert favorites_service.get_favorite_appids(db_session, STEAM_ID) == set()


def test_remove_favorite_that_does_not_exist_is_a_noop(db_session):
    favorites_service.remove_favorite(db_session, STEAM_ID, 999)

    assert favorites_service.get_favorite_appids(db_session, STEAM_ID) == set()
