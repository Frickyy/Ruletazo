"""Duración de los juegos según IGDB en la caché de cada juego.

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        batch.add_column(sa.Column("igdb_hours", sa.Float(), nullable=True))
        batch.add_column(sa.Column("igdb_samples", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("igdb_url", sa.String(length=255), nullable=False, server_default=""))
        batch.add_column(sa.Column("igdb_version", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        batch.drop_column("igdb_version")
        batch.drop_column("igdb_url")
        batch.drop_column("igdb_samples")
        batch.drop_column("igdb_hours")
