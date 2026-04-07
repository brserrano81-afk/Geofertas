"""
Firebase Admin SDK initialization.
Single Firestore client shared across the entire application.
"""
import asyncio
import logging
import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore as fs

logger = logging.getLogger(__name__)

# Global Firestore client — initialized once at startup
db: fs.Client | None = None


def init_firebase(credentials_path: str, project_id: str) -> fs.Client:
    """Initialize Firebase Admin SDK and return Firestore client."""
    global db

    if firebase_admin._apps:
        db = fs.client()
        return db

    cred_path = Path(credentials_path)
    if cred_path.exists():
        cred = credentials.Certificate(str(cred_path))
        logger.info(f"Firebase: using service account from {cred_path}")
    else:
        # Fall back to Application Default Credentials (Cloud Run, GKE, etc.)
        cred = credentials.ApplicationDefault()
        logger.info("Firebase: using Application Default Credentials")

    firebase_admin.initialize_app(cred, {"projectId": project_id})
    db = fs.client()
    logger.info(f"Firebase initialized — project: {project_id}")
    return db


def get_db() -> fs.Client:
    """Return the initialized Firestore client. Call after init_firebase()."""
    if db is None:
        raise RuntimeError("Firebase not initialized. Call init_firebase() first.")
    return db


# ── Async helpers ──────────────────────────────────────────────────────────────
# firebase-admin is synchronous. Wrap every Firestore call with asyncio.to_thread
# so we never block the FastAPI event loop.

async def fs_get(ref) -> dict | None:
    """Async wrapper: get a single document."""
    doc = await asyncio.to_thread(ref.get)
    if doc.exists:
        data = doc.to_dict()
        data["_id"] = doc.id
        return data
    return None


async def fs_set(ref, data: dict, merge: bool = True) -> None:
    """Async wrapper: create or update a document."""
    await asyncio.to_thread(lambda: ref.set(data, merge=merge))


async def fs_update(ref, data: dict) -> None:
    """Async wrapper: update specific fields."""
    await asyncio.to_thread(lambda: ref.update(data))


async def fs_delete(ref) -> None:
    """Async wrapper: delete a document."""
    await asyncio.to_thread(ref.delete)


async def fs_query(query) -> list[dict]:
    """Async wrapper: execute a collection query and return list of dicts."""
    docs = await asyncio.to_thread(lambda: list(query.stream()))
    result = []
    for doc in docs:
        data = doc.to_dict() or {}
        data["_id"] = doc.id
        result.append(data)
    return result


async def fs_add(collection_ref, data: dict) -> str:
    """Async wrapper: add a new document, return its ID."""
    ts, ref = await asyncio.to_thread(lambda: collection_ref.add(data))
    return ref.id


async def fs_batch_set(writes: list[tuple]) -> None:
    """
    Async wrapper: batch write multiple documents.
    writes: list of (document_ref, data_dict) tuples
    """
    client = get_db()
    batch = client.batch()
    for ref, data in writes:
        batch.set(ref, data)
    await asyncio.to_thread(batch.commit)
