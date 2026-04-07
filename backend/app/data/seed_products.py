"""
Seed script: loads stores and 50 essential products with realistic prices
for Grande Vitória/ES supermarket chains (Extrabom, Atacadão, Carone).

Prices are approximate market values for April 2026.
Run: python -m app.data.seed_products
"""
import asyncio
import json
import os
import sys
from pathlib import Path

# Allow running from backend/ directory
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.models.product import Product
from app.models.store import Store
from app.models.price import Price
from app.core.database import Base

# Products catalog: (name, category, unit, emoji, aliases[], prices_by_chain{})
# prices_by_chain: {"extrabom": R$, "atacadao": R$, "carone": R$}
PRODUCTS = [
    # ── Mercearia ───────────────────────────────────────────────────────────
    ("Arroz Branco 5kg", "mercearia", "pct", "🌾",
     ["arroz", "arrôz", "arros", "arrozinho", "arroz 5kg", "arroz branco"],
     {"extrabom": 22.90, "atacadao": 21.49, "carone": 24.90}),

    ("Feijão Carioca 1kg", "mercearia", "kg", "🫘",
     ["feijão", "feijao", "fejão", "fejao", "feijão carioca", "feijão comum"],
     {"extrabom": 8.90, "atacadao": 7.99, "carone": 9.49}),

    ("Feijão Preto 1kg", "mercearia", "kg", "🫘",
     ["feijão preto", "feijao preto", "feijão pretão"],
     {"extrabom": 9.49, "atacadao": 8.79, "carone": 10.20}),

    ("Óleo de Soja Liza 900ml", "mercearia", "un", "🫙",
     ["óleo", "oleo", "óleo de soja", "azeite de soja", "oleo soja"],
     {"extrabom": 6.49, "atacadao": 5.89, "carone": 6.99}),

    ("Açúcar Cristal 1kg", "mercearia", "kg", "🧂",
     ["açúcar", "acucar", "açucar", "açúcar cristal"],
     {"extrabom": 3.99, "atacadao": 3.59, "carone": 4.29}),

    ("Café Torrado Moído 500g", "mercearia", "un", "☕",
     ["café", "cafe", "cafézin", "cafezin", "café 500g", "café moído"],
     {"extrabom": 14.90, "atacadao": 13.49, "carone": 16.90}),

    ("Macarrão Espaguete 500g", "mercearia", "un", "🍝",
     ["macarrão", "macarrao", "espaguete", "macarrão espaguete", "massa"],
     {"extrabom": 4.29, "atacadao": 3.79, "carone": 4.89}),

    ("Sal Refinado 1kg", "mercearia", "kg", "🧂",
     ["sal", "sal refinado", "salzinho"],
     {"extrabom": 2.49, "atacadao": 1.99, "carone": 2.79}),

    ("Farinha de Trigo 1kg", "mercearia", "kg", "🌾",
     ["farinha", "farinha de trigo", "farinha trigo"],
     {"extrabom": 4.49, "atacadao": 3.99, "carone": 4.99}),

    ("Molho de Tomate 340g", "mercearia", "un", "🍅",
     ["molho de tomate", "molho tomate", "extrato de tomate", "molhinho"],
     {"extrabom": 2.99, "atacadao": 2.49, "carone": 3.29}),

    ("Maionese Hellmann's 250g", "mercearia", "un", "🥫",
     ["maionese", "maionese hellmanns", "mayo"],
     {"extrabom": 7.99, "atacadao": 6.99, "carone": 8.49}),

    ("Atum em Lata 170g", "mercearia", "un", "🐟",
     ["atum", "atum em lata", "atum lata"],
     {"extrabom": 6.49, "atacadao": 5.79, "carone": 6.99}),

    ("Achocolatado Nescau 400g", "mercearia", "un", "🍫",
     ["achocolatado", "nescau", "toddy", "chocolatado"],
     {"extrabom": 8.99, "atacadao": 7.99, "carone": 9.49}),

    # ── Carnes ──────────────────────────────────────────────────────────────
    ("Frango Inteiro kg", "carnes", "kg", "🐔",
     ["frango", "frango inteiro", "franguinho", "frang", "galinha"],
     {"extrabom": 12.90, "atacadao": 11.49, "carone": 13.90}),

    ("Frango Coxa e Sobrecoxa kg", "carnes", "kg", "🍗",
     ["coxa de frango", "sobrecoxa", "coxa sobrecoxa", "coxa", "frango coxa"],
     {"extrabom": 14.90, "atacadao": 13.49, "carone": 15.90}),

    ("Peito de Frango kg", "carnes", "kg", "🍗",
     ["peito de frango", "peito frango", "filé de frango"],
     {"extrabom": 18.90, "atacadao": 16.99, "carone": 19.90}),

    ("Carne Moída Patinho kg", "carnes", "kg", "🥩",
     ["carne moída", "carne moida", "carne moída patinho", "moída"],
     {"extrabom": 36.90, "atacadao": 33.99, "carone": 38.90}),

    ("Alcatra kg", "carnes", "kg", "🥩",
     ["alcatra", "bife de alcatra"],
     {"extrabom": 52.90, "atacadao": 48.99, "carone": 55.90}),

    ("Fraldinha kg", "carnes", "kg", "🥩",
     ["fraldinha", "fraldinha bovina"],
     {"extrabom": 44.90, "atacadao": 41.99, "carone": 47.90}),

    ("Linguiça Calabresa kg", "carnes", "kg", "🌭",
     ["linguiça", "linguica", "linguiça calabresa", "calabresa"],
     {"extrabom": 22.90, "atacadao": 19.99, "carone": 24.90}),

    # ── Laticínios ──────────────────────────────────────────────────────────
    ("Leite Integral 1L", "laticinios", "L", "🥛",
     ["leite", "leitinho", "leite integral", "leite 1l", "leite longa vida"],
     {"extrabom": 5.29, "atacadao": 4.89, "carone": 5.79}),

    ("Manteiga com Sal 200g", "laticinios", "un", "🧈",
     ["manteiga", "manteiguinha", "manteiga com sal"],
     {"extrabom": 8.99, "atacadao": 7.99, "carone": 9.49}),

    ("Queijo Mussarela kg", "laticinios", "kg", "🧀",
     ["queijo mussarela", "mussarela", "muçarela", "queijo"],
     {"extrabom": 38.90, "atacadao": 34.99, "carone": 42.90}),

    ("Iogurte Natural 170g", "laticinios", "un", "🫙",
     ["iogurte", "iogurte natural", "iogurt"],
     {"extrabom": 2.49, "atacadao": 2.19, "carone": 2.79}),

    ("Presunto Cozido kg", "laticinios", "kg", "🥩",
     ["presunto", "presunto cozido"],
     {"extrabom": 26.90, "atacadao": 23.99, "carone": 28.90}),

    # ── Bebidas ─────────────────────────────────────────────────────────────
    ("Cerveja Skol Lata 350ml", "bebidas", "un", "🍺",
     ["cerveja", "gelada", "cervejinha", "skol", "cerveja lata", "birinha"],
     {"extrabom": 3.79, "atacadao": 3.29, "carone": 3.99}),

    ("Coca-Cola 2L", "bebidas", "un", "🥤",
     ["coca-cola", "coca", "coca cola", "coca 2l", "refrigerante coca"],
     {"extrabom": 10.90, "atacadao": 9.49, "carone": 11.49}),

    ("Refrigerante Genérico 2L", "bebidas", "un", "🥤",
     ["refri", "refrigerante", "refris", "guaraná", "pepsi"],
     {"extrabom": 7.99, "atacadao": 6.99, "carone": 8.49}),

    ("Água Mineral 1.5L", "bebidas", "un", "💧",
     ["água", "agua", "agua mineral", "aguinha"],
     {"extrabom": 2.29, "atacadao": 1.99, "carone": 2.49}),

    ("Suco de Caixinha 200ml", "bebidas", "un", "🧃",
     ["suco de caixinha", "suco caixinha", "suco", "suchá"],
     {"extrabom": 2.49, "atacadao": 1.99, "carone": 2.69}),

    # ── Higiene ──────────────────────────────────────────────────────────────
    ("Sabonete em Barra 90g", "higiene", "un", "🧴",
     ["sabonete", "sabonete em barra", "sabão"],
     {"extrabom": 1.99, "atacadao": 1.59, "carone": 2.29}),

    ("Shampoo Pantene 200ml", "higiene", "un", "🧴",
     ["shampoo", "xampu", "shampo"],
     {"extrabom": 11.90, "atacadao": 9.99, "carone": 12.90}),

    ("Papel Higiênico 12 rolos", "higiene", "pct", "🧻",
     ["papel higiênico", "papel higienico", "papel", "rolinho"],
     {"extrabom": 18.90, "atacadao": 15.99, "carone": 19.90}),

    ("Fralda Pampers P c/28", "higiene", "pct", "👶",
     ["fralda", "pampers", "huggies", "fralda descartável"],
     {"extrabom": 42.90, "atacadao": 38.99, "carone": 44.90}),

    ("Desodorante Aerossol 150ml", "higiene", "un", "🧴",
     ["desodorante", "desodorante aerossol", "antitranspirante"],
     {"extrabom": 9.99, "atacadao": 8.49, "carone": 10.99}),

    # ── Limpeza ──────────────────────────────────────────────────────────────
    ("Detergente Líquido 500ml", "limpeza", "un", "🧹",
     ["detergente", "det", "detergi", "detergente líquido"],
     {"extrabom": 2.29, "atacadao": 1.89, "carone": 2.49}),

    ("Sabão em Pó 1kg", "limpeza", "kg", "🧹",
     ["sabão em pó", "sabao em po", "omo", "ariel", "bold"],
     {"extrabom": 12.90, "atacadao": 10.99, "carone": 13.90}),

    ("Amaciante 2L", "limpeza", "un", "🧹",
     ["amaciante", "downy", "comfort"],
     {"extrabom": 11.90, "atacadao": 9.99, "carone": 12.90}),

    ("Desinfetante Pinho Sol 500ml", "limpeza", "un", "🧹",
     ["desinfetante", "pinho sol", "pinhosol"],
     {"extrabom": 4.49, "atacadao": 3.79, "carone": 4.99}),

    ("Esponja de Lavar Louça", "limpeza", "un", "🧽",
     ["esponja", "esponja de lavar", "buchinha"],
     {"extrabom": 1.99, "atacadao": 1.49, "carone": 2.19}),

    # ── Hortifruti ────────────────────────────────────────────────────────────
    ("Banana Prata kg", "hortifruti", "kg", "🍌",
     ["banana", "bananinha", "banana prata"],
     {"extrabom": 4.99, "atacadao": 3.99, "carone": 5.49}),

    ("Tomate kg", "hortifruti", "kg", "🍅",
     ["tomate", "tomates"],
     {"extrabom": 6.99, "atacadao": 5.99, "carone": 7.49}),

    ("Cebola kg", "hortifruti", "kg", "🧅",
     ["cebola", "cebolinha"],
     {"extrabom": 4.49, "atacadao": 3.79, "carone": 4.99}),

    ("Batata Inglesa kg", "hortifruti", "kg", "🥔",
     ["batata", "batata inglesa", "batata portuguesa"],
     {"extrabom": 5.99, "atacadao": 4.99, "carone": 6.49}),

    ("Alface Crespa un", "hortifruti", "un", "🥬",
     ["alface", "alface crespa", "alface lisa"],
     {"extrabom": 2.99, "atacadao": 2.49, "carone": 3.29}),

    ("Maçã Fuji kg", "hortifruti", "kg", "🍎",
     ["maçã", "maca", "maçã fuji"],
     {"extrabom": 9.99, "atacadao": 8.49, "carone": 10.99}),

    # ── Padaria ───────────────────────────────────────────────────────────────
    ("Pão de Forma Pullman 500g", "padaria", "un", "🍞",
     ["pão de forma", "pao de forma", "pullman", "pão fatiado"],
     {"extrabom": 8.99, "atacadao": 7.49, "carone": 9.49}),

    ("Bolacha Cream Cracker 400g", "padaria", "un", "🍪",
     ["bolacha cream cracker", "biscoito cream cracker", "cream cracker", "bolacha"],
     {"extrabom": 4.99, "atacadao": 3.99, "carone": 5.49}),

    ("Bolacha Recheada 130g", "padaria", "un", "🍪",
     ["bolacha recheada", "biscoito recheado", "oreo", "trakinas", "bolacha de chocolate"],
     {"extrabom": 3.49, "atacadao": 2.99, "carone": 3.79}),

    ("Ovos Brancos Dúzia", "laticinios", "dz", "🥚",
     ["ovos", "ovo", "dúzia de ovos", "ovinho"],
     {"extrabom": 11.90, "atacadao": 10.49, "carone": 12.90}),
]


