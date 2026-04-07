"""REST API for analytics data — used by the React dashboard."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone
from app.core.database import get_db
from app.models.analytics_event import AnalyticsEvent
from app.models.user import User
from app.models.receipt import Receipt

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db)):
    """Overall platform metrics for the dashboard."""
    now = datetime.now(timezone.utc)

    # Total users
    user_count = await db.execute(select(func.count(User.id)))
    total_users = user_count.scalar() or 0

    # Total receipts processed this month
    receipt_count = await db.execute(
        select(func.count(Receipt.id))
        .where(Receipt.status == "processed")
        .where(func.extract("month", Receipt.created_at) == now.month)
        .where(func.extract("year", Receipt.created_at) == now.year)
    )
    monthly_receipts = receipt_count.scalar() or 0

    # Total savings tracked this month
    savings = await db.execute(
        select(func.sum(AnalyticsEvent.savings_amount))
        .where(AnalyticsEvent.savings_amount.isnot(None))
        .where(func.extract("month", AnalyticsEvent.created_at) == now.month)
        .where(func.extract("year", AnalyticsEvent.created_at) == now.year)
    )
    total_savings = float(savings.scalar() or 0)

    # Total price lookups
    lookups = await db.execute(
        select(func.count(AnalyticsEvent.id))
        .where(AnalyticsEvent.event_type == "price_lookup")
    )
    total_lookups = lookups.scalar() or 0

    return {
        "total_users": total_users,
        "monthly_receipts": monthly_receipts,
        "monthly_savings": round(total_savings, 2),
        "total_price_lookups": total_lookups,
    }


@router.get("/events/recent")
async def get_recent_events(limit: int = 50, db: AsyncSession = Depends(get_db)):
    """Recent analytics events for the live dashboard."""
    result = await db.execute(
        select(AnalyticsEvent)
        .order_by(AnalyticsEvent.created_at.desc())
        .limit(limit)
    )
    events = result.scalars().all()

    return [
        {
            "id": str(e.id),
            "event_type": e.event_type,
            "savings_amount": float(e.savings_amount) if e.savings_amount else None,
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]
