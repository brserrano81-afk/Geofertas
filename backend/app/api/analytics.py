"""REST API for analytics data — used by the React dashboard."""
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.firebase import get_db, fs_query

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("/summary")
async def get_summary():
    """Overall platform metrics for the dashboard."""
    now = datetime.now(timezone.utc)
    month_start = f"{now.year}-{now.month:02d}-01"
    if now.month == 12:
        month_end = f"{now.year + 1}-01-01"
    else:
        month_end = f"{now.year}-{now.month + 1:02d}-01"

    db = get_db()

    # Total users (count users collection)
    users = await asyncio.to_thread(
        lambda: list(db.collection("users").limit(1000).stream())
    )
    total_users = len(users)

    # Monthly receipts processed
    receipts_query = (
        db.collection_group("receipts")
          .where("status", "==", "processed")
          .where("purchased_at", ">=", month_start)
          .where("purchased_at", "<", month_end)
    )
    try:
        monthly_receipt_docs = await asyncio.to_thread(
            lambda: list(receipts_query.stream())
        )
        monthly_receipts = len(monthly_receipt_docs)
    except Exception:
        monthly_receipts = 0

    # Monthly savings and price lookups from integration_events
    try:
        events = await fs_query(
            db.collection("integration_events")
              .where("created_at", ">=", month_start)
              .where("created_at", "<", month_end)
        )
        total_savings = sum(
            float(e.get("savings_amount") or 0)
            for e in events
            if e.get("savings_amount")
        )
        monthly_lookups = sum(
            1 for e in events if e.get("event_type") == "price_lookup"
        )
    except Exception:
        total_savings = 0.0
        monthly_lookups = 0

    # All-time price lookups
    try:
        all_lookups = await fs_query(
            db.collection("integration_events")
              .where("event_type", "==", "price_lookup")
              .limit(10000)
        )
        total_lookups = len(all_lookups)
    except Exception:
        total_lookups = monthly_lookups

    return {
        "total_users": total_users,
        "monthly_receipts": monthly_receipts,
        "monthly_savings": round(total_savings, 2),
        "total_price_lookups": total_lookups,
    }


@router.get("/events/recent")
async def get_recent_events(limit: int = 50):
    """Recent analytics events for the live dashboard."""
    db = get_db()
    try:
        events = await fs_query(
            db.collection("integration_events")
              .order_by("created_at", direction="DESCENDING")
              .limit(limit)
        )
    except Exception:
        events = []

    return [
        {
            "id": e["_id"],
            "event_type": e.get("event_type", ""),
            "user_phone": e.get("user_phone", ""),
            "savings_amount": float(e["savings_amount"]) if e.get("savings_amount") else None,
            "created_at": e.get("created_at", ""),
        }
        for e in events
    ]
