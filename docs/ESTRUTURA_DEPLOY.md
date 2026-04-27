# Estrutura de Deploy - Geofertas

## Visão Geral

O projeto Geofertas é deployado em uma arquitetura distribuída utilizando três principais plataformas:

```
┌─────────────────────────────────────────────────────────┐
│                   Geofertas App                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Frontend React    │    Backend Services    │  Database │
│  ┌──────────┐      │    ┌──────────────┐   │ ┌────────┐ │
│  │  Vercel  │◄─────┤    │  Railway     │◄──┤ │Firebase│ │
│  │          │      │    │              │   │ │        │ │
│  └──────────┘      │    └──────────────┘   │ └────────┘ │
│                    │                        │            │
└────────────────────┴────────────────────────┴────────────┘
```

---

## 1. Firebase

### Localização
- **Plataforma**: Google Cloud Firebase
- **Região**: US (padrão)
- **URL Console**: https://console.firebase.google.com

### Serviços

#### 1.1 Firestore Database
- **Tipo**: NoSQL Cloud Database
- **Função**: Armazenamento de dados de produtos, ofertas, categorias e pedidos
- **Configuração**: [firestore.rules](../firestore.rules)
- **Índices**: [firestore.indexes.json](../firestore.indexes.json)
- **Status**: Produção

#### 1.2 Cloud Storage
- **Função**: Armazenamento de arquivos (imagens, documentos)
- **Configuração**: [storage.rules](../storage.rules)
- **Status**: Produção

#### 1.3 Authentication
- **Provedores**: Email/Password, Google Sign-In, WhatsApp (via Evolution)
- **Status**: Produção

### Deploy

**Arquivo de configuração**: [firebase.json](../firebase.json)

```bash
# Deploy de regras e índices
firebase deploy --only firestore:rules,firestore:indexes,storage
```

**Scripts relacionados**:
- Seed de dados: [EconomizaFacil-Firebase/popular_*.js](../EconomizaFacil-Firebase/)
- Validação: [EconomizaFacil-Firebase/CORRIGIR_*.js](../EconomizaFacil-Firebase/)

---

## 2. Vercel

### Localização
- **Plataforma**: Vercel (Vercel Inc.)
- **Projeto**: Geofertas Frontend
- **URL**: [Produção - TBD]
- **Painel**: https://vercel.com/dashboard

### Serviços

#### 2.1 Frontend React
- **Tipo**: Single Page Application (SPA)
- **Build**: Vite + TypeScript
- **Localização do código**: [src/](../src/)
- **Status**: Produção

### Deploy

**Arquivo de configuração**: [vercel.json](../vercel.json)

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

**Processo de Build**:
```bash
# Instalação e build
npm run build

# Output: dist/
```

**Trigger de Deploy**:
- Automático: Push para branch principal no Git
- Manual: Vercel CLI ou dashboard

---

## 3. Railway

### Localização
- **Plataforma**: Railway
- **Projeto**: Geofertas Backend
- **URL**: [Produção - TBD]
- **Painel**: https://railway.app/project

### Serviços

#### 3.1 SEFAZ Proxy
- **Tipo**: Node.js Express API
- **Função**: Intermediário de requisições para integração com SEFAZ (NF-e, CT-e)
- **Localização**: [api/sefaz-proxy.js](../api/sefaz-proxy.js)
- **Porta**: 3000 (configurável via ENV)
- **Status**: Produção

#### 3.2 Evolution Worker
- **Tipo**: Node.js Worker
- **Função**: Processa webhooks do Evolution (WhatsApp)
- **Localização**: [src/workers/EvolutionInboxWorker.ts](../src/workers/EvolutionInboxWorker.ts)
- **Status**: Produção

### Deploy

**Arquivo de configuração**: [railway.toml](../railway.toml)

```toml
[build]
buildCommand = "npm install"

[deploy]
startCommand = "node api/sefaz-proxy.js & npm run worker:evolution"
```

**Scripts de inicialização**:
```bash
# SEFAZ Proxy
npm run proxy

# Evolution Worker
npm run worker:evolution

# Ambos simultaneamente
npm run start:all
```

**Variáveis de Ambiente Necessárias**:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `SEFAZ_CERT_PATH` (caminho para certificado digital)
- `PORT` (padrão: 3000)

---

## 4. Resumo de Localização

| Serviço | Plataforma | Tipo | Local de Deploy | Build |
|---------|-----------|------|-----------------|-------|
| Frontend | Vercel | React SPA | Production | `npm run build` |
| Firestore | Firebase | NoSQL Database | Cloud | Deploy automático |
| Storage | Firebase | File Storage | Cloud | Deploy automático |
| SEFAZ Proxy | Railway | Node.js API | Production | `npm install` |
| Evolution Worker | Railway | Node.js Worker | Production | `npm install` |

---

## 5. Fluxo de Deploy

### Frontend (Vercel)
```
Push → Git Repository → Vercel Webhook → Build (npm run build) → Deploy
                                              ↓
                                           dist/
```

### Backend (Railway)
```
Push → Git Repository → Railway Webhook → Build (npm install) → Start Services
                                                   ↓
                                        node api/sefaz-proxy.js &
                                        npm run worker:evolution
```

### Firebase
```
npm firebase deploy → Firestore Rules + Storage Rules + Indexes
```

---

## 6. Configuração de Ambiente por Plataforma

### Desenvolvimento Local
```bash
npm run dev           # Frontend
npm run proxy         # SEFAZ Proxy
npm run worker:evolution  # Evolution Worker
```

### Staging/Testing
- Firebase: Índices de teste
- Vercel: Preview Deployment
- Railway: Staging environment

### Produção
- Firebase: Índices otimizados
- Vercel: Production domain
- Railway: Auto-scaled instances

---

## 7. Logs e Monitoramento

| Serviço | Local de Logs | Dashboard |
|---------|--------------|-----------|
| Firebase | Firebase Console | https://console.firebase.google.com |
| Vercel | Vercel Dashboard | https://vercel.com/dashboard |
| Railway | Railway Logs | https://railway.app/project |
| SEFAZ Proxy | Railway Logs | Railway Dashboard |
| Evolution Worker | Railway Logs | Railway Dashboard |

---

## 8. Referências de Configuração

- [firebase.json](../firebase.json) - Configuração Firebase
- [vercel.json](../vercel.json) - Configuração Vercel
- [railway.toml](../railway.toml) - Configuração Railway
- [package.json](../package.json) - Scripts e dependências
- [vite.config.ts](../vite.config.ts) - Build configuration
- [tsconfig.json](../tsconfig.json) - TypeScript configuration

---

## 9. Procedimentos Comuns

### Fazer Deploy no Firebase
```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### Fazer Deploy no Vercel
```bash
vercel deploy --prod
```

### Fazer Deploy no Railway
Automático ao fazer push para a branch configurada (geralmente `main`)

### Testar SEFAZ Proxy Localmente
```bash
npm run proxy
```

### Testar Evolution Worker Localmente
```bash
npm run worker:evolution:once --verbose
```

---

**Última atualização**: Abril 2026
**Responsável**: DevOps / Tech Lead
