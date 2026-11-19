"""Invalidar sesiones abiertas al borrar los datos de un usuario.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("user_profiles") as batch:
        batch.add_column(sa.Column("sessions_valid_after", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("user_profiles") as batch:
        batch.drop_column("sessions_valid_after")
