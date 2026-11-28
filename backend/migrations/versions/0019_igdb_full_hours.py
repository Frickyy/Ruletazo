"""El tiempo completista de IGDB (al 100 %, todos los logros) en la caché de cada juego, para la
tarjeta de la ruleta.

Revision ID: 0019
Revises: 0018
Create Date: 2026-11-28
"""

import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        batch.add_column(sa.Column("igdb_full_hours", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        batch.drop_column("igdb_full_hours")
