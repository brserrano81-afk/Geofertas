"""
Routes classified intents to the appropriate domain handler.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.models.session import ConversationSession

logger = logging.getLogger(__name__)


async def route_intent(
    intent_result: dict,
    user: User,
    session: ConversationSession,
    db: AsyncSession,
    image_data: bytes | None = None,
) -> str:
    """
    Dispatch to the correct handler based on classified intent.
    Returns the formatted WhatsApp message string.
    """
    intent = intent_result.get("intent", "unknown")
    entities = intent_result.get("entities", {})
    clarification = intent_result.get("clarification_needed")

    # If Claude says clarification is needed, ask it
    if clarification:
        return f"❓ {clarification}"

    # Import handlers lazily to avoid circular imports
    if intent in ("price_lookup", "price_compare"):
        from app.handlers.price_handler import handle_price_lookup
        return await handle_price_lookup(entities, user, db)

    elif intent == "offer_search":
        from app.handlers.offer_handler import handle_offer_search
        return await handle_offer_search(entities, user, db)

    elif intent == "best_store":
        from app.handlers.offer_handler import handle_best_store
        return await handle_best_store(entities, user, db)

    elif intent == "trip_calc":
        from app.handlers.trip_calculator import handle_trip_calc
        return await handle_trip_calc(entities, user, session, db)

    elif intent == "list_add":
        from app.handlers.list_handler import handle_list_add
        return await handle_list_add(entities, user, db)

    elif intent == "list_remove":
        from app.handlers.list_handler import handle_list_remove
        return await handle_list_remove(entities, user, session, db)

    elif intent == "list_clear":
        from app.handlers.list_handler import handle_list_clear
        return await handle_list_clear(user, db)

    elif intent == "list_view":
        from app.handlers.list_handler import handle_list_view
        return await handle_list_view(user, db)

    elif intent == "list_optimize":
        from app.handlers.list_handler import handle_list_optimize
        return await handle_list_optimize(user, db)

    elif intent == "list_share":
        from app.handlers.list_handler import handle_list_share
        return await handle_list_share(user, db)

    elif intent == "receipt_ocr":
        if image_data:
            from app.handlers.ocr_handler import handle_receipt_queued
            return await handle_receipt_queued(user, image_data, db)
        else:
            return "📸 Pode me mandar a foto do cupom fiscal! Vou analisar pra você 😊"

    elif intent == "analytics_view":
        from app.handlers.analytics_handler import handle_analytics
        return await handle_analytics(entities, user, db)

    elif intent == "monthly_plan":
        from app.handlers.planning_handler import handle_monthly_plan
        return await handle_monthly_plan(user, db)

    elif intent == "price_prediction":
        from app.handlers.planning_handler import handle_price_prediction
        return await handle_price_prediction(entities, user, db)

    elif intent in ("preference_set",):
        from app.handlers.profile_handler import handle_preference_set
        return await handle_preference_set(entities, user, db)

    elif intent == "profile_view":
        from app.handlers.profile_handler import handle_profile_view
        return await handle_profile_view(user, db)

    elif intent == "help":
        return _help_message()

    else:
        return _fallback_message()


def _help_message() -> str:
    return (
        "💚 *EconomizaFacil — o que posso fazer:*\n\n"
        "🔍 *Preços:* quanto tá o arroz?\n"
        "🏪 *Ofertas:* promoções do Extrabom\n"
        "🛒 *Lista:* add leite e feijão\n"
        "🧾 *Cupom:* me manda foto do cupom\n"
        "🚗 *Carro:* vale ir no Atacadão?\n"
        "📊 *Gastos:* quanto gastei esse mês\n\n"
        "_Pode escrever do jeito que quiser!_ 😊"
    )


def _fallback_message() -> str:
    return (
        "Não entendi muito bem 😅\n\n"
        "Tenta assim:\n"
        "• _quanto tá o café?_\n"
        "• _add arroz na lista_\n"
        "• _promoções do Atacadão_\n\n"
        "Ou manda _ajuda_ pra ver tudo! 💚"
    )
