"""Perfiles: público o privado y si se sigue el progreso de logros.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_profiles",
        sa.Column("steam_id", sa.String(32), primary_key=True),
        sa.Column("is_public", sa.Boolean(), nullable=False),
        sa.Column("track_achievements", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_profiles")
