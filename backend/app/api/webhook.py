"""
Main WhatsApp webhook endpoint.
Receives all messages from Evolution API and processes them through the pipeline.
No SQLAlchemy — uses Firestore via firebase-admin.
"""
import logging
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from app.schemas.whatsapp import EvolutionWebhookPayload
from app.pipeline.session_manager import (
    get_or_create_user,
    get_or_create_session,
    add_message_to_context,
    update_session_state,
    save_session,
)
from app.services.evolution_client import get_evolution_client
from app.services.claude_client import classify_intent
from app.pipeline.intent_router import route_intent

logger = logging.getLogger(__name__)
router = APIRouter()

CONSENT_MESSAGE = (
    "👋 Olá! Bem-vindo(a) ao *EconomizaFacil.IA* 💚\n\n"
    "Comparo preços do *Extrabom, Atacadão e Carone* aqui na Grande Vitória "
    "pra você economizar em cada compra!\n\n"
    "⚠️ _Antes de continuar, preciso da sua autorização para armazenar suas "
    "interações e melhorar suas próximas consultas. Seus dados nunca são vendidos._\n\n"
    "Responde *sim* para aceitar e começarmos! 😊"
)


@router.post("/webhook/whatsapp")
async def whatsapp_webhook(request: Request, background_tasks: BackgroundTasks):
    """Entry point for all Evolution API webhook events."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    payload = EvolutionWebhookPayload(**body)

    if payload.event != "messages.upsert":
        return {"status": "ignored", "event": payload.event}

    phone = payload.get_phone()
    if not phone:
        return {"status": "ignored", "reason": "no_phone_or_outbound"}

    text = payload.get_text()
    is_image = payload.is_image()
    push_name = payload.get_push_name()

    if not text and not is_image:
        return {"status": "ignored", "reason": "no_text_or_image"}

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
    """Full message processing pipeline — runs as background task."""
    evolution = get_evolution_client()
    await evolution.send_typing(phone)

    try:
        # 1. Load/create user and session from Firestore
        user = await get_or_create_user(phone, push_name)
        session = await get_or_create_session(phone)

        # 2. LGPD consent check on first interaction
        if not user.get("consent_at"):
            reply = await _handle_consent(phone, text, user)
            if reply:
                await evolution.send_message(phone, reply)
            return

        # 3. Download image if present
        image_data: bytes | None = None
        if is_image:
            payload_obj = EvolutionWebhookPayload(**raw_payload)
            media_url = payload_obj.get_media_url()
            if media_url:
                image_data = await evolution.download_media(media_url)

        # 4. Add user message to rolling context
        if text:
            await add_message_to_context(session, "user", text)

        # 5. Classify intent with Claude Haiku
        if image_data and not text:
            intent_result = {
                "intent": "receipt_ocr",
                "entities": {},
                "confidence": 1.0,
                "requires_location": False,
                "clarification_needed": None,
            }
        elif text:
            intent_result = await classify_intent(text, session.get("context") or {})
        else:
            return

        # 6. Route to domain handler
        if image_data:
            reply = await route_intent(intent_result, user, session, image_data)
            # Schedule OCR background processing
            if intent_result["intent"] == "receipt_ocr":
                import asyncio
                from app.handlers.ocr_handler import process_receipt_background
                media_type = (
                    raw_payload.get("data", {})
                    .get("message", {})
                    .get("imageMessage", {})
                    .get("mimetype", "image/jpeg")
                )
                asyncio.create_task(
                    process_receipt_background(phone, image_data, media_type)
                )
        else:
            reply = await route_intent(intent_result, user, session)

        # 7. Update session context with bot reply
        await add_message_to_context(session, "bot", reply[:200])
        await update_session_state(
            session,
            state="idle",
            intent=intent_result.get("intent"),
            extra_context={
                "last_store_filter": intent_result.get("entities", {}).get("store_filter"),
                "last_product": intent_result.get("entities", {}).get("product_normalized"),
            },
        )
        await save_session(phone, session)

        # 8. Send reply
        if reply:
            await evolution.send_message(phone, reply)

    except Exception as e:
        logger.error(f"Error processing message from {phone}: {e}", exc_info=True)
        await evolution.send_message(
            phone,
            "😅 Tive um probleminha técnico. Tenta de novo em alguns segundos!"
        )


async def _handle_consent(phone: str, text: str | None, user: dict) -> str | None:
    """
    Handle LGPD first-message consent flow.
    Returns a reply string, or None if consent was just granted (no extra reply needed).
    """
    from datetime import datetime, timezone
    from app.core.firebase import get_db, fs_update

    if text and text.strip().lower() in ("sim", "s", "yes", "aceito", "ok", "pode", "claro"):
        ref = get_db().collection("users").document(phone)
        await fs_update(ref, {"consent_at": datetime.now(timezone.utc).isoformat()})
        return (
            "✅ *Ótimo! Vamos economizar juntos!* 💚\n\n"
            "Pode me perguntar sobre qualquer produto!\n"
            "_Ex: quanto tá o arroz? / add leite na lista_\n\n"
            "Manda _ajuda_ pra ver tudo que posso fazer! 😊"
        )
    else:
        return CONSENT_MESSAGE