async def seed(database_url: str):
    """Run the seed operation."""
    print("🌱 Iniciando seed de dados...")

    engine = create_async_engine(database_url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Load stores from JSON
    stores_file = Path(__file__).parent / "stores_es.json"
    with open(stores_file) as f:
        stores_data = json.load(f)

    async with session_factory() as db:
        # ── Seed stores ───────────────────────────────────────────────────────
        from sqlalchemy import select
        store_map: dict[str, list[Store]] = {}  # chain → [stores]

        for s_data in stores_data:
            result = await db.execute(
                select(Store).where(Store.name == s_data["name"])
            )
            existing = result.scalar_one_or_none()
            if existing:
                store_map.setdefault(existing.chain, []).append(existing)
                continue

            store = Store(**s_data)
            db.add(store)
            await db.flush()
            store_map.setdefault(store.chain, []).append(store)
            print(f"  ✅ Loja: {store.name}")

        # ── Seed products and prices ──────────────────────────────────────────
        for name, category, unit, emoji, aliases, prices_by_chain in PRODUCTS:
            # Check if product exists
            result = await db.execute(
                select(Product).where(Product.name == name)
            )
            product = result.scalar_one_or_none()

            if not product:
                product = Product(
                    name=name,
                    category=category,
                    unit=unit,
                    emoji=emoji,
                    aliases=aliases,
                )
                db.add(product)
                await db.flush()
                print(f"  ✅ Produto: {name}")

            # Add prices for each chain (use first store of each chain)
            for chain, price_val in prices_by_chain.items():
                stores_of_chain = store_map.get(chain, [])
                if not stores_of_chain:
                    continue

                # Check if price already exists for this product/store
                store = stores_of_chain[0]
                existing_price = await db.execute(
                    select(Price)
                    .where(Price.product_id == product.id)
                    .where(Price.store_id == store.id)
                    .limit(1)
                )
                if existing_price.scalar_one_or_none():
                    continue

                db.add(Price(
                    product_id=product.id,
                    store_id=store.id,
                    price=price_val,
                    source="manual",
                ))

        await db.commit()
        print(f"\n✅ Seed concluído!")
        print(f"   {len(stores_data)} lojas | {len(PRODUCTS)} produtos")

    await engine.dispose()


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("❌ DATABASE_URL não configurada no .env")
        sys.exit(1)

    asyncio.run(seed(db_url))
