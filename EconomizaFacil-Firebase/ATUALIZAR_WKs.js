const fs = require('fs');
const path = require('path');

// ─── CONFIGURAÇÃO ─────────────────────────────────────────────────────────────
const PASTA_WKS = 'C:\\Users\\USER\\OneDrive - optsolv.com.br\\Área de Trabalho\\EconomizaFacil\\WK n8n';
const ANTHROPIC_ID = '2sXMnscHZ1pEV0YL';
const FIRESTORE_ID = 'RwHEfiOBK9nSLwsE';
const FIREBASE_PROJECT_ID = 'geofertas-325b0';
const EVOLUTION_API_KEY = '0efd8ca73e559c030972427799a86703ad96ac78b0534afd56f5a55dcb3294ff';

const WK_IDS = {
  WK3_ID_AQUI: '9islHZIlZfJdBzVx',
  WK_CONTEXTO_ID_AQUI: '1LKPD4bbq6lcSU2r',
  WK4_ID_AQUI: 'g1Ggh23M51lJJPKN',
  WK5A_ID_AQUI: 'F5n0Cb4FbsCXZ5VE',
  WK5B_ID_AQUI: 'X9SWGgdsbwcIXxZL',
  WK5C_ID_AQUI: 'MrFVksPRkRyv1TVI',
  WK5D_ID_AQUI: 'cv1exZu9371FZJeN',
  WK6B_ID_AQUI: 'BFJBIGalJEpeU2Gs',
  WK7_ID_AQUI: 'qGjE8FZIX83iuWYr',
  WK8_ID_AQUI: 'FMZv8kSLCLDiprJq',
  WK9_ID_AQUI: 'TeTxPiPKoTvrFE6x',
  WK11_ID_AQUI: 'vXaaXQJttZEsqUgI',
  WK12_ID_AQUI: 'QVoNd9V5fInNsGwi',
  WK2_ID_AQUI: 'okD1vc2nRWb1yre0'
};
// ──────────────────────────────────────────────────────────────────────────────

const SUBSTITUICOES = {
  'ANTHROPIC_CREDENTIAL_ID': ANTHROPIC_ID,
  'FIRESTORE_CREDENTIAL_ID': FIRESTORE_ID,
  'SEU_PROJECT_ID_FIREBASE': FIREBASE_PROJECT_ID,
  'SEU_EVOLUTION_API_KEY': EVOLUTION_API_KEY,
  ...WK_IDS
};

function processarArquivo(filePath) {
  let conteudo = fs.readFileSync(filePath, 'utf8');
  let alteracoes = 0;

  for (const [placeholder, valor] of Object.entries(SUBSTITUICOES)) {
    const regex = new RegExp(placeholder, 'g');
    const matches = conteudo.match(regex);
    if (matches) {
      conteudo = conteudo.replace(regex, valor);
      alteracoes += matches.length;
    }
  }

  if (alteracoes > 0) {
    fs.writeFileSync(filePath, conteudo, 'utf8');
    console.log(`✅ ${path.basename(filePath)} — ${alteracoes} substituições`);
  } else {
    console.log(`⚪ ${path.basename(filePath)} — nada para substituir`);
  }
}

console.log('EconomizaFacil.IA — Atualizando WKs');
console.log('=====================================\n');

const arquivos = fs.readdirSync(PASTA_WKS)
  .filter(f => f.startsWith('PROD_WK') && f.endsWith('.json'));

if (arquivos.length === 0) {
  console.log('❌ Nenhum arquivo PROD_WK*.json encontrado em:', PASTA_WKS);
  console.log('Verifique a variável PASTA_WKS no script.');
  process.exit(1);
}

console.log(`Encontrados ${arquivos.length} arquivos WK:\n`);
arquivos.forEach(f => processarArquivo(path.join(PASTA_WKS, f)));

console.log('\n=====================================');
console.log('✅ Todos os WKs atualizados!');
console.log('Agora delete os WKs antigos no n8n e reimporte os arquivos atualizados.\n');
