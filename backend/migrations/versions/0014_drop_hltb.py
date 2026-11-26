"""Sin HowLongToBeat: se borran sus columnas de la caché de cada juego.

Sus términos no permiten el acceso automatizado. La duración sale de IGDB y de quienes
terminaron cada juego en Ruletazo.

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Solo las que existan: una base muy vieja (anterior a Alembic) puede no tener alguna.
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("cached_game_details")}
    columns = [name for name in ("hltb_version", "hltb_completionist_hours", "hltb_main_hours") if name in existing]
    if columns:
        with op.batch_alter_table("cached_game_details") as batch:
            for name in columns:
                batch.drop_column(name)


def downgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        batch.add_column(sa.Column("hltb_main_hours", sa.Float(), nullable=True))
        batch.add_column(sa.Column("hltb_completionist_hours", sa.Float(), nullable=True))
        batch.add_column(sa.Column("hltb_version", sa.Integer(), nullable=False, server_default="0"))
