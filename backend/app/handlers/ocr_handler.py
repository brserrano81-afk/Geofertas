"""
Receipt OCR handler using Claude Sonnet Vision.
Feature 9 from the product spec.
Runs as a background task to avoid blocking the webhook response.
"""
import base64
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.models.receipt import Receipt, ReceiptItem
from app.models.price import Price
from app.models.store import Store
from app.models.product import Product
from app.services.claude_client import analyze_receipt_image
from app.services.evolution_client import get_evolution_client
from app.handlers.price_handler import find_product

logger = logging.getLogger(__name__)


async def handle_receipt_queued(
    user: User, image_data: bytes, db: AsyncSession
) -> str:
    """
    Immediate response when user sends a receipt photo.
    The actual OCR runs in background.
    Returns a quick acknowledgment message.
    """
    # Create a pending receipt record
    image_b64 = base64.b64encode(image_data).decode("utf-8")

    receipt = Receipt(
        user_id=user.id,
        status="pending",
        ocr_raw=image_b64,  # Store temporarily; will be replaced with URL
    )
    db.add(receipt)
    await db.flush()

    return (
        "📷 *Cupom recebido!* Processando...\n\n"
        "⏳ Aguarda uns 30 segundos que eu analiso tudo!\n"
        "_Vou te mandar os detalhes em seguida_ 😊"
    )


async def process_receipt_background(
    receipt_id: str,
    user_phone: str,
    image_data: bytes,
    media_type: str = "image/jpeg",
) -> None:
    """
    Background task: OCR the receipt and send result to user.
    Called from the webhook handler via FastAPI BackgroundTasks.
    """
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            image_b64 = base64.b64encode(image_data).decode("utf-8")

            # Run Claude Vision OCR
            ocr_result = await analyze_receipt_image(image_b64, media_type)

            async with db.begin():
                # Load receipt
                receipt = await db.get(Receipt, receipt_id)
                if not receipt:
                    logger.error(f"Receipt {receipt_id} not found for OCR")
                    return

                if not ocr_result:
                    receipt.status = "failed"
                    evolution = get_evolution_client()
                    await evolution.send_message(
                        user_phone,
                        "😔 Não consegui ler o cupom. Pode tirar uma foto mais nítida e de frente? 📸"
                    )
                    return

                # Save OCR data to receipt
                receipt.store_name_raw = ocr_result.get("store_name")
                receipt.total_amount = ocr_result.get("total")
                receipt.ocr_raw = str(ocr_result)
                receipt.status = "processed"

                if ocr_result.get("purchase_date"):
                    try:
                        receipt.purchased_at = datetime.fromisoformat(ocr_result["purchase_date"])
                    except Exception:
                        receipt.purchased_at = datetime.now(timezone.utc)

                # Find store
                if ocr_result.get("store_chain") and ocr_result["store_chain"] != "outro":
                    store_result = await db.execute(
                        select(Store)
                        .where(Store.chain == ocr_result["store_chain"])
                        .limit(1)
                    )
                    store = store_result.scalar_one_or_none()
                    if store:
                        receipt.store_id = store.id

                # Save receipt items and update prices
                items_saved = 0
                price_updates = 0
                items = ocr_result.get("items", [])

                for item_data in items:
                    if not item_data.get("product_name_raw"):
                        continue

                    ri = ReceiptItem(
                        receipt_id=receipt.id,
                        product_name_raw=item_data["product_name_raw"],
                        quantity=item_data.get("quantity", 1),
                        unit_price=item_data.get("unit_price"),
                        total_price=item_data.get("total_price"),
                    )

                    # Try to match product for price crowdsourcing
                    normalized = item_data.get("product_normalized", item_data["product_name_raw"])
                    product = await find_product(db, normalized)
                    if product and receipt.store_id and item_data.get("unit_price"):
                        ri.product_id = product.id
                        # Add price observation
                        db.add(Price(
                            product_id=product.id,
                            store_id=receipt.store_id,
                            price=item_data["unit_price"],
                            source="ocr",
                        ))
                        price_updates += 1

                    db.add(ri)
                    items_saved += 1

            # Send result to user
            msg = _build_ocr_response(ocr_result, items_saved, price_updates, receipt)
            evolution = get_evolution_client()
            await evolution.send_message(user_phone, msg)

        except Exception as e:
            logger.error(f"Receipt OCR background task failed: {e}", exc_info=True)
            evolution = get_evolution_client()
            await evolution.send_message(
                user_phone,
                "😔 Tive um problema ao processar o cupom. Tenta de novo mais tarde!"
            )


def _build_ocr_response(ocr_result: dict, items_count: int, price_updates: int, receipt: Receipt) -> str:
    """Build the WhatsApp message with receipt analysis results."""
    store_name = ocr_result.get("store_name", "Mercado")
    total = ocr_result.get("total", 0)
    date_str = ocr_result.get("purchase_date", "")

    if date_str:
        try:
            dt = datetime.fromisoformat(date_str)
            date_formatted = dt.strftime("%d/%m/%Y")
        except Exception:
            date_formatted = date_str
    else:
        date_formatted = datetime.now().strftime("%d/%m/%Y")

    lines = [f"🧾 *{store_name.upper()}* — {date_formatted}\n"]

    if total:
        lines.append(f"💰 Total: *R$ {float(total):.2f}*")

    if items_count > 0:
        lines.append(f"📦 Itens processados: *{items_count}*")

    if price_updates > 0:
        lines.append(f"✅ *{price_updates} preços atualizados* no banco de dados!")
        lines.append("_Obrigado por contribuir!_ 💚")

    lines.append("\n_Manda_ *quanto gastei esse mês* _pra ver seu resumo!_ 📊")
    return "\n".join(lines)
