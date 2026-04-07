"""
Manages user sessions and conversation state using Firestore.
Users are identified by phone number (document ID in 'users' collection).
Each user has a single 'session' sub-document with the rolling context.
"""
import logging
from datetime import datetime, timezone
from app.core.firebase import get_db, fs_get, fs_set, fs_update

logger = logging.getLogger(__name__)

MAX_CONTEXT_MESSAGES = 10


def _users_ref():
    return get_db().collection("users")


async def get_or_create_user(phone: str, name: str | None = None) -> dict:
    """
    Get existing user or create a new one.
    Returns a dict with user data (always includes 'phone').
    """
    ref = _users_ref().document(phone)
    user = await fs_get(ref)

    now = datetime.now(timezone.utc).isoformat()

    if user is None:
        user = {
            "phone": phone,
            "name": name or "",
            "neighborhood": "",
            "vehicle_type": "",
            "fuel_price": None,
            "preferences": {},
            "consent_at": None,
            "created_at": now,
            "last_seen_at": now,
            "active": True,
        }
        await fs_set(ref, user, merge=False)
        logger.info(f"New user created: {phone}")
    else:
        updates: dict = {"last_seen_at": now}
        if name and not user.get("name"):
            updates["name"] = name
        await fs_update(ref, updates)
        user.update(updates)

    return user


async def get_or_create_session(phone: str) -> dict:
    """
    Get or create the conversation session for a user.
    Stored at users/{phone}/session (single document).
    """
    ref = _users_ref().document(phone).collection("session").document("current")
    session = await fs_get(ref)

    if session is None:
        session = {
            "state": "idle",
            "context": {"messages": []},
            "last_intent": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await fs_set(ref, session, merge=False)

    return session


async def save_session(phone: str, session: dict) -> None:
    """Persist session state back to Firestore."""
    ref = _users_ref().document(phone).collection("session").document("current")
    session["updated_at"] = datetime.now(timezone.utc).isoformat()
    await fs_set(ref, session, merge=True)


async def add_message_to_context(session: dict, role: str, text: str) -> None:
    """Append a message to the rolling context window (max 10 messages). Mutates session in-place."""
    ctx = session.get("context") or {}
    messages = ctx.get("messages") or []
    messages.append({
        "role": role,
        "text": text,
        "ts": datetime.now(timezone.utc).isoformat(),
    })
    ctx["messages"] = messages[-MAX_CONTEXT_MESSAGES:]
    session["context"] = ctx


async def update_session_state(
    session: dict,
    state: str,
    intent: str | None = None,
    extra_context: dict | None = None,
) -> None:
    """Update state machine fields on the session dict in-place."""
    session["state"] = state
    if intent:
        session["last_intent"] = intent
    if extra_context:
        ctx = session.get("context") or {}
        ctx.update(extra_context)
        session["context"] = ctx
