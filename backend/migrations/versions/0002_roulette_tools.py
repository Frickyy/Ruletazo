"""Juegos ocultos, fecha de última partida, marca de contenido adulto y denuncias del foro.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cached_library_entries") as batch:
        batch.add_column(sa.Column("last_played", sa.Integer(), nullable=True))
    with op.batch_alter_table("cached_game_details") as batch:
        batch.add_column(sa.Column("is_adult", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "hidden_games",
        sa.Column("steam_id", sa.String(32), primary_key=True),
        sa.Column("appid", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "forum_reports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False, index=True),
        sa.Column("reporter_steam_id", sa.String(32), nullable=False),
        sa.Column("reason", sa.String(300), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("kind", "target_id", "reporter_steam_id", name="uq_forum_report_once"),
    )


def downgrade() -> None:
    op.drop_table("forum_reports")
    op.drop_table("hidden_games")
    with op.batch_alter_table("cached_game_details") as batch:
        batch.drop_column("is_adult")
    with op.batch_alter_table("cached_library_entries") as batch:
        batch.drop_column("last_played")
