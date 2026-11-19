"""Salas en grupo: armar, entrar, vetar y girar."""

import pytest

from app.services import profile_service, room_service
from app.services.room_service import RoomError

ANA = {"steam_id": "76561198000000001", "name": "Ana", "avatar": ""}
BETO = {"steam_id": "76561198000000002", "name": "Beto", "avatar": ""}
GAMES = [{"appid": 10, "name": "Hades"}, {"appid": 20, "name": "Celeste"}, {"appid": 30, "name": "Portal 2"}]


def test_create_room_cleans_the_pool(db_session):
    state = room_service.create_room(
        db_session, ANA, [*GAMES, {"appid": 10, "name": "Repetido"}, {"appid": -1, "name": "Malo"}, {"appid": "x"}]
    )
    assert len(state["code"]) == 6
    assert [game["appid"] for game in state["pool"]] == [10, 20, 30]
    assert state["pool"][0]["image"].endswith("/10/header.jpg")
    assert state["is_host"] is True and state["spin"] is None


def test_a_host_has_one_room_at_a_time(db_session):
    first = room_service.create_room(db_session, ANA, GAMES)
    room_service.create_room(db_session, ANA, GAMES)
    with pytest.raises(RoomError) as error:
        room_service.get_room(db_session, first["code"])
    assert error.value.status_code == 404


def test_members_veto_and_spin_never_picks_a_vetoed_game(db_session):
    code = room_service.create_room(db_session, ANA, GAMES)["code"]
    room_service.join(db_session, code.lower(), BETO)  # el código no distingue mayúsculas
    room_service.set_veto(db_session, code, BETO["steam_id"], 10, True)
    room_service.set_veto(db_session, code, ANA["steam_id"], 20, True)

    for _ in range(20):
        assert room_service.spin(db_session, code, ANA["steam_id"])["spin"]["appid"] == 30

    room_service.set_veto(db_session, code, ANA["steam_id"], 20, False)
    state = room_service.room_state(room_service.get_room(db_session, code), BETO["steam_id"])
    assert state["vetoes"] == {"10": [BETO["steam_id"]]}
    assert state["spin"]["id"] == 20


def test_only_the_host_spins_and_only_members_veto(db_session):
    code = room_service.create_room(db_session, ANA, GAMES)["code"]
    with pytest.raises(RoomError) as not_member:
        room_service.set_veto(db_session, code, BETO["steam_id"], 10, True)
    room_service.join(db_session, code, BETO)
    with pytest.raises(RoomError) as not_host:
        room_service.spin(db_session, code, BETO["steam_id"])
    assert (not_member.value.status_code, not_host.value.status_code) == (403, 403)


def test_cannot_spin_when_everything_is_vetoed(db_session):
    code = room_service.create_room(db_session, ANA, GAMES[:2])["code"]
    room_service.set_veto(db_session, code, ANA["steam_id"], 10, True)
    room_service.set_veto(db_session, code, ANA["steam_id"], 20, True)
    with pytest.raises(RoomError) as error:
        room_service.spin(db_session, code, ANA["steam_id"])
    assert error.value.status_code == 409


def test_deleting_data_closes_own_rooms_and_leaves_others(db_session):
    own = room_service.create_room(db_session, BETO, GAMES)["code"]
    other = room_service.create_room(db_session, ANA, GAMES)["code"]
    room_service.join(db_session, other, BETO)
    room_service.set_veto(db_session, other, BETO["steam_id"], 10, True)

    profile_service.delete_user_data(db_session, BETO["steam_id"])

    with pytest.raises(RoomError):
        room_service.get_room(db_session, own)
    state = room_service.room_state(room_service.get_room(db_session, other), ANA["steam_id"])
    assert [member["steam_id"] for member in state["members"]] == [ANA["steam_id"]]
    assert state["vetoes"] == {}
