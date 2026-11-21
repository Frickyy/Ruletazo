"""Marca de software en la caché de la tienda (Soundpad, Wallpaper Engine…).

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-20
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        batch.add_column(sa.Column("is_software", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        batch.drop_column("is_software")
