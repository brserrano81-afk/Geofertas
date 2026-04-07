"""
Offer search and best-store recommendations — features 3 & 4.
Uses Firestore collections: offers, ofertas_v2, markets.
"""
import logging
from datetime import datetime, timezone
from app.core.firebase import get_db, fs_query

logger = logging.getLogger(__name__)

CHAIN_DISPLAY = {
    "extrabom": "Extrabom", "atacadao": "Atacadão",
    "carone": "Carone", "assai": "Assaí", "casagrande": "Casagrande",
}


async def _get_active_offers(store_chain: str | None = None, limit: int = 30) -> list[dict]:
    """Fetch active offers from 'offers' or 'ofertas_v2' collection."""
    db = get_db()
    today_str = datetime.now(timezone.utc).date().isoformat()

    for collection in ("offers", "ofertas_v2", "ofertas_completas"):
        try:
            q = db.collection(collection).where("valid_until", ">=", today_str).limit(limit)
            results = await fs_query(q)
            if results:
                if store_chain:
                    results = [r for r in results if r.get("store_chain", "").lower() == store_chain.lower()
                               or r.get("chain", "").lower() == store_chain.lower()]
                return results
        except Exception as e:
            logger.debug(f"Collection {collection} query failed: {e}")
            continue

    return []


async def handle_offer_search(entities: dict, user: dict, session: dict) -> str:
    store_filter = entities.get("store_filter")
    offers = await _get_active_offers(store_filter, limit=25)

    if not offers:
        chain_name = CHAIN_DISPLAY.get(store_filter, store_filter) if store_filter else ""
        return (
            f"Não encontrei ofertas ativas"
            f"{' do ' + chain_name if chain_name else ''} no momento 😔\n\n"
            "As promoções são atualizadas semanalmente. Volta mais tarde! 💚"
        )

    # Group by store
    stores_offers: dict[str, list] = {}
    for offer in offers:
        key = (
            offer.get("store_name")
            or CHAIN_DISPLAY.get(offer.get("store_chain", ""), "")
            or offer.get("store_id", "Mercado")
        )
        stores_offers.setdefault(key, []).append(offer)

    chain_label = CHAIN_DISPLAY.get(store_filter, store_filter) if store_filter else ""
    header = f"🏪 *Ofertas do {chain_label}*" if chain_label else "🔥 *Ofertas ativas*"
    lines = [f"{header} — hoje\n"]

    for store_name, store_offers in list(stores_offers.items())[:3]:
        lines.append(f"📍 *{store_name}*")
        for o in store_offers[:6]:
            name = o.get("product_name_raw") or o.get("name") or "Produto"
            price = float(o.get("offer_price") or o.get("price") or 0)
            disc = f" (-{float(o['discount_pct']):.0f}%)" if o.get("discount_pct") else ""
            lines.append(f"  • {name} — *R$ {price:.2f}*{disc}")
        lines.append("")

    lines.append("_Quer ver o preço de um produto específico?_ 😊")
    return "\n".join(lines)


async def handle_best_store(entities: dict, user: dict, session: dict) -> str:
    """Rank store chains by number of active offers."""
    db = get_db()
    markets = await fs_query(db.collection("markets").where("active", "==", True))

    if not markets:
        return "Ainda estou carregando os dados dos mercados 😅\nTenta de novo em alguns minutos!"

    offers = await _get_active_offers(limit=100)
    offer_counts: dict[str, int] = {}
    for offer in offers:
        chain = offer.get("store_chain") or offer.get("chain") or ""
        if chain:
            offer_counts[chain] = offer_counts.get(chain, 0) + 1

    # Include all chains from markets even if no offers
    for m in markets:
        chain = m.get("chain", "")
        if chain and chain not in offer_counts:
            offer_counts[chain] = 0

    neighborhood = user.get("neighborhood") or "sua região"
    lines = ["🏪 *Mercados perto de você*\n", f"📍 _{neighborhood}_\n"]

    sorted_chains = sorted(offer_counts.items(), key=lambda x: x[1], reverse=True)
    medals = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]

    for i, (chain, count) in enumerate(sorted_chains[:4]):
        display = CHAIN_DISPLAY.get(chain, chain.title())
        offer_text = f" — {count} ofertas ativas" if count > 0 else ""
        lines.append(f"{medals[i]} *{display}*{offer_text}")

    lines.append("\n💡 Quer ver as ofertas? Manda o nome!\n_Ex: ofertas do Atacadão_ 😊")
    return "\n".join(lines)
