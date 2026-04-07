"""
User profile and preference management — features 13 & 14.
Uses users/{phone} document and preferences collection.
"""
import logging
from app.core.firebase import get_db, fs_update, fs_query

logger = logging.getLogger(__name__)

VEHICLE_EMOJI = {"car": "🚗", "moto": "🛵", "bike": "🚲", "foot": "🚶", "bus": "🚌"}
VEHICLE_ALIASES = {
    "carro": "car", "caro": "car",
    "moto": "moto", "motoca": "moto",
    "bicicleta": "bike", "bike": "bike", "bici": "bike",
    "onibus": "bus", "ônibus": "bus",
    "a pe": "foot", "a pé": "foot", "pe": "foot",
}


async def handle_preference_set(entities: dict, user: dict, session: dict) -> str:
    phone = user["phone"]
    pref_type = entities.get("preference_type")
    pref_value = str(entities.get("preference_value") or "").strip()

    if not pref_type:
        return (
            "Qual preferência você quer definir? 😊\n\n"
            "• _moro no bairro Serra_\n"
            "• _tenho carro_\n"
            "• _prefiro o Atacadão_"
        )

    db = get_db()
    ref = db.collection("users").document(phone)
    message = ""

    if pref_type == "neighborhood":
        await fs_update(ref, {"neighborhood": pref_value.title()})
        message = f"📍 Anotado! Seu bairro é *{pref_value.title()}* 😊"

    elif pref_type == "vehicle":
        vehicle_key = VEHICLE_ALIASES.get(pref_value.lower(), "car")
        await fs_update(ref, {"vehicle_type": vehicle_key})
        emoji = VEHICLE_EMOJI.get(vehicle_key, "🚗")
        message = f"{emoji} Anotado! Você se locomove de *{pref_value.lower()}* 😊"

    elif pref_type == "store":
        prefs = user.get("preferences") or {}
        prefs["favorite_store"] = pref_value.lower()
        await fs_update(ref, {"preferences": prefs})
        message = f"🏪 Anotado! Seu mercado favorito é *{pref_value.title()}* 😊"

    elif pref_type == "budget":
        try:
            budget = float(pref_value.replace("R$", "").replace(",", ".").strip())
            prefs = user.get("preferences") or {}
            prefs["monthly_budget"] = budget
            await fs_update(ref, {"preferences": prefs})
            message = f"💰 Anotado! Seu orçamento mensal é *R$ {budget:.2f}* 😊"
        except ValueError:
            return "Não entendi o valor. Manda assim:\n_meu orçamento é R$ 500_"
    else:
        return "Não entendi qual preferência definir 🤔\n_Ex: moro no Serra / tenho carro / prefiro o Atacadão_"

    return message + "\n\nPode mudar quando quiser! 🔄"


async def handle_profile_view(user: dict, session: dict) -> str:
    phone = user["phone"]
    prefs = user.get("preferences") or {}

    # Count events
    try:
        db = get_db()
        events = await fs_query(
            db.collection("integration_events")
              .where("user_phone", "==", phone)
              .limit(200)
        )
        interaction_count = len(events)
    except Exception:
        interaction_count = 0

    lines = ["👤 *O que eu sei sobre você:*\n"]

    neighborhood = user.get("neighborhood")
    lines.append(f"📍 Bairro: *{neighborhood}*" if neighborhood else "📍 Bairro: _não informado_")

    if prefs.get("favorite_store"):
        lines.append(f"🏪 Mercado favorito: *{prefs['favorite_store'].title()}*")

    vehicle = user.get("vehicle_type")
    if vehicle:
        emoji = VEHICLE_EMOJI.get(vehicle, "🚗")
        lines.append(f"{emoji} Transporte: *{vehicle.title()}*")

    if prefs.get("monthly_budget"):
        lines.append(f"💰 Orçamento mensal: *R$ {float(prefs['monthly_budget']):.2f}*")

    lines.append(f"\n📦 Interações registradas: *{interaction_count}*")

    name = user.get("name")
    if name:
        lines.append(f"👋 Nome: *{name}*")

    lines.append("\n_Quer corrigir alguma info? É só me falar!_ 😊")
    return "\n".join(lines)
