"""Páginas "¿Cuánto dura…?": un juego por fila, con su dirección y los tiempos de IGDB.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "duration_pages",
        sa.Column("appid", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("quick_hours", sa.Float(), nullable=True),
        sa.Column("full_hours", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(op.f("ix_duration_pages_slug"), "duration_pages", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_duration_pages_slug"), table_name="duration_pages")
    op.drop_table("duration_pages")
