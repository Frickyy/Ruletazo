"""Formulario de feedback.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-19
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feedback",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("steam_name", sa.String(100), nullable=True),
        sa.Column("steam_id", sa.String(32), nullable=True),
        sa.Column("page", sa.String(200), nullable=True),
        sa.Column("emailed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_feedback_steam_id", "feedback", ["steam_id"])


def downgrade() -> None:
    op.drop_index("ix_feedback_steam_id", table_name="feedback")
    op.drop_table("feedback")
