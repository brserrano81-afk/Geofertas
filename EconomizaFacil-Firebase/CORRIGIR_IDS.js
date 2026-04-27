const fs = require('fs');
const path = require('path');

const WK_PATH = "C:\\Users\\USER\\OneDrive - optsolv.com.br\\Área de Trabalho\\EconomizaFacil\\WK n8n";

const IDS = {
  "9islHZIlZfJdBzVx": "rNoJW54t6BdRs8qb",
  "g1Ggh23M51lJJPKN": "HgawDMHATOkueizg",
  "F5n0Cb4FbsCXZ5VE": "dtqpNKCGQLWseJi2",
  "X9SWGgdsbwcIXxZL": "R29YVG4I4a9SB8Gj",
  "MrFVksPRkRyv1TVI": "2vXRDfujjjLJovVE",
  "cv1exZu9371FZJeN": "C6cigmpXUGEFQU5r",
  "BFJBIGalJEpeU2Gs": "Sp2yXzOtwm9NzV1A",
  "qGjE8FZIX83iuWYr": "M6LJwyLTbpgBktLI",
  "FMZv8kSLCLDiprJq": "nIH245UfgGMVKTIi",
  "TeTxPiPKoTvrFE6x": "Up9cOJIlngVPoJzf",
  "vXaaXQJttZEsqUgI": "eIpMpyRWGEBKf2Zn",
  "QVoNd9V5fInNsGwi": "C1mXBLZh1e1BW66Z",
  "1LKPD4bbq6lcSU2r": "fVZV95hhqseCfeQU"
};

const files = ['PROD_WK2-Orquestrador.json', 'PROD_WK1-Entrada-WhatsApp.json'];

files.forEach(function(file) {
  const filePath = path.join(WK_PATH, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let count = 0;

  Object.entries(IDS).forEach(function(entry) {
    const oldId = entry[0];
    const newId = entry[1];
    if (content.includes(oldId)) {
      content = content.split(oldId).join(newId);
      count++;
      console.log("  " + oldId + " -> " + newId);
    }
  });

  fs.writeFileSync(filePath, content, 'utf8');
  console.log("OK: " + file + " - " + count + " substituicoes");
});

console.log("Concluido!");