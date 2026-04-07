from sqlalchemy import Column, DateTime, Numeric, String, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


class Price(Base):
    __tablename__ = "prices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True)
    store_id = Column(UUID(as_uuid=True), ForeignKey("stores.id"), nullable=False, index=True)
    price = Column(Numeric(10, 2), nullable=False)
    unit_price = Column(Numeric(10, 4))  # price per base unit (per kg, per L)
    observed_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    source = Column(String(20), default="manual")  # manual/scraper/ocr/user
    confirmed_by = Column(Integer, default=0)
