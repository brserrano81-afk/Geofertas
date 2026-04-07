"""
Routes classified intents to the appropriate domain handler.
No longer needs a DB session — all handlers use Firestore directly.
"""
import logging

logger = logging.getLogger(__name__)


async def route_intent(
    intent_result: dict,
    user: dict,
    session: dict,
    image_data: bytes | None = None,
) -> str:
    intent = intent_result.get("intent", "unknown")
    entities = intent_result.get("entities") or {}
    clarification = intent_result.get("clarification_needed")

    if clarification:
        return f"❓ {clarification}"

    if intent in ("price_lookup", "price_compare"):
        from app.handlers.price_handler import handle_price_lookup
        return await handle_price_lookup(entities, user, session)

    elif intent == "offer_search":
        from app.handlers.offer_handler import handle_offer_search
        return await handle_offer_search(entities, user, session)

    elif intent == "best_store":
        from app.handlers.offer_handler import handle_best_store
        return await handle_best_store(entities, user, session)

    elif intent == "trip_calc":
        from app.handlers.trip_calculator import handle_trip_calc
        return await handle_trip_calc(entities, user, session)

    elif intent == "list_add":
        from app.handlers.list_handler import handle_list_add
        return await handle_list_add(entities, user, session)

    elif intent == "list_remove":
        from app.handlers.list_handler import handle_list_remove
        return await handle_list_remove(entities, user, session)

    elif intent == "list_clear":
        from app.handlers.list_handler import handle_list_clear
        return await handle_list_clear(user, session)

    elif intent == "list_view":
        from app.handlers.list_handler import handle_list_view
        return await handle_list_view(user, session)

    elif intent == "list_optimize":
        from app.handlers.list_handler import handle_list_optimize
        return await handle_list_optimize(user, session)

    elif intent == "list_share":
        from app.handlers.list_handler import handle_list_share
        return await handle_list_share(user, session)

    elif intent == "receipt_ocr":
        if image_data:
            from app.handlers.ocr_handler import handle_receipt_queued
            return await handle_receipt_queued(user, image_data, session)
        return "📸 Pode me mandar a foto do cupom fiscal! Vou analisar pra você 😊"

    elif intent == "analytics_view":
        from app.handlers.analytics_handler import handle_analytics
        return await handle_analytics(entities, user, session)

    elif intent == "monthly_plan":
        from app.handlers.planning_handler import handle_monthly_plan
        return await handle_monthly_plan(user, session)

    elif intent == "price_prediction":
        from app.handlers.planning_handler import handle_price_prediction
        return await handle_price_prediction(entities, user, session)

    elif intent == "preference_set":
        from app.handlers.profile_handler import handle_preference_set
        return await handle_preference_set(entities, user, session)

    elif intent == "profile_view":
        from app.handlers.profile_handler import handle_profile_view
        return await handle_profile_view(user, session)

    elif intent == "help":
        return _help_message()

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
