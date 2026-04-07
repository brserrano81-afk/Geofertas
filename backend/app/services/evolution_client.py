"""
Client for Evolution API — WhatsApp messaging.
Abstracts all Evolution API calls so we can swap to Meta Cloud API later.
"""
import asyncio
import logging
import httpx
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class EvolutionClient:
    def __init__(self):
        self.base_url = settings.evolution_api_url.rstrip("/")
        self.api_key = settings.evolution_api_key
        self.instance = settings.evolution_instance
        self.headers = {
            "apikey": self.api_key,
            "Content-Type": "application/json",
        }

    async def send_message(self, phone: str, text: str) -> bool:
        """Send a text message to a WhatsApp number."""
        # Normalize phone: remove +, spaces, dashes
        phone_clean = phone.replace("+", "").replace(" ", "").replace("-", "")

        url = f"{self.base_url}/message/sendText/{self.instance}"
        payload = {
            "number": phone_clean,
            "options": {
                "delay": 1200,  # simulate human typing delay (ms)
                "presence": "composing",
            },
            "textMessage": {"text": text},
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload, headers=self.headers)
                resp.raise_for_status()
                logger.info(f"Message sent to {phone_clean}: {resp.status_code}")
                return True
        except httpx.HTTPStatusError as e:
            logger.error(f"Evolution API HTTP error sending to {phone_clean}: {e.response.status_code} {e.response.text}")
            return False
        except Exception as e:
            logger.error(f"Failed to send message to {phone_clean}: {e}")
            return False

    async def send_typing(self, phone: str) -> None:
        """Show typing indicator immediately (call before processing)."""
        phone_clean = phone.replace("+", "").replace(" ", "").replace("-", "")
        url = f"{self.base_url}/chat/sendPresence/{self.instance}"
        payload = {
            "number": phone_clean,
            "options": {"presence": "composing"},
        }
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(url, json=payload, headers=self.headers)
        except Exception as e:
            logger.warning(f"Could not send typing indicator: {e}")

    async def download_media(self, media_url: str) -> bytes | None:
        """Download media (image) from Evolution API media URL."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(media_url, headers=self.headers)
                resp.raise_for_status()
                return resp.content
        except Exception as e:
            logger.error(f"Failed to download media from {media_url}: {e}")
            return None

    async def create_instance(self) -> bool:
        """Create the WhatsApp instance if it doesn't exist."""
        url = f"{self.base_url}/instance/create"
        payload = {
            "instanceName": self.instance,
            "token": self.api_key,
            "qrcode": True,
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload, headers=self.headers)
                if resp.status_code in (200, 201):
                    logger.info(f"Instance '{self.instance}' created successfully")
                    return True
                elif resp.status_code == 403:
                    logger.info(f"Instance '{self.instance}' already exists")
                    return True
                else:
                    logger.error(f"Failed to create instance: {resp.status_code} {resp.text}")
                    return False
        except Exception as e:
            logger.error(f"Error creating Evolution instance: {e}")
            return False


# Singleton
_evolution_client: EvolutionClient | None = None


def get_evolution_client() -> EvolutionClient:
    global _evolution_client
    if _evolution_client is None:
        _evolution_client = EvolutionClient()
    return _evolution_client
