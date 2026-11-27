"""Minutos jugados de cada juego reciente en la última sincronización con Steam: un juego vuelve a
"Jugando" solo si lo jugaste de nuevo (sirve también para los de la biblioteca familiar).

Revision ID: 0018
Revises: 0017
Create Date: 2026-11-27
"""

import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "steam_sync_seen",
        sa.Column("steam_id", sa.String(32), primary_key=True),
        sa.Column("appid", sa.Integer(), primary_key=True),
        sa.Column("playtime_forever", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("steam_sync_seen")
