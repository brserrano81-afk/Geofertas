const fs = require('fs');
const path = require('path');

const WK_PATH = "C:\\Users\\USER\\OneDrive - optsolv.com.br\\Área de Trabalho\\EconomizaFacil\\WK n8n";

const IDS = {
  "rNoJW54t6BdRs8qb": "biznvV2f1wCm1UIE",
  "HgawDMHATOkueizg": "S4e0l9TPLbgwpU0j",
  "dtqpNKCGQLWseJi2": "UBdswKfelhGBBxbq",
  "R29YVG4I4a9SB8Gj": "7QyiE1s7CW6cWWf5",
  "2vXRDfujjjLJovVE": "0CniX90HxEDEcuBk",
  "C6cigmpXUGEFQU5r": "WiZN073PtTVLjZ81",
  "Sp2yXzOtwm9NzV1A": "wlvjc2PKcPfve3VF",
  "M6LJwyLTbpgBktLI": "lB3l3kYMhcVS3Ya2",
  "nIH245UfgGMVKTIi": "6beryUQOM47O9Y3L",
  "Up9cOJIlngVPoJzf": "NDIRPLLCLkhRd1nr",
  "eIpMpyRWGEBKf2Zn": "AL6SSv8HqkEZ3Ygc",
  "C1mXBLZh1e1BW66Z": "8a30nzyOEgwsBDw8",
  "fVZV95hhqseCfeQU": "NQc9OeR6F4MWZZtH"
};

const files = ['PROD_WK2-Orquestrador.json', 'PROD_WK1-Entrada-WhatsApp.json'];

files.forEach(function(file) {
  const filePath = path.join(WK_PATH, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let count = 0;

  Object.entries(IDS).forEach(function(entry) {
    if (content.includes(entry[0])) {
      content = content.split(entry[0]).join(entry[1]);
      count++;
    }
  });

  fs.writeFileSync(filePath, content, 'utf8');
  console.log("OK: " + file + " - " + count + " substituicoes");
});

console.log("Concluido!");