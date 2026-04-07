from sqlalchemy import Column, String, DateTime, Numeric, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    payload = Column(JSON, default=dict)
    savings_amount = Column(Numeric(10, 2))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
