"""
Calculates whether it's worth driving to a specific store.
Feature 5 from the product spec.
"""
import logging
import math
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.store import Store
from app.models.user import User
from app.models.session import ConversationSession
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km between two lat/lon points."""
    R = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def handle_trip_calc(
    entities: dict, user: User, session: ConversationSession, db: AsyncSession
) -> str:
    """Calculate if it's worth driving/riding to a store."""
    store_filter = entities.get("store_filter")

    if not store_filter:
        # Check last context
        ctx = session.context or {}
        store_filter = ctx.get("last_store_filter")

    if not store_filter:
        return (
            "Para qual mercado você quer calcular? 🚗\n\n"
            "_Ex: vale ir de carro no Atacadão?_"
        )

    # Find closest store of that chain
    result = await db.execute(
        select(Store)
        .where(Store.chain == store_filter.lower())
        .where(Store.active == True)
    )
    stores = result.scalars().all()

    if not stores:
        return f"Não encontrei lojas do *{store_filter.title()}* cadastradas 😔"

    # If user has location, find closest store
    # For now, use the first store (TODO: use user.neighborhood to find closest)
    target_store = stores[0]

    # Fuel cost calculation
    fuel_price = float(user.fuel_price or settings.default_fuel_price)
    efficiency = float(settings.default_fuel_efficiency)  # km/L

    # Default distance if no lat/lon available (approx 5km for GV metropolitan area)
    distance_one_way = 5.0

    if target_store.latitude and target_store.longitude:
        # TODO: use user's saved location for precise distance
        distance_one_way = 5.0  # placeholder

    distance_roundtrip = distance_one_way * 2
    fuel_cost = (distance_roundtrip / efficiency) * fuel_price

    # Get savings from list optimizer
    from app.handlers.list_handler import get_active_list
    from app.handlers.price_handler import find_product, get_current_prices
    from app.models.shopping_list import ListItem

    potential_savings = 0.0
    has_list = False

    lst = await get_active_list(db, user)
    if lst:
        items_result = await db.execute(
            select(ListItem).where(ListItem.list_id == lst.id)
        )
        items = items_result.scalars().all()

        if items:
            has_list = True
            store_prices: dict[str, float] = {}

            for item in items:
                product = await find_product(db, item.product_name_raw)
                if not product:
                    continue
                prices = await get_current_prices(db, product)
                if not prices:
                    continue

                # Best price anywhere
                best_price = prices[0]["price"]
                # Price at target store
                target_price = next(
                    (p["price"] for p in prices if p["store_chain"] == store_filter.lower()),
                    None
                )
                if target_price is not None:
                    potential_savings += (best_price - target_price) * float(item.quantity or 1)

    vehicle = user.vehicle_type or "car"
    vehicle_emoji = {"car": "🚗", "moto": "🛵", "bike": "🚲", "foot": "🚶", "bus": "🚌"}.get(vehicle, "🚗")

    lines = [f"{vehicle_emoji} *Ir ao {target_store.name}*\n"]
    lines.append(f"📍 Distância: {distance_one_way:.1f}km (ida e volta: {distance_roundtrip:.1f}km)")
    lines.append(f"⛽ Combustível: *R$ {fuel_cost:.2f}*")

    if has_list and potential_savings != 0:
        if potential_savings > 0:
            net = potential_savings - fuel_cost
            lines.append(f"💰 Economia nos produtos: *R$ {potential_savings:.2f}*")
            if net > 0:
                lines.append(f"\n✅ *VALE A PENA!*")
                lines.append(f"Você economiza *R$ {net:.2f}* no total.")
            else:
                lines.append(f"\n❌ *NÃO COMPENSA*")
                lines.append(f"Você gastaria *R$ {abs(net):.2f}* a mais.")
                lines.append(f"_Tem um mercado mais perto que pode ser melhor!_")
        else:
            lines.append(f"\n⚠️ Não encontrei preços suficientes para calcular a economia.")
    else:
        lines.append(f"\n💡 Para calcular se vale a pena, primeiro monte sua lista 🛒")
        lines.append(f"_add arroz, feijão, café..._")

    lines.append(f"\n_Combustível: R$ {fuel_price:.2f}/L • {efficiency:.0f}km/L_")

    return "\n".join(lines)
