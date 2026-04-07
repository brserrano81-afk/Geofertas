"""
Manages user sessions and conversation state.
Each user (identified by phone) has one active session.
"""
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.models.session import ConversationSession

logger = logging.getLogger(__name__)

MAX_CONTEXT_MESSAGES = 10


async def get_or_create_user(db: AsyncSession, phone: str, name: str | None = None) -> User:
    """Get existing user or create new one. Always updates last_seen_at."""
    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(phone=phone, name=name)
        db.add(user)
        await db.flush()
        logger.info(f"New user created: {phone}")
    else:
        user.last_seen_at = datetime.now(timezone.utc)
        if name and not user.name:
            user.name = name

    return user


async def get_or_create_session(db: AsyncSession, user: User) -> ConversationSession:
    """Get existing conversation session or create a fresh one."""
    result = await db.execute(
        select(ConversationSession).where(ConversationSession.user_id == user.id)
    )
    session = result.scalar_one_or_none()

    if session is None:
        session = ConversationSession(user_id=user.id, state="idle", context={"messages": []})
        db.add(session)
        await db.flush()

    return session


async def add_message_to_context(
    session: ConversationSession, role: str, text: str
) -> None:
    """Append a message to the rolling context window (max 10 messages)."""
    ctx = session.context or {}
    messages = ctx.get("messages", [])
    messages.append({
        "role": role,
        "text": text,
        "ts": datetime.now(timezone.utc).isoformat(),
    })
    # Keep only last MAX_CONTEXT_MESSAGES
    ctx["messages"] = messages[-MAX_CONTEXT_MESSAGES:]
    session.context = ctx


async def update_session_state(
    session: ConversationSession,
    state: str,
    intent: str | None = None,
    extra_context: dict | None = None,
) -> None:
    """Update session state machine and optional context fields."""
    session.state = state
    if intent:
        session.last_intent = intent

    if extra_context:
        ctx = session.context or {}
        ctx.update(extra_context)
        session.context = ctx

    session.updated_at = datetime.now(timezone.utc)
