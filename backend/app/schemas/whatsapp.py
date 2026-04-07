"""
Pydantic schemas for Evolution API webhook payloads.
Evolution API sends a variety of event types; we only process messages.
"""
from pydantic import BaseModel
from typing import Any


class EvolutionMessageKey(BaseModel):
    remoteJid: str
    fromMe: bool = False
    id: str = ""


class EvolutionMessageData(BaseModel):
    key: EvolutionMessageKey
    pushName: str | None = None
    message: dict[str, Any] | None = None
    messageType: str = "conversation"
    messageTimestamp: int | None = None


class EvolutionWebhookPayload(BaseModel):
    event: str
    instance: str
    data: dict[str, Any] | None = None

    def get_phone(self) -> str | None:
        if not self.data:
            return None
        key = self.data.get("key", {})
        jid = key.get("remoteJid", "")
        if not jid or key.get("fromMe", False):
            return None
        # Extract phone from JID (format: 5527XXXXXXXX@s.whatsapp.net)
        phone = jid.split("@")[0]
        return phone if phone.isdigit() else None

    def get_text(self) -> str | None:
        if not self.data:
            return None
        msg = self.data.get("message", {}) or {}
        return (
            msg.get("conversation")
            or msg.get("extendedTextMessage", {}).get("text")
            or None
        )

    def get_media_url(self) -> str | None:
        if not self.data:
            return None
        msg = self.data.get("message", {}) or {}
        img = msg.get("imageMessage", {}) or {}
        return img.get("url") or None

    def get_media_mimetype(self) -> str:
        if not self.data:
            return "image/jpeg"
        msg = self.data.get("message", {}) or {}
        img = msg.get("imageMessage", {}) or {}
        return img.get("mimetype", "image/jpeg")

    def is_image(self) -> bool:
        if not self.data:
            return False
        msg = self.data.get("message", {}) or {}
        return "imageMessage" in msg

    def get_push_name(self) -> str | None:
        if not self.data:
            return None
        return self.data.get("pushName")
