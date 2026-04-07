"""
Handles offer searches and best store recommendations.
Features 3 and 4 from the product spec.
"""
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.offer import Offer
from app.models.store import Store
from app.models.user import User

logger = logging.getLogger(__name__)

CHAIN_DISPLAY = {
    "extrabom": "Extrabom",
    "atacadao": "Atacadão",
    "carone": "Carone",
    "assai": "Assaí",
}


async def handle_offer_search(entities: dict, user: User, db: AsyncSession) -> str:
    """List active offers, optionally filtered by store chain."""
    store_filter = entities.get("store_filter")
    today = datetime.now(timezone.utc).date()

    stmt = (
        select(Offer, Store)
        .join(Store, Offer.store_id == Store.id)
        .where(Offer.valid_until >= today)
        .where(Store.active == True)
        .order_by(Store.chain, Offer.discount_pct.desc().nullslast())
        .limit(20)
    )

    if store_filter:
        stmt = stmt.where(Store.chain == store_filter.lower())

    result = await db.execute(stmt)
    rows = result.all()

    if not rows:
        chain_name = CHAIN_DISPLAY.get(store_filter, store_filter) if store_filter else "nenhuma rede"
        return (
            f"Não encontrei ofertas ativas"
            f"{' do ' + chain_name if store_filter else ''} no momento 😔\n\n"
            "As promoções são atualizadas semanalmente. Volta mais tarde! 💚"
        )

    # Group by store
    stores_offers: dict[str, list] = {}
    for offer, store in rows:
        key = store.name
        if key not in stores_offers:
            stores_offers[key] = {"chain": store.chain, "offers": []}
        stores_offers[key]["offers"].append(offer)

    lines = []
    if store_filter:
        chain_name = CHAIN_DISPLAY.get(store_filter, store_filter)
        lines.append(f"🏪 *Ofertas do {chain_name}* — hoje\n")
    else:
        lines.append("🔥 *Ofertas ativas* — hoje\n")

    for store_name, data in list(stores_offers.items())[:3]:  # max 3 stores
        lines.append(f"📍 *{store_name}*")
        for offer in data["offers"][:6]:  # max 6 offers per store
            name = offer.product_name_raw or "Produto"
            disc = f" (-{offer.discount_pct:.0f}%)" if offer.discount_pct else ""
            lines.append(f"  • {name} — *R$ {offer.offer_price:.2f}*{disc}")
        lines.append("")

    lines.append("_Quer ver preço de algum produto específico?_ 😊")

    return "\n".join(lines)


async def handle_best_store(entities: dict, user: User, db: AsyncSession) -> str:
    """Tell user which store chain generally has the best prices today."""
    today = datetime.now(timezone.utc).date()

    result = await db.execute(
        select(Store).where(Store.active == True).order_by(Store.chain)
    )
    stores = result.scalars().all()

    if not stores:
        return "Ainda estou carregando os dados dos mercados da sua região 😅\nTenta de novo em alguns minutos!"

    # Count active offers per chain as a proxy for "value"
    offer_counts: dict[str, int] = {}
    for store in stores:
        chain = store.chain
        result = await db.execute(
            select(Offer).where(Offer.store_id == store.id).where(Offer.valid_until >= today)
        )
        count = len(result.scalars().all())
        offer_counts[chain] = offer_counts.get(chain, 0) + count

    lines = ["🏪 *Mercados perto de você*\n"]

    neighborhood = user.neighborhood or "sua região"
    lines.append(f"📍 Mostrando opções em *{neighborhood}*\n")

    sorted_chains = sorted(offer_counts.items(), key=lambda x: x[1], reverse=True)
    medals = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]

    for i, (chain, count) in enumerate(sorted_chains[:4]):
        display = CHAIN_DISPLAY.get(chain, chain.title())
        offer_text = f" — {count} ofertas ativas" if count > 0 else ""
        lines.append(f"{medals[i]} *{display}*{offer_text}")

    lines.append("\n💡 Quer ver as ofertas de algum? Manda o nome! 😊")
    lines.append("_Ex: ofertas do Atacadão_")

    return "\n".join(lines)
