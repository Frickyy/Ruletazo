"""Duración según la comunidad: horas en Steam al marcar un juego como terminado.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "completion_samples",
        sa.Column("steam_id", sa.String(32), primary_key=True),
        sa.Column("appid", sa.Integer(), primary_key=True),
        sa.Column("minutes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_completion_samples_appid", "completion_samples", ["appid"])


def downgrade() -> None:
    op.drop_index("ix_completion_samples_appid", table_name="completion_samples")
    op.drop_table("completion_samples")
