"""
Spending analytics — feature 10.
Uses users/{phone}/receipts and integration_events collections.
"""
import logging
from datetime import datetime, timezone
from app.core.firebase import get_db, fs_query

logger = logging.getLogger(__name__)

MONTH_PT = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
    5: "maio", 6: "junho", 7: "julho", 8: "agosto",
    9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}


async def handle_analytics(entities: dict, user: dict, session: dict) -> str:
    phone = user["phone"]
    now = datetime.now(timezone.utc)
    month_name = MONTH_PT[now.month]

    # Build month start/end strings for date filtering
    month_start = f"{now.year}-{now.month:02d}-01"
    if now.month == 12:
        month_end = f"{now.year + 1}-01-01"
    else:
        month_end = f"{now.year}-{now.month + 1:02d}-01"

    db = get_db()

    # Fetch processed receipts for this month
    try:
        receipts = await fs_query(
            db.collection("users").document(phone)
              .collection("receipts")
              .where("status", "==", "processed")
              .where("purchased_at", ">=", month_start)
              .where("purchased_at", "<", month_end)
              .order_by("purchased_at", direction="DESCENDING")
        )
    except Exception:
        receipts = []

    if not receipts:
        return (
            f"📊 Ainda não tenho cupons do *{month_name}* seus registrados 😔\n\n"
            "Me manda a foto do cupom depois das compras que eu analiso pra você! 📸"
        )

    total = sum(float(r.get("total_amount") or 0) for r in receipts)
    lines = [f"📊 *Seus gastos — {month_name} {now.year}*\n"]
    lines.append(f"💰 Total: *R$ {total:.2f}*")
    lines.append(f"🛒 Compras no mês: *{len(receipts)} {'vez' if len(receipts) == 1 else 'vezes'}*")

    # Savings from integration_events
    try:
        events = await fs_query(
            db.collection("integration_events")
              .where("user_phone", "==", phone)
              .where("created_at", ">=", month_start)
              .where("created_at", "<", month_end)
        )
        total_savings = sum(float(e.get("savings_amount") or 0) for e in events if e.get("savings_amount"))
        if total_savings > 0:
            lines.append(f"\n✅ *Economia estimada: R$ {total_savings:.2f}* 💚")
    except Exception:
        pass

    lines.append("\n_Quer detalhar mais? Me pergunta!_")
    return "\n".join(lines)


async def log_event(phone: str, event_type: str, payload: dict = None, savings: float = None) -> None:
    """Fire-and-forget analytics event logger."""
    try:
        db = get_db()
        data = {
            "user_phone": phone,
            "event_type": event_type,
            "payload": payload or {},
            "savings_amount": savings,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        import asyncio
        await asyncio.to_thread(lambda: db.collection("integration_events").add(data))
    except Exception as e:
        logger.debug(f"Failed to log event {event_type}: {e}")
