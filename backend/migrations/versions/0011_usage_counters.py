"""Contadores anónimos de uso por día (visitas, giros, perfiles cargados…).

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "usage_counters",
        sa.Column("day", sa.String(10), primary_key=True),
        sa.Column("event", sa.String(32), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("usage_counters")
