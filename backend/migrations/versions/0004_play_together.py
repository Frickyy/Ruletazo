"""Categorías de jugadores, estados de juego, progreso de logros y edición en el foro.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cached_game_details") as batch:
        batch.add_column(sa.Column("player_categories", sa.JSON(), nullable=False, server_default="[]"))
    with op.batch_alter_table("forum_threads") as batch:
        batch.add_column(sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))
    with op.batch_alter_table("forum_posts") as batch:
        batch.add_column(sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "game_states",
        sa.Column("steam_id", sa.String(32), primary_key=True),
        sa.Column("appid", sa.Integer(), primary_key=True),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "user_game_progress",
        sa.Column("steam_id", sa.String(32), primary_key=True),
        sa.Column("appid", sa.Integer(), primary_key=True),
        sa.Column("unlocked", sa.Integer(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_game_progress")
    op.drop_table("game_states")
    with op.batch_alter_table("forum_posts") as batch:
        batch.drop_column("edited_at")
    with op.batch_alter_table("forum_threads") as batch:
        batch.drop_column("edited_at")
    with op.batch_alter_table("cached_game_details") as batch:
        batch.drop_column("player_categories")
