"""Guarda la URL de la portada que da la tienda.

Los juegos recientes no tienen portada en la dirección fija
(`cdn.cloudflare.steamstatic.com/steam/apps/<appid>/header.jpg`): la tienda la publica en una
dirección con un código propio, que se guarda al clasificar el juego.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        batch.add_column(sa.Column("header_image", sa.String(512), nullable=False, server_default=""))


def downgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        batch.drop_column("header_image")
