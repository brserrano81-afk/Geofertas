const fs = require('fs');
const path = require('path');

const WK_PATH = "C:\\Users\\USER\\OneDrive - optsolv.com.br\\Área de Trabalho\\EconomizaFacil\\WK n8n";

const files = fs.readdirSync(WK_PATH).filter(f => f.endsWith('.json'));

files.forEach(function(file) {
  const filePath = path.join(WK_PATH, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes('Execute Workflow Trigger')) {
    content = content.split('Execute Workflow Trigger').join('When Executed by Another Workflow');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("OK: " + file);
  }
});

console.log("Concluido!");