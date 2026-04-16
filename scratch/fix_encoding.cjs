const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('src/services/ChatService.ts');
let content = fs.readFileSync(targetFile, 'utf8');

const mapping = {
    'â”€': '—',
    'ðŸ“ ': '📍',
    'ðŸ§®': '🧮',
    'ðŸ”—': '🔗',
    'ðŸ’¡': '💡',
    'ðŸ’ª': '💪',
    'ðŸ›’': '🛒',
    'âš ï¸ ': '⚠️',
    'ðŸ“‹': '📋',
    'â€¢': '•',
    'VocÃª': 'Você',
    'vocÃª': 'você',
    'jÃ¡': 'já',
    'estÃ¡': 'está',
    'estÃ£o': 'estão',
    'NÃ£o': 'Não',
    'nÃ£o': 'não',
    'localizaÃ§Ã£o': 'localização',
    'Ã´nibus': 'ônibus',
    'a pÃ©': 'a pé',
    'preÃ§o': 'preço',
    'preÃ§os': 'preços',
    'Ãºnico': 'único',
    'mÃºltiplos': 'múltiplos',
    'regiÃ£o': 'região',
    'atacadÃ£o': 'atacadão',
    'assaÃ­': 'assaí',
    'conheÃ§o': 'conheço',
    'configuraÃ§Ã£o': 'configuração',
    'instabilidade': 'instabilidade', // just in case
    'saÃ­da': 'saída',
    'IntercepÃ§Ã£o': 'Intercepção',
    'Ãºltima': 'última',
    'açã': 'açã', // common broken ones
    'Ã ': 'à',
    'é': 'é',
    'ê': 'ê',
    'â': 'â',
    // Special symbols
    '1ï¸ âƒ£': '1️⃣',
    '2ï¸ âƒ£': '2️⃣',
    'ðŸš—': '🚗',
    'ðŸšŒ': '🚌',
    'ðŸš¶': '🚶',
    'ðŸš²': '🚲',
    'ðŸ ·ï¸ ': '🛍️',
    'ðŸ‘‹': '👋',
    'ðŸ‘ ': '👍',
    'ðŸ’¬': '💬',
    'ðŸ“¸': '📸',
};

for (const [key, value] of Object.entries(mapping)) {
    const regex = new RegExp(key, 'g');
    content = content.replace(regex, value);
}

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Mojibake fixed in ChatService.ts');
