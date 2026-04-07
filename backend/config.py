from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "EconomizaFacil.IA"
    debug: bool = False
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Database (Supabase PostgreSQL)
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/economizafacil"

    # Anthropic
    anthropic_api_key: str = ""
    claude_model_fast: str = "claude-haiku-4-5-20251001"
    claude_model_smart: str = "claude-sonnet-4-6"

    # Evolution API (WhatsApp)
    evolution_api_url: str = "http://localhost:8080"
    evolution_api_key: str = ""
    evolution_instance: str = "economizafacil"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # WhatsApp bot number (international format, no +)
    bot_phone: str = ""

    # Webhook secret (to validate Evolution API requests)
    webhook_secret: str = ""

    # Fuel price default (R$/litro) for trip calculator
    default_fuel_price: float = 5.89
    default_fuel_efficiency: float = 10.0  # km/l

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
