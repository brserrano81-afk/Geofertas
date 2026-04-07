"""REST API for price data — used by the React dashboard."""
import asyncio
from fastapi import APIRouter
from app.core.firebase import get_db, fs_query

router = APIRouter(prefix="/api/v1/prices", tags=["prices"])


@router.get("/products")
async def list_products():
    db = get_db()
    products = await fs_query(
        db.collection("products").order_by("category").order_by("name")
    )
    return [
        {
            "id": p["_id"],
            "name": p.get("name", ""),
            "category": p.get("category", ""),
            "unit": p.get("unit", ""),
            "emoji": p.get("emoji", ""),
            "aliases": p.get("aliases", []),
        }
        for p in products
    ]


@router.get("/stores")
async def list_stores():
    db = get_db()
    stores = await fs_query(
        db.collection("markets").where("active", "==", True)
    )
    stores.sort(key=lambda s: (s.get("chain", ""), s.get("name", "")))
    return [
        {
            "id": s["_id"],
            "name": s.get("name", ""),
            "chain": s.get("chain", ""),
            "neighborhood": s.get("neighborhood", ""),
            "latitude": s.get("latitude"),
            "longitude": s.get("longitude"),
        }
        for s in stores
    ]


@router.get("/compare/{product_id}")
async def compare_product_prices(product_id: str):
    """Get latest price for a product across all stores."""
    db = get_db()

    # Fetch all latestPrices subcollection entries for this product
    prices = await fs_query(
        db.collection("products").document(product_id).collection("latestPrices")
    )

    if not prices:
        return []

    # Fetch active stores for name lookup
    stores = await fs_query(
        db.collection("markets").where("active", "==", True)
    )
    store_map = {s["_id"]: s for s in stores}

    results = []
    for p in prices:
        store_id = p.get("store_id") or p["_id"]
        store = store_map.get(store_id, {})
        if not store:
            continue
        results.append(
            {
                "store_id": store_id,
                "store_name": store.get("name", store_id),
                "store_chain": store.get("chain", ""),
                "price": float(p["price"]) if p.get("price") else None,
                "observed_at": p.get("observed_at", ""),
                "source": p.get("source", "manual"),
            }
        )

    results.sort(key=lambda x: x["price"] or 9999)
    return results
