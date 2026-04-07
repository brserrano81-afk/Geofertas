"""
User profile and preference management.
Features 13 and 14 from the product spec.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.user import User
from app.models.analytics_event import AnalyticsEvent

logger = logging.getLogger(__name__)

VEHICLE_EMOJI = {
    "car": "🚗",
    "moto": "🛵",
    "bike": "🚲",
    "foot": "🚶",
    "bus": "🚌",
}

VEHICLE_ALIASES = {
    "carro": "car", "caro": "car",
    "moto": "moto", "motoca": "moto",
    "bicicleta": "bike", "bike": "bike", "bici": "bike",
    "onibus": "bus", "ônibus": "bus", "bus": "bus",
    "a pe": "foot", "a pé": "foot", "pe": "foot",
}


async def handle_preference_set(entities: dict, user: User, db: AsyncSession) -> str:
    """Store user preferences: neighborhood, vehicle, budget, favorite store."""
    pref_type = entities.get("preference_type")
    pref_value = entities.get("preference_value") or ""

    if not pref_type:
        return (
            "Qual preferência você quer definir? 😊\n\n"
            "• _moro no bairro Serra_\n"
            "• _tenho carro_\n"
            "• _prefiro o Atacadão_"
        )

    message = ""

    if pref_type == "neighborhood":
        user.neighborhood = pref_value.title()
        message = f"📍 Anotado! Seu bairro é *{pref_value.title()}* 😊"

    elif pref_type == "vehicle":
        vehicle_key = VEHICLE_ALIASES.get(pref_value.lower(), "car")
        user.vehicle_type = vehicle_key
        emoji = VEHICLE_EMOJI.get(vehicle_key, "🚗")
        message = f"{emoji} Anotado! Você se locomove de *{pref_value.lower()}* 😊"

    elif pref_type == "store":
        prefs = user.preferences or {}
        prefs["favorite_store"] = pref_value.lower()
        user.preferences = prefs
        message = f"🏪 Anotado! Seu mercado favorito é *{pref_value.title()}* 😊"

    elif pref_type == "budget":
        try:
            budget = float(pref_value.replace("R$", "").replace(",", ".").strip())
            prefs = user.preferences or {}
            prefs["monthly_budget"] = budget
            user.preferences = prefs
            message = f"💰 Anotado! Seu orçamento mensal é *R$ {budget:.2f}* 😊"
        except ValueError:
            return "Não entendi o valor do orçamento. Manda assim:\n_meu orçamento é R$ 500_"
    else:
        return "Não entendi qual preferência definir 🤔\n_Tenta: moro no Serra / tenho carro / prefiro o Atacadão_"

    return message + "\n\nPode mudar quando quiser! 🔄"


async def handle_profile_view(user: User, db: AsyncSession) -> str:
    """Show what the bot knows about the user."""
    prefs = user.preferences or {}

    # Count interactions
    result = await db.execute(
        select(func.count(AnalyticsEvent.id)).where(AnalyticsEvent.user_id == user.id)
    )
    interaction_count = result.scalar() or 0

    lines = ["👤 *O que eu sei sobre você:*\n"]

    if user.neighborhood:
        lines.append(f"📍 Bairro: *{user.neighborhood}*")
    else:
        lines.append("📍 Bairro: _não informado_")

    if prefs.get("favorite_store"):
        lines.append(f"🏪 Mercado favorito: *{prefs['favorite_store'].title()}*")

    if user.vehicle_type:
        emoji = VEHICLE_EMOJI.get(user.vehicle_type, "🚗")
        lines.append(f"{emoji} Transporte: *{user.vehicle_type.title()}*")

    if prefs.get("monthly_budget"):
        lines.append(f"💰 Orçamento mensal: *R$ {float(prefs['monthly_budget']):.2f}*")

    lines.append(f"\n📦 Interações registradas: *{interaction_count}*")

    if user.name:
        lines.append(f"👋 Nome: *{user.name}*")

    lines.append("\n_Quer corrigir alguma info? É só me falar!_ 😊")
    return "\n".join(lines)
