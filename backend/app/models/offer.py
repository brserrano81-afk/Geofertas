from sqlalchemy import Column, String, DateTime, Numeric, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


class Offer(Base):
    __tablename__ = "offers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    store_id = Column(UUID(as_uuid=True), ForeignKey("stores.id"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), index=True)
    product_name_raw = Column(String(200))
    regular_price = Column(Numeric(10, 2))
    offer_price = Column(Numeric(10, 2), nullable=False)
    discount_pct = Column(Numeric(5, 2))
    valid_from = Column(Date)
    valid_until = Column(Date, index=True)
    source_url = Column(String(500))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
