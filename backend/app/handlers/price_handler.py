"""
Handles price lookup and brand comparison — features 1 & 2.
Queries Firestore collections: products, products/{id}/latestPrices, offers, markets.
"""
import logging
from datetime import datetime, timezone
from app.core.firebase import get_db, fs_query, fs_get

logger = logging.getLogger(__name__)

CATEGORY_EMOJI = {
    "carnes": "🥩", "mercearia": "🛒", "bebidas": "🍺",
    "laticinios": "🥛", "padaria": "🍞", "higiene": "🧴",
    "limpeza": "🧹", "hortifruti": "🥦",
}
STALE_DAYS = 14


async def find_product(product_query: str) -> dict | None:
    """
    Find a product by name or alias using Firestore.
    1. Try array_contains on 'aliases' field
    2. Try case-insensitive name match in code
    """
    if not product_query:
        return None

    db = get_db()
    query_lower = product_query.lower().strip()

    # 1. Alias array-contains match (exact)
    results = await fs_query(
        db.collection("products").where("aliases", "array_contains", query_lower)
    )
    if results:
        return results[0]

    # 2. Fetch all products and do substring match in code (fallback)
    all_products = await fs_query(db.collection("products"))
    for p in all_products:
        name = (p.get("name") or "").lower()
        aliases = [a.lower() for a in (p.get("aliases") or [])]
        if query_lower in name or name in query_lower:
            return p
        if any(query_lower in a or a in query_lower for a in aliases):
            return p

    return None


async def get_current_prices(product: dict, store_chain: str | None = None) -> list[dict]:
    """
    Get latest price per store for a product.
    Uses products/{id}/latestPrices subcollection (one doc per store_id).
    Falls back to markets collection for store names.
    """
    db = get_db()
    product_id = product.get("_id") or product.get("id", "")

    # Fetch from latestPrices subcollection
    price_docs = await fs_query(
        db.collection("products").document(product_id).collection("latestPrices")
    )

    if not price_docs:
        return []

    # Load all markets once for name lookup
    markets = await fs_query(db.collection("markets").where("active", "==", True))
    market_map = {m.get("_id"): m for m in markets}

    prices = []
    now = datetime.now(timezone.utc)

    for p in price_docs:
        store_id = p.get("store_id") or p.get("_id")
        store = market_map.get(store_id) or {}
        chain = store.get("chain", "")

        if store_chain and chain.lower() != store_chain.lower():
            continue

        observed_raw = p.get("observed_at") or p.get("updatedAt")
        age_days = 0
        if observed_raw:
            try:
                if hasattr(observed_raw, "timestamp"):
                    observed_dt = datetime.fromtimestamp(observed_raw.timestamp(), tz=timezone.utc)
                else:
                    observed_dt = datetime.fromisoformat(str(observed_raw).replace("Z", "+00:00"))
                age_days = (now - observed_dt).days
            except Exception:
                pass

        prices.append({
            "store_id": store_id,
            "store_name": store.get("name", chain.title()),
            "store_chain": chain,
            "neighborhood": store.get("neighborhood", ""),
            "price": float(p.get("price", 0)),
            "age_days": age_days,
            "is_stale": age_days > STALE_DAYS,
            "source": p.get("source", "manual"),
        })

    return sorted(prices, key=lambda x: x["price"])


async def get_active_offers(product: dict) -> list[dict]:
    """Get active promotional offers for a product from 'offers' collection."""
    db = get_db()
    product_id = product.get("_id") or product.get("id", "")
    today_str = datetime.now(timezone.utc).date().isoformat()

    # Try offers collection first, then ofertas_v2
    for collection in ("offers", "ofertas_v2"):
        try:
            results = await fs_query(
                db.collection(collection)
                  .where("product_id", "==", product_id)
                  .where("valid_until", ">=", today_str)
                  .order_by("valid_until")
                  .order_by("offer_price")
                  .limit(5)
            )
            if results:
                return results
        except Exception:
            continue

    return []


def _format_price_response(
    product: dict, prices: list[dict], offers: list[dict], store_filter: str | None
) -> str:
    """Build WhatsApp-formatted price comparison message."""
    category = product.get("category", "mercearia")
    emoji = CATEGORY_EMOJI.get(category, "🛒")
    name = product.get("name", "Produto").upper()

    if not prices:
        store_hint = f" no {store_filter.title()}" if store_filter else ""
        return (
            f"{emoji} *{name}*\n\n"
            f"Ainda não tenho preços{store_hint} cadastrados 😔\n\n"
            "Se souber o preço, me fala que eu registro! 🙏\n"
            "_Ex: café no Extrabom tá R$ 12,90_"
        )

    lines = [f"{emoji} *{name}*\n"]
    icons = ["🟢", "🟡", "🔴", "🔴", "🔴"]

    for i, p in enumerate(prices[:5]):
        icon = icons[min(i, len(icons) - 1)]
        warn = " ⚠️" if p["is_stale"] else ""
        lines.append(f"{icon} *R$ {p['price']:.2f}* – {p['store_name']}{warn}")

    if len(prices) > 1:
        savings = prices[-1]["price"] - prices[0]["price"]
        lines.append(f"\n💰 Você economiza: *R$ {savings:.2f}*")

    if offers:
        o = offers[0]
        disc = f" ({float(o.get('discount_pct', 0)):.0f}% off)" if o.get("discount_pct") else ""
        store_name = o.get("store_name") or o.get("store_id", "")
        lines.append(f"\n🔥 *OFERTA:* R$ {float(o.get('offer_price', 0)):.2f} – {store_name}{disc}")
        if o.get("valid_until"):
            lines.append(f"   _Válida até {o['valid_until']}_")

    if any(p["is_stale"] for p in prices):
        lines.append("\n⚠️ _Alguns preços podem estar desatualizados_")

    lines.append("\nQuer adicionar à sua lista? Manda _sim_ 👍")
    return "\n".join(lines)


async def handle_price_lookup(entities: dict, user: dict, session: dict) -> str:
    """Main handler for price_lookup and price_compare intents."""
    product_query = entities.get("product_normalized") or entities.get("product") or ""
    store_filter = entities.get("store_filter")

    if not product_query:
        return "De qual produto você quer saber o preço? 😊"

    product = await find_product(product_query)

    if not product:
        return (
            f"Ainda não tenho *{product_query}* no catálogo 😔\n\n"
            "Me fala o preço e eu cadastro:\n"
            f"_Ex: {product_query} no Extrabom tá R$ XX,XX_"
        )

    prices, offers = await _gather_price_data(product, store_filter)
    return _format_price_response(product, prices, offers, store_filter)


async def _gather_price_data(product: dict, store_filter: str | None):
    """Fetch prices and offers concurrently."""
    import asyncio
    prices, offers = await asyncio.gather(
        get_current_prices(product, store_filter),
        get_active_offers(product),
    )
    return prices, offers
