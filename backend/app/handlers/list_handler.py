"""
Shopping list management — features 6, 7 & 8.
Stores lists under users/{phone}/lists/{list_id}/items/{item_id}.
"""
import secrets
import logging
from datetime import datetime, timezone
from app.core.firebase import get_db, fs_get, fs_set, fs_update, fs_delete, fs_query, fs_add

logger = logging.getLogger(__name__)


def _lists_ref(phone: str):
    return get_db().collection("users").document(phone).collection("lists")


async def get_active_list(phone: str) -> dict | None:
    """Return the user's active list document, or None."""
    results = await fs_query(
        _lists_ref(phone)
        .where("status", "==", "active")
        .order_by("created_at", direction="DESCENDING")
        .limit(1)
    )
    return results[0] if results else None


async def get_or_create_active_list(phone: str) -> dict:
    """Return or create the user's active list."""
    lst = await get_active_list(phone)
    if lst:
        return lst

    now = datetime.now(timezone.utc).isoformat()
    new_list = {
        "user_phone": phone,
        "name": "Minha Lista",
        "status": "active",
        "share_token": secrets.token_hex(16),
        "created_at": now,
        "updated_at": now,
    }
    list_id = await fs_add(_lists_ref(phone), new_list)
    new_list["_id"] = list_id
    return new_list


async def _get_items(phone: str, list_id: str) -> list[dict]:
    db = get_db()
    return await fs_query(
        db.collection("users").document(phone)
          .collection("lists").document(list_id)
          .collection("items")
          .order_by("added_at")
    )


async def handle_list_add(entities: dict, user: dict, session: dict) -> str:
    phone = user["phone"]
    items_raw: list[str] = []

    items_list = entities.get("items_list")
    if items_list and isinstance(items_list, list):
        items_raw = [str(i).strip() for i in items_list if i]
    elif entities.get("product_normalized"):
        items_raw = [entities["product_normalized"]]
    elif entities.get("product"):
        items_raw = [entities["product"]]

    if not items_raw:
        return "O que você quer adicionar na lista? 🛒\n_Ex: add arroz, feijão e café_"

    lst = await get_or_create_active_list(phone)
    list_id = lst["_id"]

    existing_items = await _get_items(phone, list_id)
    existing_names = {i["product_name_raw"].lower() for i in existing_items}

    db = get_db()
    items_ref = (
        db.collection("users").document(phone)
          .collection("lists").document(list_id)
          .collection("items")
    )

    added, skipped = [], []
    for item_name in items_raw:
        if item_name.lower() in existing_names:
            skipped.append(item_name)
        else:
            await fs_add(items_ref, {
                "product_name_raw": item_name,
                "quantity": entities.get("quantity") or 1,
                "unit": entities.get("unit") or "",
                "checked": False,
                "added_at": datetime.now(timezone.utc).isoformat(),
            })
            added.append(item_name)

    if not added:
        return f"{'Esses itens já estão' if len(skipped) > 1 else 'Esse item já está'} na sua lista! 😊\n_Manda_ *minha lista* _pra ver tudo._"

    lines = ["✅ *Adicionado à sua lista:*"]
    for item in added:
        lines.append(f"• {item.title()}")
    if skipped:
        lines.append(f"\n_(já tinha: {', '.join(skipped)})_")
    lines.append("\nManda _minha lista_ pra ver tudo 🛒")
    return "\n".join(lines)


async def handle_list_view(user: dict, session: dict) -> str:
    phone = user["phone"]
    lst = await get_active_list(phone)

    if not lst:
        return "Sua lista está vazia 📋\n\n_add arroz, feijão e café_ 🛒"

    items = await _get_items(phone, lst["_id"])

    if not items:
        return "Sua lista está vazia 📋\n\n_add arroz, feijão e café_ 🛒"

    lines = [f"🛒 *Sua lista* ({len(items)} {'item' if len(items) == 1 else 'itens'}):\n"]
    for i, item in enumerate(items, 1):
        check = "✅" if item.get("checked") else "⬜"
        qty = item.get("quantity", 1)
        qty_str = f" {float(qty):.0f}" if qty and float(qty) != 1 else ""
        unit_str = f"{item.get('unit', '')}" if item.get("unit") else ""
        lines.append(f"{check} {i}. {item['product_name_raw'].title()}{qty_str}{unit_str}")

    lines.append("\n_onde comprar minha lista_ — ver onde é mais barato 🏪")
    return "\n".join(lines)


