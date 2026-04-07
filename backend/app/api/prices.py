"""REST API for price data — used by the React dashboard."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.models.product import Product
from app.models.store import Store
from app.models.price import Price

router = APIRouter(prefix="/api/v1/prices", tags=["prices"])


@router.get("/products")
async def list_products(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).order_by(Product.category, Product.name))
    products = result.scalars().all()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "category": p.category,
            "unit": p.unit,
            "emoji": p.emoji,
        }
        for p in products
    ]


@router.get("/stores")
async def list_stores(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Store).where(Store.active == True).order_by(Store.chain, Store.name)
    )
    stores = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "name": s.name,
            "chain": s.chain,
            "neighborhood": s.neighborhood,
            "latitude": float(s.latitude) if s.latitude else None,
            "longitude": float(s.longitude) if s.longitude else None,
        }
        for s in stores
    ]


@router.get("/compare/{product_id}")
async def compare_product_prices(product_id: str, db: AsyncSession = Depends(get_db)):
    """Get latest price for a product across all stores."""
    subq = (
        select(Price.store_id, func.max(Price.observed_at).label("latest_at"))
        .where(Price.product_id == product_id)
        .group_by(Price.store_id)
        .subquery()
    )
    stmt = (
        select(Price, Store)
        .join(subq, (Price.store_id == subq.c.store_id) & (Price.observed_at == subq.c.latest_at))
        .join(Store, Price.store_id == Store.id)
        .where(Store.active == True)
        .order_by(Price.price.asc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    return [
        {
            "store_id": str(store.id),
            "store_name": store.name,
            "store_chain": store.chain,
            "price": float(price.price),
            "observed_at": price.observed_at.isoformat(),
            "source": price.source,
        }
        for price, store in rows
    ]
