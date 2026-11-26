"""El tiempo rápido de IGDB (yendo directo a la historia) en la caché de cada juego.

Con él la ficha puede descartar duraciones que son horas de online (ver igdb_client.makes_sense),
como ya hacían las páginas "¿Cuánto dura…?".

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        batch.add_column(sa.Column("igdb_quick_hours", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        batch.drop_column("igdb_quick_hours")