async def handle_list_remove(entities: dict, user: dict, session: dict) -> str:
    phone = user["phone"]
    lst = await get_active_list(phone)
    if not lst:
        return "Sua lista está vazia! 📋"

    product_query = (
        entities.get("product_normalized")
        or entities.get("product")
        or (session.get("context") or {}).get("last_added_item", "")
    )

    if not product_query:
        return "Qual item você quer tirar da lista?\n_Ex: tira o café_"

    items = await _get_items(phone, lst["_id"])
    matched = next(
        (i for i in items if product_query.lower() in i["product_name_raw"].lower()),
        None
    )

    if not matched:
        return f"Não achei *{product_query}* na sua lista 🤔\nManda _minha lista_ pra ver o que tem."

    db = get_db()
    item_ref = (
        db.collection("users").document(phone)
          .collection("lists").document(lst["_id"])
          .collection("items").document(matched["_id"])
    )
    await fs_delete(item_ref)
    return f"✅ *{matched['product_name_raw'].title()}* removido!\n\nManda _minha lista_ pra ver o que ficou 🛒"


async def handle_list_clear(user: dict, session: dict) -> str:
    phone = user["phone"]
    lst = await get_active_list(phone)
    if not lst:
        return "Sua lista já está vazia! 📋"

    db = get_db()
    list_ref = (
        db.collection("users").document(phone)
          .collection("lists").document(lst["_id"])
    )
    await fs_update(list_ref, {"status": "archived"})
    return "🗑️ Lista apagada!\n\nBora montar uma nova? Manda os itens 🛒\n_Ex: add arroz, feijão e leite_"


async def handle_list_optimize(user: dict, session: dict) -> str:
    """Find cheapest store combination for the entire list."""
    from app.handlers.price_handler import find_product, get_current_prices

    phone = user["phone"]
    lst = await get_active_list(phone)
    if not lst:
        return "Sua lista está vazia! Adiciona produtos primeiro 🛒"

    items = await _get_items(phone, lst["_id"])
    if not items:
        return "Sua lista está vazia! Adiciona produtos primeiro 🛒"

    store_totals: dict[str, float] = {}
    store_names: dict[str, str] = {}
    found_count = 0

    for item in items:
        product = await find_product(item["product_name_raw"])
        if not product:
            continue
        found_count += 1
        prices = await get_current_prices(product)
        for p in prices:
            chain = p["store_chain"]
            qty = float(item.get("quantity") or 1)
            store_totals[chain] = store_totals.get(chain, 0.0) + p["price"] * qty
            store_names[chain] = p["store_name"]

    if not store_totals:
        return (
            f"Não encontrei preços suficientes para os {len(items)} itens 😔\n\n"
            "Tente escanear um cupom fiscal para alimentar os preços! 📸"
        )

    sorted_stores = sorted(store_totals.items(), key=lambda x: x[1])
    medals = ["1️⃣", "2️⃣", "3️⃣"]
    lines = [f"🛒 *Melhor mercado pra sua lista* ({found_count}/{len(items)} itens)\n"]

    for i, (chain, total) in enumerate(sorted_stores[:3]):
        name = store_names.get(chain, chain.title())
        lines.append(f"{medals[i]} {name} — *R$ {total:.2f}*")

    if len(sorted_stores) >= 2:
        savings = sorted_stores[-1][1] - sorted_stores[0][1]
        best_name = store_names.get(sorted_stores[0][0], "")
        lines.append(f"\n💰 Indo no *{best_name}* você economiza *R$ {savings:.2f}*!")

    if found_count < len(items):
        missing = len(items) - found_count
        lines.append(f"\n⚠️ _{missing} {'item' if missing == 1 else 'itens'} sem preço cadastrado_")

    lines.append("\nQuer calcular o transporte também? Manda _vale ir de carro_ 🚗")
    return "\n".join(lines)


async def handle_list_share(user: dict, session: dict) -> str:
    phone = user["phone"]
    lst = await get_active_list(phone)
    if not lst:
        return "Sua lista está vazia! Adiciona produtos primeiro 🛒"

    items = await _get_items(phone, lst["_id"])
    if not items:
        return "Sua lista está vazia! Adiciona produtos primeiro 🛒"

    item_lines = "\n".join(f"• {i['product_name_raw'].title()}" for i in items[:8])
    if len(items) > 8:
        item_lines += f"\n... e mais {len(items) - 8}"

    token = lst.get("share_token", lst["_id"][:8])
    return (
        f"📤 *Compartilhe sua lista:*\n\n"
        f"{item_lines}\n\n"
        f"🔗 _Token: {token[:8]}..._\n"
        f"Mande esse token pelo WhatsApp pra família! 💚"
    )
