"""Sincronizar estados con Steam (opcional, desde el perfil): lo jugado en las últimas 2 semanas pasa
a "Jugando" y lo que tiene todos los logros a "Terminado".

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-27
"""

import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("user_profiles") as batch:
        batch.add_column(sa.Column("sync_steam_states", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("states_synced_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("user_profiles") as batch:
        batch.drop_column("states_synced_at")
        batch.drop_column("sync_steam_states")
