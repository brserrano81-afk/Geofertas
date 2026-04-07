"""
Spending analytics handler.
Feature 10 from the product spec.
"""
import logging
from datetime import datetime, timezone
from calendar import month_name
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.analytics_event import AnalyticsEvent
from app.models.receipt import Receipt, ReceiptItem
from app.models.user import User

logger = logging.getLogger(__name__)

MONTH_PT = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
    5: "maio", 6: "junho", 7: "julho", 8: "agosto",
    9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}


async def handle_analytics(entities: dict, user: User, db: AsyncSession) -> str:
    """Show spending summary for current or specified month."""
    now = datetime.now(timezone.utc)
    month = now.month
    year = now.year

    # Query receipts for the month
    result = await db.execute(
        select(Receipt)
        .where(Receipt.user_id == user.id)
        .where(Receipt.status == "processed")
        .where(func.extract("month", Receipt.purchased_at) == month)
        .where(func.extract("year", Receipt.purchased_at) == year)
        .order_by(Receipt.purchased_at.desc())
    )
    receipts = result.scalars().all()

    if not receipts:
        return (
            f"📊 Ainda não tenho cupons do *{MONTH_PT[month]}* seus registrados 😔\n\n"
            "Me manda a foto do cupom depois das compras que eu analiso pra você! 📸"
        )

    total = sum(float(r.total_amount or 0) for r in receipts)

    # Category breakdown from receipt items
    cat_result = await db.execute(
        select(ReceiptItem)
        .where(ReceiptItem.receipt_id.in_([r.id for r in receipts]))
    )
    items = cat_result.scalars().all()

    # Simple category aggregation
    category_totals: dict[str, float] = {}
    for item in items:
        if item.total_price:
            cat = "outros"  # TODO: join with products for category
            category_totals[cat] = category_totals.get(cat, 0) + float(item.total_price)

    lines = [f"📊 *Seus gastos — {MONTH_PT[month]} {year}*\n"]
    lines.append(f"💰 Total: *R$ {total:.2f}*")
    lines.append(f"🛒 Compras no mês: *{len(receipts)} {'vez' if len(receipts) == 1 else 'vezes'}*")

    if category_totals:
        lines.append("\n*Maiores gastos:*")
        for cat, val in sorted(category_totals.items(), key=lambda x: x[1], reverse=True)[:5]:
            lines.append(f"• {cat.title()}: R$ {val:.2f}")

    # Savings from analytics events
    savings_result = await db.execute(
        select(func.sum(AnalyticsEvent.savings_amount))
        .where(AnalyticsEvent.user_id == user.id)
        .where(func.extract("month", AnalyticsEvent.created_at) == month)
        .where(func.extract("year", AnalyticsEvent.created_at) == year)
        .where(AnalyticsEvent.savings_amount.isnot(None))
    )
    total_savings = savings_result.scalar() or 0

    if total_savings > 0:
        lines.append(f"\n✅ *Economia estimada: R$ {float(total_savings):.2f}* 💚")

    lines.append("\n_Quer detalhar por categoria? Me pergunta!_")
    return "\n".join(lines)
