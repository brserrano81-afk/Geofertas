# EconomizaFacil.IA — Setup Guide

## Pré-requisitos
- Python 3.11+
- Docker + Docker Compose
- Node.js 20+
- ngrok
- Conta no Supabase (gratuita)
- Chave da API Anthropic

---

## 1. Variáveis de ambiente

```bash
# Backend
cp .env.example backend/.env
# Edite backend/.env com suas credenciais

# Frontend
cp frontend/.env.example frontend/.env
# Edite frontend/.env com VITE_BOT_PHONE e VITE_API_URL
```

---

## 2. Banco de dados (Supabase)

1. Crie um projeto em supabase.com
2. Copie a connection string (Session pooler, porta 5432)
3. Configure `DATABASE_URL` no `backend/.env`
4. Execute a migration:

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
```

5. Execute o seed de produtos e lojas:

```bash
python -m app.data.seed_products
```

---

## 3. WhatsApp (Evolution API)

```bash
# Inicia Evolution API e Redis
docker compose up -d

# Aguarde ~30s para inicializar
docker compose logs -f evolution-api
```

Acesse `http://localhost:8080/manager` para:
1. Ver a instância `economizafacil`
2. Escanear o QR Code com o WhatsApp do número do bot
3. Confirmar que está conectado

---

## 4. ngrok (expor o webhook)

```bash
ngrok http 8000
# Copie a URL: https://xxxx.ngrok-free.app
```

Configure o webhook no Evolution API:
```bash
curl -X POST http://localhost:8080/webhook/set/economizafacil \
  -H "apikey: economizafacil-dev-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://xxxx.ngrok-free.app/webhook/whatsapp",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

---

## 5. Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt

# Certifique-se que backend/.env está configurado
uvicorn main:app --reload --port 8000
```

Teste: `curl http://localhost:8000/health`

---

## 6. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Acesse: `http://localhost:5173`

---

## 7. Teste end-to-end

1. Envie "oi" para o número WhatsApp do bot
2. Responda "sim" ao aviso de consentimento
3. Envie "quanto tá o arroz?"
4. Aguarde a resposta com preços comparados
5. Envie "add leite e feijão na lista"
6. Envie "minha lista"
7. Acesse http://localhost:5173/analises para ver o dashboard

---

## Produção

Para produção, substitua a Evolution API pela **Meta WhatsApp Business API**:
- Registre-se em business.whatsapp.com
- Obtenha aprovação da conta WABA
- Atualize `EVOLUTION_API_URL` para o endpoint oficial
- A interface `EvolutionClient` já abstrai os chamados

---

## Estrutura do Projeto

```
Geofertas/
├── backend/         ← FastAPI + SQLAlchemy + Claude
│   ├── main.py
│   ├── config.py
│   ├── requirements.txt
│   └── app/
│       ├── api/         ← webhook + REST endpoints
│       ├── handlers/    ← lógica de negócio por feature
│       ├── pipeline/    ← NLU + router + session
│       ├── services/    ← Evolution + Claude clients
│       ├── models/      ← SQLAlchemy ORM models
│       └── data/        ← seed de produtos e lojas
├── frontend/        ← React 19 + Vite (dashboard)
│   └── src/pages/   ← Home, Analises, Lista
├── docker-compose.yml   ← Evolution API + Redis
└── .env.example
```
