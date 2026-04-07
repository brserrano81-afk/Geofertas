"""
Main WhatsApp webhook endpoint.
Receives all messages from Evolution API and processes them through the pipeline.
"""
import logging
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from app.schemas.whatsapp import EvolutionWebhookPayload
from app.core.database import AsyncSessionLocal
from app.pipeline.session_manager import (
    get_or_create_user,
    get_or_create_session,
    add_message_to_context,
    update_session_state,
)
from app.services.evolution_client import get_evolution_client
from app.services.claude_client import classify_intent
from app.pipeline.intent_router import route_intent

logger = logging.getLogger(__name__)
router = APIRouter()

CONSENT_MESSAGE = (
    "👋 Olá! Bem-vindo(a) ao *EconomizaFacil.IA* 💚\n\n"
    "Vou te ajudar a economizar no mercado comparando preços do\n"
    "*Extrabom, Atacadão e Carone* aqui na Grande Vitória!\n\n"
    "⚠️ _Antes de continuar, preciso da sua autorização para armazenar suas interações "
    "e ajudar nos seus próximos pedidos. Seus dados nunca são vendidos._\n\n"
    "Responde *sim* para aceitar e começarmos! 😊\n"
    "_Pode me perguntar sobre qualquer produto!_"
)


@router.post("/webhook/whatsapp")
async def whatsapp_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Main entry point for all Evolution API webhook events.
    Only processes incoming text messages and images.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    payload = EvolutionWebhookPayload(**body)

    # Only process incoming messages (not status updates, etc.)
    if payload.event != "messages.upsert":
        return {"status": "ignored", "event": payload.event}

    phone = payload.get_phone()
    if not phone:
        return {"status": "ignored", "reason": "no_phone_or_outbound"}

    text = payload.get_text()
    is_image = payload.is_image()
    push_name = payload.get_push_name()

    # We need at least text or image
    if not text and not is_image:
        return {"status": "ignored", "reason": "no_text_or_image"}

    # Process message asynchronously but respond to webhook immediately
    background_tasks.add_task(
        _process_message,
        phone=phone,
        text=text,
        is_image=is_image,
        push_name=push_name,
        raw_payload=body,
    )

    return {"status": "queued"}


async def _process_message(
    phone: str,
    text: str | None,
    is_image: bool,
    push_name: str | None,
    raw_payload: dict,
) -> None:
    """
    Full message processing pipeline.
    Runs as a background task to return HTTP 200 to Evolution API quickly.
    """
    evolution = get_evolution_client()

    # Send typing indicator immediately (< 200ms perceived latency)
    await evolution.send_typing(phone)

    async with AsyncSessionLocal() as db:
        try:
            # 1. Load/create user and session
            user = await get_or_create_user(db, phone, push_name)
            session = await get_or_create_session(db, user)

            # 2. Handle first-time users (LGPD consent)
            if not user.consent_at:
                # Check if they're responding to consent prompt
                if text and text.strip().lower() in ("sim", "s", "yes", "aceito", "ok", "pode"):
                    from datetime import datetime, timezone
                    user.consent_at = datetime.now(timezone.utc)
                    await db.commit()
                    reply = (
                        "✅ *Ótimo! Vamos economizar juntos!* 💚\n\n"
                        "Pode me perguntar sobre qualquer produto!\n"
                        "_Ex: quanto tá o arroz? / add leite na lista_\n\n"
                        "Manda _ajuda_ pra ver tudo que posso fazer! 😊"
                    )
                else:
                    await db.commit()
                    await evolution.send_message(phone, CONSENT_MESSAGE)
                    return
            else:
                reply = None

            if reply is None:
                # 3. Handle image (receipt OCR)
                image_data = None
                if is_image:
                    payload = EvolutionWebhookPayload(**raw_payload)
                    media_url = payload.get_media_url()
                    if media_url:
                        image_data = await evolution.download_media(media_url)

                # 4. Add user message to context
                if text:
                    await add_message_to_context(session, "user", text)

                # 5. Classify intent (Claude Haiku)
                if image_data and not text:
                    # Pure image: treat as receipt scan
                    intent_result = {
                        "intent": "receipt_ocr",
                        "entities": {},
                        "confidence": 1.0,
                        "requires_location": False,
                        "clarification_needed": None,
                    }
                elif text:
                    intent_result = await classify_intent(text, session.context or {})
                else:
                    await db.commit()
                    return

                # 6. Route to handler
                if image_data:
                    # For OCR, schedule actual processing as separate background task
                    from app.handlers.ocr_handler import process_receipt_background
                    import asyncio
                    reply = await route_intent(intent_result, user, session, db, image_data)
                    await db.flush()
                    receipt_id = None
                    # Find the just-created receipt
                    from sqlalchemy import select
                    from app.models.receipt import Receipt
                    result = await db.execute(
                        select(Receipt)
                        .where(Receipt.user_id == user.id)
                        .where(Receipt.status == "pending")
                        .order_by(Receipt.created_at.desc())
                        .limit(1)
                    )
                    r = result.scalar_one_or_none()
                    if r:
                        receipt_id = str(r.id)
                        media_type = raw_payload.get("data", {}).get("message", {}).get("imageMessage", {}).get("mimetype", "image/jpeg")
                        asyncio.create_task(
                            process_receipt_background(receipt_id, phone, image_data, media_type)
                        )
                else:
                    reply = await route_intent(intent_result, user, session, db)

                # 7. Update session with bot reply context
                await add_message_to_context(session, "bot", reply[:200])  # truncate for context
                await update_session_state(
                    session,
                    state="idle",
                    intent=intent_result.get("intent"),
                    extra_context={
                        "last_store_filter": intent_result.get("entities", {}).get("store_filter"),
                        "last_product": intent_result.get("entities", {}).get("product_normalized"),
                    },
                )

            # 8. Commit DB changes
            await db.commit()

            # 9. Send reply to user
            if reply:
                await evolution.send_message(phone, reply)

        except Exception as e:
            logger.error(f"Error processing message from {phone}: {e}", exc_info=True)
            await db.rollback()
            # Send a generic error message so user isn't left hanging
            await evolution.send_message(
                phone,
                "😅 Tive um probleminha técnico. Tenta de novo em alguns segundos!"
            )
