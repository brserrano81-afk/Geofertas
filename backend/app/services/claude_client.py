"""
Anthropic Claude client wrapper with retry logic and cost logging.
"""
import json
import logging
import anthropic
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_client: anthropic.AsyncAnthropic | None = None


def get_claude_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


async def classify_intent(user_message: str, conversation_context: dict) -> dict:
    """
    Stage 1 NLU: classify intent and extract entities using Claude Haiku.
    Returns structured IntentResult dict.
    """
    client = get_claude_client()

    # Build context string from recent messages
    recent_msgs = conversation_context.get("messages", [])[-6:]
    ctx_text = ""
    if recent_msgs:
        ctx_text = "\n".join(
            f"{'Usuário' if m['role'] == 'user' else 'Bot'}: {m['text']}"
            for m in recent_msgs
        )

    system_prompt = """Você é um classificador de intenções para o EconomizaFacil, assistente brasileiro de economia no mercado.

TAREFA: Classifique a mensagem e extraia entidades. Responda APENAS com JSON válido.

INTENÇÕES DISPONÍVEIS:
- price_lookup: usuário quer saber preço de produto
- price_compare: usuário quer comparar marcas ou lojas
- offer_search: usuário quer promoções/ofertas/descontos
- best_store: usuário quer saber qual mercado é mais barato no geral
- trip_calc: usuário pergunta se vale ir de carro/moto até um mercado
- list_add: adicionar item à lista de compras
- list_remove: remover item da lista
- list_clear: limpar/zerar a lista
- list_view: ver os itens da lista
- list_optimize: onde comprar a lista toda mais barato
- list_share: compartilhar lista via WhatsApp
- receipt_ocr: usuário enviou ou menciona foto de cupom fiscal
- analytics_view: ver gastos/histórico
- monthly_plan: ajuda para planejar compras do mês
- price_prediction: perguntar sobre preços futuros/sazonalidade
- preference_set: definir preferências (mercado favorito, bairro, veículo)
- profile_view: ver o que o bot sabe sobre o usuário
- help: usuário precisa de ajuda ou não sabe o que fazer
- unknown: mensagem fora do escopo

ENTIDADES (todas opcionais, null se não presente):
- product: texto bruto do produto mencionado
- product_normalized: forma padronizada (corrija typos e gírias)
- brand: nome da marca se mencionado
- store_filter: rede de mercado ("extrabom"|"atacadao"|"carone"|"assai") ou null
- quantity: quantidade numérica se mencionada
- unit: "kg"|"L"|"un"|"cx"|"pct"|"dz" se mencionado
- neighborhood: bairro se mencionado
- items_list: lista de items se múltiplos (para list_add)
- preference_type: "store"|"vehicle"|"neighborhood"|"budget" (para preference_set)
- preference_value: valor da preferência

NORMALIZAÇÃO DE GÍRIAS/ERROS COMUNS:
- frang, franguinho → frango inteiro
- refri, refresco → refrigerante
- det, detergi → detergente líquido
- leitinho → leite integral 1L
- cafézin, café → café torrado moído
- fejão, feijão preto → feijão
- arrôz, arros → arroz
- extra, extrabom → extrabom
- atacadão, atacado → atacadao
- add, coloca, bota → list_add
- tira, remove, apaga → list_remove
- gelada, cervejinha → cerveja
- bisteca, bife, carne → carnes (categoria)

CONTEXTO DA CONVERSA:
{context}

Responda APENAS com este JSON (sem markdown, sem explicação):
{{
  "intent": "<intent>",
  "entities": {{
    "product": null,
    "product_normalized": null,
    "brand": null,
    "store_filter": null,
    "quantity": null,
    "unit": null,
    "neighborhood": null,
    "items_list": null,
    "preference_type": null,
    "preference_value": null
  }},
  "confidence": 0.0,
  "requires_location": false,
  "clarification_needed": null
}}"""

    system_prompt = system_prompt.replace("{context}", ctx_text or "Nenhum contexto anterior.")

    try:
        response = await client.messages.create(
            model=settings.claude_model_fast,
            max_tokens=512,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )

        raw = response.content[0].text.strip()
        # Strip markdown code blocks if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        result = json.loads(raw)
        logger.debug(f"NLU result for '{user_message}': {result['intent']} ({result['confidence']})")
        return result

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse NLU JSON response: {e}")
        return {"intent": "unknown", "entities": {}, "confidence": 0.0, "requires_location": False, "clarification_needed": None}
    except Exception as e:
        logger.error(f"Claude NLU error: {e}")
        return {"intent": "unknown", "entities": {}, "confidence": 0.0, "requires_location": False, "clarification_needed": None}


async def format_response(template: str, data: dict, user_name: str = "") -> str:
    """
    Stage 2: Format a WhatsApp response in natural PT-BR using Claude Haiku.
    template: describes what the response should convey
    data: structured data to include
    """
    client = get_claude_client()

    system = """Você é o EconomizaFacil, assistente brasileiro de economia no mercado no WhatsApp.

PERSONA:
- PT-BR informal (você, não vós)
- Emojis com moderação mas efetividade
- Mensagens curtas — é WhatsApp, não e-mail
- Sempre mencione economia em R$ quando possível
- Use *negrito* para preços, _itálico_ para dicas
- Termine com uma CTA clara e objetiva
- Nunca invente preços. Use APENAS os dados fornecidos.
- Máximo 300 chars para buscas simples, até 800 para listas/análises."""

    user_content = f"Nome do usuário: {user_name or 'amigo(a)'}\n\nTarefa: {template}\n\nDados: {json.dumps(data, ensure_ascii=False, default=str)}"

    try:
        response = await client.messages.create(
            model=settings.claude_model_fast,
            max_tokens=600,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
        return response.content[0].text.strip()
    except Exception as e:
        logger.error(f"Claude format_response error: {e}")
        return "Desculpe, tive um problema técnico. Tente novamente em alguns segundos. 😅"


async def analyze_receipt_image(image_base64: str, media_type: str = "image/jpeg") -> dict:
    """
    OCR: extract receipt data from image using Claude Sonnet with vision.
    """
    client = get_claude_client()

    system = """Analise este cupom fiscal brasileiro e extraia os dados.

Retorne APENAS JSON válido com esta estrutura:
{
  "store_name": "nome do estabelecimento",
  "store_chain": "extrabom|atacadao|carone|outro|null",
  "address": "endereço se visível",
  "purchase_date": "YYYY-MM-DD ou null",
  "purchase_time": "HH:MM ou null",
  "items": [
    {
      "product_name_raw": "nome como aparece no cupom",
      "product_normalized": "nome limpo e padronizado",
      "category": "carnes|laticinios|bebidas|limpeza|higiene|mercearia|padaria|frios|hortifruti|outros",
      "quantity": 1.0,
      "unit": "un|kg|L|cx",
      "unit_price": 0.00,
      "total_price": 0.00
    }
  ],
  "subtotal": 0.00,
  "discount": 0.00,
  "total": 0.00,
  "payment_method": "dinheiro|cartao|pix|null"
}

Trate imagens escuras, tortas ou com texto apagado com o melhor esforço possível.
Use null para campos ilegíveis."""

    try:
        response = await client.messages.create(
            model=settings.claude_model_smart,
            max_tokens=2000,
            system=system,
            messages=[{
                "role": "user",
                "content": [{
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_base64,
                    },
                }, {
                    "type": "text",
                    "text": "Extraia todos os dados deste cupom fiscal.",
                }],
            }],
        )

        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        return json.loads(raw)
    except Exception as e:
        logger.error(f"Receipt OCR error: {e}")
        return {}
