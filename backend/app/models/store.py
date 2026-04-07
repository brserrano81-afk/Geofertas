from sqlalchemy import Column, String, DateTime, Numeric, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


class Store(Base):
    __tablename__ = "stores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)       # "Extrabom Jardim Camburi"
    chain = Column(String(50), nullable=False)        # "extrabom" | "atacadao" | "carone"
    address = Column(String(200))
    neighborhood = Column(String(100))
    city = Column(String(100), default="Vitória")
    state = Column(String(2), default="ES")
    latitude = Column(Numeric(10, 7))
    longitude = Column(Numeric(10, 7))
    phone = Column(String(20))
    whatsapp = Column(String(20))
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
