"""
Trip cost calculator — feature 5.
Uses Firestore 'markets' collection for store data.
"""
import logging
import math
from app.core.firebase import get_db, fs_query
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((phi2 - phi1) / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def handle_trip_calc(entities: dict, user: dict, session: dict) -> str:
    store_filter = (
        entities.get("store_filter")
        or (session.get("context") or {}).get("last_store_filter")
    )

    if not store_filter:
        return "Para qual mercado você quer calcular? 🚗\n_Ex: vale ir de carro no Atacadão?_"

    db = get_db()
    markets = await fs_query(
        db.collection("markets")
          .where("chain", "==", store_filter.lower())
          .where("active", "==", True)
          .limit(1)
    )

    if not markets:
        return f"Não encontrei lojas do *{store_filter.title()}* cadastradas 😔"

    store = markets[0]
    fuel_price = float(user.get("fuel_price") or settings.default_fuel_price)
    efficiency = float(settings.default_fuel_efficiency)
    distance_one_way = 5.0  # km default; use haversine if user has location

    distance_roundtrip = distance_one_way * 2
    fuel_cost = (distance_roundtrip / efficiency) * fuel_price

    # Estimate savings from active list
    from app.handlers.list_handler import get_active_list, _get_items
    from app.handlers.price_handler import find_product, get_current_prices

    phone = user["phone"]
    potential_savings = 0.0
    has_list = False

    lst = await get_active_list(phone)
    if lst:
        items = await _get_items(phone, lst["_id"])
        if items:
            has_list = True
            for item in items:
                product = await find_product(item["product_name_raw"])
                if not product:
                    continue
                prices = await get_current_prices(product)
                if not prices:
                    continue
                best_price = prices[0]["price"]
                target_price = next(
                    (p["price"] for p in prices if p["store_chain"] == store_filter.lower()),
                    None
                )
                if target_price is not None:
                    potential_savings += (best_price - target_price) * float(item.get("quantity") or 1)

    v_emoji = {"car": "🚗", "moto": "🛵", "bike": "🚲", "foot": "🚶", "bus": "🚌"}.get(
        user.get("vehicle_type", "car"), "🚗"
    )

    store_name = store.get("name", store_filter.title())
    lines = [f"{v_emoji} *Ir ao {store_name}*\n"]
    lines.append(f"📍 Distância: {distance_one_way:.1f}km (ida e volta: {distance_roundtrip:.1f}km)")
    lines.append(f"⛽ Combustível: *R$ {fuel_cost:.2f}*")

    if has_list and potential_savings != 0:
        net = potential_savings - fuel_cost
        lines.append(f"💰 Economia nos produtos: *R$ {potential_savings:.2f}*")
        if net > 0:
            lines.append(f"\n✅ *VALE A PENA!* Você economiza *R$ {net:.2f}* no total.")
        else:
            lines.append(f"\n❌ *NÃO COMPENSA.* Gastaria *R$ {abs(net):.2f}* a mais.")
            lines.append("_Tem um mercado mais perto que pode ser melhor!_")
    else:
        lines.append("\n💡 Monte sua lista pra calcular se vale a pena 🛒")
        lines.append("_add arroz, feijão, café..._")

    lines.append(f"\n_⛽ R$ {fuel_price:.2f}/L · {efficiency:.0f}km/L_")
    return "\n".join(lines)
