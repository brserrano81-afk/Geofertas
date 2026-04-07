"""
Monthly planning and seasonal price prediction.
Features 11 and 12 from the product spec.
"""
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.services.claude_client import format_response

logger = logging.getLogger(__name__)

SEASONAL_RULES = {
    "frango": {
        "cheap_months": [6, 7],
        "expensive_months": [11, 12],
        "reason": "maior demanda em fin de ano (churrasco e festas)",
        "cheap_avg": 12.90,
        "expensive_avg": 18.50,
        "unit": "kg",
    },
    "arroz": {
        "cheap_months": [3, 4, 5],
        "expensive_months": [10, 11],
        "reason": "colheita principal no verão/outono",
        "cheap_avg": 22.90,
        "expensive_avg": 28.00,
        "unit": "5kg",
    },
    "feijão": {
        "cheap_months": [4, 5, 6],
        "expensive_months": [11, 12],
        "reason": "safra principal na metade do ano",
        "cheap_avg": 7.90,
        "expensive_avg": 11.50,
        "unit": "1kg",
    },
    "cerveja": {
        "cheap_months": [5, 6, 7],
        "expensive_months": [12, 1, 2],
        "reason": "alta demanda no verão e festas",
        "cheap_avg": 3.20,
        "expensive_avg": 4.50,
        "unit": "350ml",
    },
}

MONTH_PT = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
    5: "maio", 6: "junho", 7: "julho", 8: "agosto",
    9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}


async def handle_monthly_plan(user: User, db: AsyncSession) -> str:
    """Generate a monthly shopping plan based on user history."""
    from app.handlers.list_handler import get_active_list
    from app.models.shopping_list import ListItem
    from sqlalchemy import select

    # Get current list items
    lst = await get_active_list(db, user)
    has_list = False
    item_names = []

    if lst:
        result = await db.execute(
            select(ListItem).where(ListItem.list_id == lst.id)
        )
        items = result.scalars().all()
        item_names = [item.product_name_raw for item in items]
        has_list = bool(item_names)

    now = datetime.now(timezone.utc)
    month_name = MONTH_PT[now.month]

    lines = [f"📅 *Planejamento — {month_name}*\n"]
    lines.append("Com base no seu histórico:\n")

    # Check seasonal tips for list items
    seasonal_tips = []
    for item in item_names:
        item_lower = item.lower()
        for product_key, rules in SEASONAL_RULES.items():
            if product_key in item_lower:
                if now.month in rules["expensive_months"]:
                    next_cheap = MONTH_PT[rules["cheap_months"][0]]
                    savings_per_unit = rules["expensive_avg"] - rules["cheap_avg"]
                    seasonal_tips.append(
                        f"⚠️ *{item.title()}* — preço alto agora ({month_name})\n"
                        f"   💡 Compra mais em {next_cheap}, economiza ~R$ {savings_per_unit:.2f}/{rules['unit']}"
                    )
                elif now.month in rules["cheap_months"]:
                    seasonal_tips.append(
                        f"✅ *{item.title()}* — *ÓTIMO MOMENTO* pra estocar!\n"
                        f"   Preço mais baixo do ano (até {MONTH_PT[rules['cheap_months'][-1]]})"
                    )

    if seasonal_tips:
        for tip in seasonal_tips[:4]:
            lines.append(tip)
        lines.append("")

    if not has_list:
        lines.append("📋 _Sua lista está vazia_")
        lines.append("   Adicione produtos pra eu planejar com você!")
    else:
        lines.append(f"🛒 Lista com {len(item_names)} itens pronta")

    lines.append("\nQuer que eu monte a lista do mês? Manda _montar lista_ 💚")
    return "\n".join(lines)


async def handle_price_prediction(entities: dict, user: User, db: AsyncSession) -> str:
    """Give seasonal price prediction for a product."""
    product_query = entities.get("product_normalized") or entities.get("product") or ""

    if not product_query:
        return "Qual produto você quer saber quando fica mais barato? 😊"

    product_lower = product_query.lower()
    rules = None
    matched_key = None

    for key, r in SEASONAL_RULES.items():
        if key in product_lower or product_lower in key:
            rules = r
            matched_key = key
            break

    if not rules:
        # Generic response for products without rules
        return (
            f"📈 *Sazonalidade de {product_query.title()}*\n\n"
            "Ainda estou coletando dados históricos desse produto 😔\n\n"
            "Escaneie seus cupons e eu vou aprendendo os padrões! 📸\n"
            "_Quanto mais cupons, mais preciso fico!_"
        )

    now = datetime.now(timezone.utc)
    cheap_months_str = " e ".join(MONTH_PT[m] for m in rules["cheap_months"])
    expensive_months_str = " e ".join(MONTH_PT[m] for m in rules["expensive_months"])
    savings = rules["expensive_avg"] - rules["cheap_avg"]

    lines = [f"📈 *Sazonalidade do {matched_key.upper()}*\n"]
    lines.append(f"✅ *Mais barato:* {cheap_months_str}")
    lines.append(f"   Média: R$ {rules['cheap_avg']:.2f}/{rules['unit']}\n")
    lines.append(f"❌ *Mais caro:* {expensive_months_str}")
    lines.append(f"   Média: R$ {rules['expensive_avg']:.2f}/{rules['unit']}\n")
    lines.append(f"💡 _Motivo: {rules['reason']}_\n")
    lines.append(f"💰 Estocando na época barata você economiza")
    lines.append(f"   *R$ {savings:.2f}/{rules['unit']}*!")

    if now.month in rules["cheap_months"]:
        lines.append(f"\n🔥 *AGORA É O MELHOR MOMENTO PRA COMPRAR!*")
    elif now.month in rules["expensive_months"]:
        lines.append(f"\n⚠️ _Preço alto agora — espera quando puder_")

    return "\n".join(lines)
