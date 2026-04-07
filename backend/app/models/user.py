from sqlalchemy import Column, String, DateTime, Numeric, JSON, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(100))
    neighborhood = Column(String(100))
    vehicle_type = Column(String(20))  # car/moto/bike/foot/bus
    fuel_price = Column(Numeric(8, 3))
    preferences = Column(JSON, default=dict)
    consent_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    active = Column(Boolean, default=True)
