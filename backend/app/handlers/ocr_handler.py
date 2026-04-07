"""
Receipt OCR handler — feature 9.
Stores receipts under users/{phone}/receipts.
Runs OCR in background and sends result proactively.
"""
import base64
import logging
from datetime import datetime, timezone
from app.core.firebase import get_db, fs_set, fs_add, fs_batch_set
from app.services.claude_client import analyze_receipt_image
from app.services.evolution_client import get_evolution_client
from app.handlers.price_handler import find_product

logger = logging.getLogger(__name__)


async def handle_receipt_queued(user: dict, image_data: bytes, session: dict) -> str:
    """
    Immediate acknowledgment when user sends a receipt.
    Creates a pending receipt document in Firestore.
    Returns the ack message; OCR runs in background.
    """
    phone = user["phone"]
    db = get_db()
    receipts_ref = db.collection("users").document(phone).collection("receipts")

    receipt_data = {
        "user_phone": phone,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "image_b64_tmp": base64.b64encode(image_data).decode("utf-8"),
    }
    await fs_add(receipts_ref, receipt_data)

    return (
        "📷 *Cupom recebido!* Processando...\n\n"
        "⏳ Aguarda uns 30 segundos que eu analiso tudo!\n"
        "_Vou te mandar os detalhes em seguida_ 😊"
    )


async def process_receipt_background(
    phone: str,
    image_data: bytes,
    media_type: str = "image/jpeg",
) -> None:
    """
    Background task: run Claude Vision OCR and notify user.
    """
    evolution = get_evolution_client()
    db = get_db()

    try:
        image_b64 = base64.b64encode(image_data).decode("utf-8")
        ocr_result = await analyze_receipt_image(image_b64, media_type)

        if not ocr_result:
            await evolution.send_message(
                phone,
                "😔 Não consegui ler o cupom. Pode tirar uma foto mais nítida e de frente? 📸"
            )
            return

        # Find or create receipt doc
        receipts_ref = db.collection("users").document(phone).collection("receipts")
        import asyncio
        pending_docs = await asyncio.to_thread(
            lambda: list(receipts_ref.where("status", "==", "pending").limit(1).stream())
        )

        receipt_id: str
        if pending_docs:
            receipt_id = pending_docs[0].id
        else:
            _, ref = await asyncio.to_thread(lambda: receipts_ref.add({"status": "pending"}))
            receipt_id = ref.id

        receipt_ref = receipts_ref.document(receipt_id)

        # Parse OCR result
        purchased_at = ocr_result.get("purchase_date") or datetime.now(timezone.utc).date().isoformat()
        total = ocr_result.get("total")
        store_name = ocr_result.get("store_name") or ""
        store_chain = ocr_result.get("store_chain") or ""

        # Find matching store
        store_id = None
        if store_chain and store_chain != "outro":
            store_docs = await asyncio.to_thread(
                lambda: list(db.collection("markets").where("chain", "==", store_chain).limit(1).stream())
            )
            if store_docs:
                store_id = store_docs[0].id

        # Update receipt document
        receipt_update = {
            "status": "processed",
            "store_id": store_id,
            "store_name_raw": store_name,
            "store_chain": store_chain,
            "total_amount": float(total) if total else None,
            "purchased_at": purchased_at,
            "ocr_raw": str(ocr_result),
            "image_b64_tmp": None,  # clear large field
        }
        await asyncio.to_thread(lambda: receipt_ref.set(receipt_update, merge=True))

        # Save items and update prices (batch)
        items = ocr_result.get("items") or []
        items_ref = receipt_ref.collection("items")
        price_updates = 0
        batch = db.batch()
        batch_count = 0

        for item_data in items:
            if not item_data.get("product_name_raw"):
                continue

            item_doc = {
                "product_name_raw": item_data["product_name_raw"],
                "product_normalized": item_data.get("product_normalized"),
                "category": item_data.get("category", "outros"),
                "quantity": item_data.get("quantity", 1),
                "unit_price": float(item_data["unit_price"]) if item_data.get("unit_price") else None,
                "total_price": float(item_data["total_price"]) if item_data.get("total_price") else None,
            }

            # Match product and update latestPrices
            normalized = item_data.get("product_normalized") or item_data["product_name_raw"]
            product = await find_product(normalized)
            if product and store_id and item_data.get("unit_price"):
                item_doc["product_id"] = product.get("_id")
                price_ref = (
                    db.collection("products").document(product["_id"])
                      .collection("latestPrices").document(store_id)
                )
                batch.set(price_ref, {
                    "store_id": store_id,
                    "price": float(item_data["unit_price"]),
                    "observed_at": purchased_at,
                    "source": "ocr",
                }, merge=True)
                price_updates += 1
                batch_count += 1

            new_item_ref = items_ref.document()
            batch.set(new_item_ref, item_doc)
            batch_count += 1

            # Commit in batches of 400 (Firestore limit is 500)
            if batch_count >= 400:
                await asyncio.to_thread(batch.commit)
                batch = db.batch()
                batch_count = 0

        if batch_count > 0:
            await asyncio.to_thread(batch.commit)

        # Send result to user
        msg = _build_ocr_response(ocr_result, len(items), price_updates)
        await evolution.send_message(phone, msg)

    except Exception as e:
        logger.error(f"OCR background task failed for {phone}: {e}", exc_info=True)
        await evolution.send_message(
            phone,
            "😔 Tive um problema ao processar o cupom. Tenta de novo mais tarde!"
        )


def _build_ocr_response(ocr_result: dict, items_count: int, price_updates: int) -> str:
    store_name = ocr_result.get("store_name") or "Mercado"
    total = ocr_result.get("total")
    date_str = ocr_result.get("purchase_date") or datetime.now().strftime("%d/%m/%Y")

    try:
        from datetime import datetime as dt
        date_formatted = dt.fromisoformat(date_str).strftime("%d/%m/%Y")
    except Exception:
        date_formatted = date_str

    lines = [f"🧾 *{store_name.upper()}* — {date_formatted}\n"]
    if total:
        lines.append(f"💰 Total: *R$ {float(total):.2f}*")
    if items_count > 0:
        lines.append(f"📦 Itens processados: *{items_count}*")
    if price_updates > 0:
        lines.append(f"✅ *{price_updates} preços atualizados!* Obrigado por contribuir 💚")

    lines.append("\n_Manda_ *quanto gastei esse mês* _pra ver seu resumo!_ 📊")
    return "\n".join(lines)
