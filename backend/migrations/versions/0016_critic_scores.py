"""Puntajes de la crítica en la caché de cada juego: Metacritic (de la ficha de Steam) y la crítica y
los usuarios de IGDB. Se muestran en la tarjeta del juego.

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

_COLUMNS = [
    ("metacritic_score", sa.Integer(), None),
    ("metacritic_url", sa.String(255), ""),
    ("critics_version", sa.Integer(), "0"),
    ("igdb_critic_score", sa.Float(), None),
    ("igdb_critic_count", sa.Integer(), "0"),
    ("igdb_user_score", sa.Float(), None),
    ("igdb_user_count", sa.Integer(), "0"),
]


def upgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        for name, kind, default in _COLUMNS:
            if default is None:
                batch.add_column(sa.Column(name, kind, nullable=True))
            else:
                batch.add_column(sa.Column(name, kind, nullable=False, server_default=default))


def downgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        for name, _kind, _default in reversed(_COLUMNS):
            batch.drop_column(name)
