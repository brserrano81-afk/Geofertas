"""
Handles price lookup and brand comparison queries.
Features 1 and 2 from the product spec.
"""
import logging
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from app.models.product import Product
from app.models.store import Store
from app.models.price import Price
from app.models.offer import Offer
from app.models.user import User

logger = logging.getLogger(__name__)

CATEGORY_EMOJI = {
    "carnes": "🥩",
    "mercearia": "🛒",
    "bebidas": "🍺",
    "laticinios": "🥛",
    "padaria": "🍞",
    "higiene": "🧴",
    "limpeza": "🧹",
    "hortifruti": "🥦",
}

STALE_DAYS = 14  # warn if price is older than this


async def find_product(db: AsyncSession, product_query: str) -> Product | None:
    """Fuzzy-match a product by name or alias using pg_trgm similarity."""
    if not product_query:
        return None

    query_lower = product_query.lower().strip()

    # First try exact alias match
    result = await db.execute(
        select(Product).where(
            func.lower(Product.name) == query_lower
        )
    )
    product = result.scalar_one_or_none()
    if product:
        return product

    # Try array contains for aliases
    result = await db.execute(
        select(Product).where(
            Product.aliases.any(func.lower(text("aliases_elem")) == query_lower)
        )
    )

    # Fallback: trigram similarity search
    result = await db.execute(
        text("""
            SELECT id FROM products
            WHERE similarity(lower(name), :q) > 0.2
               OR :q = ANY(SELECT lower(a) FROM unnest(aliases) AS a)
            ORDER BY similarity(lower(name), :q) DESC
            LIMIT 1
        """),
        {"q": query_lower},
    )
    row = result.fetchone()
    if row:
        p = await db.get(Product, row[0])
        return p

    return None


async def get_current_prices(
    db: AsyncSession, product: Product, store_chain: str | None = None
) -> list[dict]:
    """Get the latest price for a product across all (or filtered) stores."""
    # Subquery: latest price per (product, store)
    subq = (
        select(
            Price.store_id,
            func.max(Price.observed_at).label("latest_at"),
        )
        .where(Price.product_id == product.id)
        .group_by(Price.store_id)
        .subquery()
    )

    stmt = (
        select(Price, Store)
        .join(subq, (Price.store_id == subq.c.store_id) & (Price.observed_at == subq.c.latest_at))
        .join(Store, Price.store_id == Store.id)
        .where(Store.active == True)
    )

    if store_chain:
        stmt = stmt.where(Store.chain == store_chain.lower())

    result = await db.execute(stmt.order_by(Price.price.asc()))
    rows = result.all()

    prices = []
    for price, store in rows:
        age_days = (datetime.now(timezone.utc) - price.observed_at.replace(tzinfo=timezone.utc)).days
        prices.append({
            "store_id": str(store.id),
            "store_name": store.name,
            "store_chain": store.chain,
            "neighborhood": store.neighborhood,
            "price": float(price.price),
            "observed_at": price.observed_at.isoformat(),
            "age_days": age_days,
            "is_stale": age_days > STALE_DAYS,
            "source": price.source,
        })

    return prices


async def get_active_offers(db: AsyncSession, product: Product) -> list[dict]:
    """Check if there are active promotional offers for a product."""
    today = datetime.now(timezone.utc).date()
    result = await db.execute(
        select(Offer, Store)
        .join(Store, Offer.store_id == Store.id)
        .where(Offer.product_id == product.id)
        .where(Offer.valid_until >= today)
        .order_by(Offer.offer_price.asc())
    )
    rows = result.all()

    return [
        {
            "store_name": store.name,
            "store_chain": store.chain,
            "offer_price": float(offer.offer_price),
            "regular_price": float(offer.regular_price) if offer.regular_price else None,
            "discount_pct": float(offer.discount_pct) if offer.discount_pct else None,
            "valid_until": offer.valid_until.isoformat(),
        }
        for offer, store in rows
    ]


def format_price_response(
    product: Product,
    prices: list[dict],
    offers: list[dict],
    store_filter: str | None,
    user: User,
) -> str:
    """Build the WhatsApp-formatted price comparison message."""
    emoji = CATEGORY_EMOJI.get(product.category or "", "🛒")

    if not prices:
        store_hint = f" no {store_filter.title()}" if store_filter else ""
        return (
            f"{emoji} *{product.name.upper()}*\n\n"
            f"Ainda não tenho preços{store_hint} cadastrados pra esse produto 😔\n\n"
            "Se souber o preço, me fala que eu registro! 🙏\n"
            "_Ex: café no Extrabom tá R$ 12,90_"
        )

    best = prices[0]
    worst = prices[-1]

    lines = [f"{emoji} *{product.name.upper()}*\n"]

    for i, p in enumerate(prices[:5]):  # max 5 stores
        icon = "🟢" if i == 0 else ("🟡" if i == 1 else "🔴")
        stale_warn = " ⚠️" if p["is_stale"] else ""
        lines.append(f"{icon} *R$ {p['price']:.2f}* – {p['store_name']}{stale_warn}")

    if len(prices) > 1:
        savings = worst["price"] - best["price"]
        lines.append(f"\n💰 Você economiza: *R$ {savings:.2f}*")

    # Highlight active offers
    if offers:
        offer = offers[0]
        disc = f" ({offer['discount_pct']:.0f}% off)" if offer.get("discount_pct") else ""
        lines.append(f"\n🔥 *OFERTA:* R$ {offer['offer_price']:.2f} – {offer['store_name']}{disc}")
        if offer.get("valid_until"):
            lines.append(f"   _Válida até {offer['valid_until']}_")

    # Stale price warning
    if any(p["is_stale"] for p in prices):
        lines.append("\n⚠️ _Alguns preços podem estar desatualizados_")

    lines.append("\nQuer adicionar à sua lista? Manda _sim_ 👍")

    return "\n".join(lines)


async def handle_price_lookup(entities: dict, user: User, db: AsyncSession) -> str:
    """Main handler for price_lookup and price_compare intents."""
    product_query = entities.get("product_normalized") or entities.get("product") or ""
    store_filter = entities.get("store_filter")

    if not product_query:
        return "De qual produto você quer saber o preço? 😊"

    product = await find_product(db, product_query)

    if not product:
        return (
            f"Ainda não tenho *{product_query}* no catálogo 😔\n\n"
            "Me fala o preço e eu cadastro:\n"
            f"_Ex: {product_query} no Extrabom tá R$ XX,XX_"
        )

    prices = await get_current_prices(db, product, store_filter)
    offers = await get_active_offers(db, product)

    return format_price_response(product, prices, offers, store_filter, user)
