"""Esquema inicial: caché de bibliotecas y juegos, favoritos y foro.

Es el esquema que ya tenían las bases creadas antes de usar Alembic. Esas bases se marcan
con esta revisión sin ejecutarla (ver app/db/migrations.py); una base nueva la crea desde cero.

Revision ID: 0001
Revises:
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cached_library_entries",
        sa.Column("steam_id", sa.String(32), primary_key=True),
        sa.Column("appid", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("playtime_forever_minutes", sa.Integer(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "cached_game_details",
        sa.Column("appid", sa.Integer(), primary_key=True),
        sa.Column("genres", sa.JSON(), nullable=False),
        sa.Column("short_description", sa.Text(), nullable=False),
        sa.Column("developer", sa.String(255), nullable=False),
        sa.Column("price_cents", sa.Integer(), nullable=True),
        sa.Column("release_date", sa.String(32), nullable=False),
        sa.Column("store_metadata_version", sa.Integer(), nullable=False),
        sa.Column("review_score_desc", sa.String(64), nullable=False),
        sa.Column("review_total", sa.Integer(), nullable=False),
        sa.Column("review_positive", sa.Integer(), nullable=False),
        sa.Column("featured_reviews", sa.JSON(), nullable=False),
        sa.Column("review_pros", sa.Text(), nullable=False),
        sa.Column("review_cons", sa.Text(), nullable=False),
        sa.Column("reviews_version", sa.Integer(), nullable=False),
        sa.Column("hltb_main_hours", sa.Float(), nullable=True),
        sa.Column("hltb_completionist_hours", sa.Float(), nullable=True),
        sa.Column("hltb_version", sa.Integer(), nullable=False),
        sa.Column("achievement_total", sa.Integer(), nullable=False),
        sa.Column("achievement_avg_percent", sa.Float(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "favorite_games",
        sa.Column("steam_id", sa.String(32), primary_key=True),
        sa.Column("appid", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "forum_reviews",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("appid", sa.Integer(), nullable=False, index=True),
        sa.Column("game_name", sa.String(255), nullable=False),
        sa.Column("steam_id", sa.String(32), nullable=False, index=True),
        sa.Column("author_name", sa.String(64), nullable=False),
        sa.Column("author_avatar", sa.String(512), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("appid", "steam_id", name="uq_forum_review_author"),
    )
    op.create_table(
        "forum_threads",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("appid", sa.Integer(), nullable=False, index=True),
        sa.Column("game_name", sa.String(255), nullable=False),
        sa.Column("steam_id", sa.String(32), nullable=False, index=True),
        sa.Column("author_name", sa.String(64), nullable=False),
        sa.Column("author_avatar", sa.String(512), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False, index=True),
    )
    op.create_table(
        "forum_posts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "thread_id", sa.Integer(), sa.ForeignKey("forum_threads.id", ondelete="CASCADE"), nullable=False, index=True
        ),
        sa.Column("steam_id", sa.String(32), nullable=False, index=True),
        sa.Column("author_name", sa.String(64), nullable=False),
        sa.Column("author_avatar", sa.String(512), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    for table in (
        "forum_posts",
        "forum_threads",
        "forum_reviews",
        "favorite_games",
        "cached_game_details",
        "cached_library_entries",
    ):
        op.drop_table(table)
