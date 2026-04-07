from sqlalchemy import Column, String, DateTime, Numeric, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


class Receipt(Base):
    __tablename__ = "receipts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    store_id = Column(UUID(as_uuid=True), ForeignKey("stores.id"))
    store_name_raw = Column(String(200))
    total_amount = Column(Numeric(10, 2))
    purchased_at = Column(DateTime(timezone=True))
    image_url = Column(String(500))
    ocr_raw = Column(Text)
    status = Column(String(20), default="pending")  # pending/processed/failed
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ReceiptItem(Base):
    __tablename__ = "receipt_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    receipt_id = Column(UUID(as_uuid=True), ForeignKey("receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"))
    product_name_raw = Column(String(200), nullable=False)
    quantity = Column(Numeric(8, 2))
    unit_price = Column(Numeric(10, 2))
    total_price = Column(Numeric(10, 2))
