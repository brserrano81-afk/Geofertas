from sqlalchemy import Column, String, DateTime, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    category = Column(String(50))   # carnes/mercearia/laticinios/bebidas/limpeza/higiene/hortifruti/padaria
    unit = Column(String(20))       # kg/L/un/cx/pct/dz
    barcode = Column(String(50))
    aliases = Column(ARRAY(String))  # gírias e variações aceitas
    emoji = Column(String(10))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
