"""
Manages shopping lists via WhatsApp.
Features 6, 7, and 8 from the product spec.
"""
import logging
import secrets
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.shopping_list import ShoppingList, ListItem
from app.models.user import User
from app.models.session import ConversationSession

logger = logging.getLogger(__name__)


async def get_active_list(db: AsyncSession, user: User) -> ShoppingList | None:
    result = await db.execute(
        select(ShoppingList)
        .where(ShoppingList.user_id == user.id)
        .where(ShoppingList.status == "active")
        .order_by(ShoppingList.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_or_create_active_list(db: AsyncSession, user: User) -> ShoppingList:
    lst = await get_active_list(db, user)
    if lst is None:
        lst = ShoppingList(
            user_id=user.id,
            share_token=secrets.token_hex(16),
        )
        db.add(lst)
        await db.flush()
    return lst


async def handle_list_add(entities: dict, user: User, db: AsyncSession) -> str:
    """Add one or multiple items to the active shopping list."""
    # Support both single product and items_list
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

    lst = await get_or_create_active_list(db, user)

    # Check for duplicates
    result = await db.execute(
        select(ListItem).where(ListItem.list_id == lst.id)
    )
    existing = {item.product_name_raw.lower() for item in result.scalars().all()}

    added = []
    skipped = []
    for item_name in items_raw:
        if item_name.lower() in existing:
            skipped.append(item_name)
        else:
            quantity = entities.get("quantity")
            unit = entities.get("unit")
            db.add(ListItem(
                list_id=lst.id,
                product_name_raw=item_name,
                quantity=quantity or 1,
                unit=unit,
            ))
            added.append(item_name)

    if not added:
        return f"{'Esses itens já estão' if len(skipped) > 1 else 'Esse item já está'} na sua lista! 😊\n_Manda_ *minha lista* _pra ver tudo._"

    await db.flush()

    lines = ["✅ *Adicionado à sua lista:*"]
    for item in added:
        lines.append(f"• {item.title()}")

    if skipped:
        lines.append(f"\n_(já tinha: {', '.join(skipped)})_")

    lines.append("\nManda _minha lista_ pra ver tudo 🛒")
    return "\n".join(lines)


async def handle_list_view(user: User, db: AsyncSession) -> str:
    """Show all items in the active shopping list."""
    lst = await get_active_list(db, user)

    if lst is None:
        return (
            "Sua lista está vazia 📋\n\n"
            "Adiciona produtos assim:\n"
            "_add arroz, feijão e café_ 🛒"
        )

    result = await db.execute(
        select(ListItem)
        .where(ListItem.list_id == lst.id)
        .order_by(ListItem.added_at.asc())
    )
    items = result.scalars().all()

    if not items:
        return (
            "Sua lista está vazia 📋\n\n"
            "_add arroz, feijão e café_ 🛒"
        )

    lines = [f"🛒 *Sua lista* ({len(items)} {'item' if len(items) == 1 else 'itens'}):\n"]
    for i, item in enumerate(items, 1):
        check = "✅" if item.checked else "⬜"
        qty = f" {item.quantity:.0f}" if item.quantity and item.quantity != 1 else ""
        unit = f"{item.unit}" if item.unit else ""
        lines.append(f"{check} {i}. {item.product_name_raw.title()}{qty}{unit}")

    lines.append("\n_onde comprar minha lista_ — ver onde é mais barato 🏪")
    return "\n".join(lines)


async def handle_list_remove(
    entities: dict, user: User, session: ConversationSession, db: AsyncSession
) -> str:
    """Remove an item from the shopping list."""
    lst = await get_active_list(db, user)
    if lst is None:
        return "Sua lista está vazia! 📋"

    product_query = entities.get("product_normalized") or entities.get("product") or ""

    # If no product specified but last action was list_add, remove that last item
    if not product_query:
        ctx = session.context or {}
        product_query = ctx.get("last_added_item", "")

    if not product_query:
        return "Qual item você quer tirar da lista?\n_Ex: tira o café_"

    result = await db.execute(
        select(ListItem)
        .where(ListItem.list_id == lst.id)
        .where(ListItem.product_name_raw.ilike(f"%{product_query}%"))
        .limit(1)
    )
    item = result.scalar_one_or_none()

    if item is None:
        return f"Não achei *{product_query}* na sua lista 🤔\nManda _minha lista_ pra ver o que tem."

    await db.delete(item)
    return f"✅ *{item.product_name_raw.title()}* removido da lista!\n\nManda _minha lista_ pra ver o que ficou 🛒"


async def handle_list_clear(user: User, db: AsyncSession) -> str:
    """Clear/reset the active shopping list."""
    lst = await get_active_list(db, user)
    if lst is None:
        return "Sua lista já está vazia! 📋"

    # Archive current list and start fresh
    lst.status = "archived"

    return "🗑️ Lista apagada!\n\nBora montar uma nova? Manda os itens 🛒\n_Ex: add arroz, feijão e leite_"


async def handle_list_optimize(user: User, db: AsyncSession) -> str:
    """Find the cheapest store(s) to buy everything on the list."""
    from app.handlers.price_handler import find_product, get_current_prices

    lst = await get_active_list(db, user)
    if lst is None:
        return "Sua lista está vazia! Adiciona produtos primeiro 🛒"

    result = await db.execute(
        select(ListItem).where(ListItem.list_id == lst.id)
    )
    items = result.scalars().all()

    if not items:
        return "Sua lista está vazia! Adiciona produtos primeiro 🛒"

    # For each item, get prices at each store
    store_totals: dict[str, float] = {}
    store_names: dict[str, str] = {}
    found_count = 0

    for item in items:
        product = await find_product(db, item.product_name_raw)
        if not product:
            continue
        found_count += 1
        prices = await get_current_prices(db, product)
        for p in prices:
            chain = p["store_chain"]
            if chain not in store_totals:
                store_totals[chain] = 0.0
                store_names[chain] = p["store_name"]
            store_totals[chain] += p["price"] * float(item.quantity or 1)

    if not store_totals:
        return (
            f"Não encontrei preços suficientes para os {len(items)} itens da sua lista 😔\n\n"
            "Tente escanear um cupom fiscal para alimentar os preços! 📸"
        )

    sorted_stores = sorted(store_totals.items(), key=lambda x: x[1])
    medals = ["1️⃣", "2️⃣", "3️⃣"]

    lines = [f"🛒 *Melhor mercado pra sua lista* ({found_count}/{len(items)} itens com preço)\n"]
    for i, (chain, total) in enumerate(sorted_stores[:3]):
        name = store_names.get(chain, chain.title())
        lines.append(f"{medals[i]} {name} — *R$ {total:.2f}*")

    if len(sorted_stores) >= 2:
        best_total = sorted_stores[0][1]
        worst_total = sorted_stores[-1][1]
        savings = worst_total - best_total
        best_name = store_names.get(sorted_stores[0][0], "")
        lines.append(f"\n💰 Indo no *{best_name}* você economiza *R$ {savings:.2f}*!")

    if found_count < len(items):
        missing = len(items) - found_count
        lines.append(f"\n⚠️ _{missing} {'item' if missing == 1 else 'itens'} sem preço cadastrado_")

    lines.append("\nQuer calcular o transporte também? Manda _vale ir de carro_ 🚗")
    return "\n".join(lines)


async def handle_list_share(user: User, db: AsyncSession) -> str:
    """Generate a shareable link for the shopping list."""
    from config import get_settings
    settings = get_settings()

    lst = await get_active_list(db, user)
    if lst is None:
        return "Sua lista está vazia! Adiciona produtos primeiro 🛒"

    result = await db.execute(
        select(ListItem).where(ListItem.list_id == lst.id)
    )
    items = result.scalars().all()

    if not items:
        return "Sua lista está vazia! Adiciona produtos primeiro 🛒"

    # Ensure share token exists
    if not lst.share_token:
        lst.share_token = secrets.token_hex(16)
        await db.flush()

    # Build item preview
    item_lines = "\n".join(f"• {item.product_name_raw.title()}" for item in items[:8])
    if len(items) > 8:
        item_lines += f"\n... e mais {len(items) - 8}"

    return (
        f"📤 *Compartilhe sua lista:*\n\n"
        f"{item_lines}\n\n"
        f"🔗 Link: _[abrir no app para compartilhar]_\n\n"
        f"_Token: {lst.share_token[:8]}..._\n"
        f"Mande o link pelo WhatsApp para a família! 💚"
    )
