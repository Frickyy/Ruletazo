"""Salas para elegir a qué jugar en grupo.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rooms",
        sa.Column("code", sa.String(12), primary_key=True),
        sa.Column("host_steam_id", sa.String(32), nullable=False),
        sa.Column("pool", sa.JSON(), nullable=False),
        sa.Column("members", sa.JSON(), nullable=False),
        sa.Column("vetoes", sa.JSON(), nullable=False),
        sa.Column("spin_id", sa.Integer(), nullable=False),
        sa.Column("spin_appid", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_rooms_host_steam_id", "rooms", ["host_steam_id"])


def downgrade() -> None:
    op.drop_index("ix_rooms_host_steam_id", table_name="rooms")
    op.drop_table("rooms")
