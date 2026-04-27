const fs = require('fs');
const path = require('path');

const WK_PATH = "C:\\Users\\USER\\OneDrive - optsolv.com.br\\Área de Trabalho\\EconomizaFacil\\WK n8n";

const files = fs.readdirSync(WK_PATH).filter(f => f.endsWith('.json'));

files.forEach(file => {
  const filePath = path.join(WK_PATH, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes('n8n-nodes-base.anthropic')) {
    // Atualiza typeVersion para 1.1
    content = content.replace(
      /"type":\s*"n8n-nodes-base\.anthropic",\s*"typeVersion":\s*1/g,
      '"type": "n8n-nodes-base.anthropic", "typeVersion": 1.1'
    );
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ ${file} - typeVersion atualizado para 1.1`);
  }
});

console.log('\nConcluído!');