"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-04-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable extensions
    op.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("phone", sa.String(20), nullable=False, unique=True),
        sa.Column("name", sa.String(100)),
        sa.Column("neighborhood", sa.String(100)),
        sa.Column("vehicle_type", sa.String(20)),
        sa.Column("fuel_price", sa.Numeric(8, 3)),
        sa.Column("preferences", postgresql.JSONB, server_default="{}"),
        sa.Column("consent_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("active", sa.Boolean, server_default="true"),
    )
    op.create_index("ix_users_phone", "users", ["phone"])

    # sessions
    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("state", sa.String(50), nullable=False, server_default="idle"),
        sa.Column("context", postgresql.JSONB, server_default="{}"),
        sa.Column("last_intent", sa.String(50)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])

    # stores
    op.create_table(
        "stores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("chain", sa.String(50), nullable=False),
        sa.Column("address", sa.String(200)),
        sa.Column("neighborhood", sa.String(100)),
        sa.Column("city", sa.String(100), server_default="Vitória"),
        sa.Column("state", sa.String(2), server_default="ES"),
        sa.Column("latitude", sa.Numeric(10, 7)),
        sa.Column("longitude", sa.Numeric(10, 7)),
        sa.Column("phone", sa.String(20)),
        sa.Column("whatsapp", sa.String(20)),
        sa.Column("active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_stores_chain", "stores", ["chain"])

    # products
    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(50)),
        sa.Column("unit", sa.String(20)),
        sa.Column("barcode", sa.String(50)),
        sa.Column("aliases", postgresql.ARRAY(sa.String)),
        sa.Column("emoji", sa.String(10)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_products_name_trgm", "products", ["name"], postgresql_using="gin",
                    postgresql_ops={"name": "gin_trgm_ops"})

    # prices (append-only)
    op.create_table(
        "prices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("store_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("unit_price", sa.Numeric(10, 4)),
        sa.Column("observed_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("source", sa.String(20), server_default="manual"),
        sa.Column("confirmed_by", sa.Integer, server_default="0"),
    )
    op.create_index("ix_prices_product_store", "prices", ["product_id", "store_id", "observed_at"])

    # offers
    op.create_table(
        "offers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("store_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id")),
        sa.Column("product_name_raw", sa.String(200)),
        sa.Column("regular_price", sa.Numeric(10, 2)),
        sa.Column("offer_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("discount_pct", sa.Numeric(5, 2)),
        sa.Column("valid_from", sa.Date),
        sa.Column("valid_until", sa.Date),
        sa.Column("source_url", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_offers_valid_until", "offers", ["valid_until"])

    # shopping_lists
    op.create_table(
        "shopping_lists",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(100), server_default="Minha Lista"),
        sa.Column("status", sa.String(20), server_default="active"),
        sa.Column("share_token", sa.String(32), unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_lists_user_id", "shopping_lists", ["user_id"])
    op.create_index("ix_lists_share_token", "shopping_lists", ["share_token"])

    # list_items
    op.create_table(
        "list_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("list_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id")),
        sa.Column("product_name_raw", sa.String(200), nullable=False),
        sa.Column("quantity", sa.Numeric(8, 2), server_default="1"),
        sa.Column("unit", sa.String(20)),
        sa.Column("checked", sa.Boolean, server_default="false"),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_list_items_list_id", "list_items", ["list_id"])

    # receipts
    op.create_table(
        "receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("store_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("stores.id")),
        sa.Column("store_name_raw", sa.String(200)),
        sa.Column("total_amount", sa.Numeric(10, 2)),
        sa.Column("purchased_at", sa.DateTime(timezone=True)),
        sa.Column("image_url", sa.String(500)),
        sa.Column("ocr_raw", sa.Text),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # receipt_items
    op.create_table(
        "receipt_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("receipt_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("receipts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id")),
        sa.Column("product_name_raw", sa.String(200), nullable=False),
        sa.Column("quantity", sa.Numeric(8, 2)),
        sa.Column("unit_price", sa.Numeric(10, 2)),
        sa.Column("total_price", sa.Numeric(10, 2)),
    )
    op.create_index("ix_receipt_items_receipt_id", "receipt_items", ["receipt_id"])

    # analytics_events
    op.create_table(
        "analytics_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("payload", postgresql.JSONB, server_default="{}"),
        sa.Column("savings_amount", sa.Numeric(10, 2)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_events_user_date", "analytics_events", ["user_id", "created_at"])
    op.create_index("ix_events_type", "analytics_events", ["event_type"])


def downgrade() -> None:
    op.drop_table("analytics_events")
    op.drop_table("receipt_items")
    op.drop_table("receipts")
    op.drop_table("list_items")
    op.drop_table("shopping_lists")
    op.drop_table("offers")
    op.drop_table("prices")
    op.drop_table("products")
    op.drop_table("stores")
    op.drop_table("sessions")
    op.drop_table("users")
