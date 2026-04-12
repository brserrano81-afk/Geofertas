import { Client, LocalAuth } from 'whatsapp-web.js';
import type { Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

import { chatService } from '../services/ChatService';
import { aiService } from '../services/AiService';
// Fluxo legado/local:
// este bridge conversa direto com whatsapp-web.js.
// O pipeline oficial do produto e:
// Evolution webhook -> message_inbox -> EvolutionInboxWorker -> ChatService -> message_outbox

console.log('🤖 Iniciando Economiza Fácil - WhatsApp Bridge (Alpha 1)...');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './whatsapp-session' }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

client.on('qr', (qr) => {
    console.log('\n\n📱 Escaneie o QR Code abaixo com seu WhatsApp:');
    qrcode.generate(qr, { small: true });
    console.log('\nSe o QR Code acima estiver quebrado/difícil de ler,');
    console.log('clique no link abaixo para abrir o QR Code perfeito no navegador:');
    console.log(`\x1b[36mhttps://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}\x1b[0m`);
    console.log('\nAguardando leitura...\n');
});

client.on('ready', () => {
    console.warn('[WhatsappBridge] Aviso: este bridge e legado/local e nao representa o pipeline oficial de operacao.');
    console.log('✅ Cliente do WhatsApp está PRONTO!');
    console.log('🚀 A Regra de Ouro da Classe C está ativa no WhatsApp First.');
});

function saveLog(userId: string, role: 'USER' | 'AI', message: string) {
    try {
        const logDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = path.join(logDir, `${userId.replace(/[^a-zA-Z0-9]/g, '_')}.log`);
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logFile, `[${timestamp}] ${role}: ${message}\n`);
    } catch (e) {
        console.error('Erro ao salvar log da conversa:', e);
    }
}

client.on('message', async (msg: Message) => {
    // Ignorar status e mensagens de grupo
    if (msg.isStatus || (await msg.getChat()).isGroup) return;

    const userId = msg.from; // Número do usuário (ex: 5511999999999@c.us)
    const messageContent = msg.type === 'image' ? '[IMAGEM]' : msg.type === 'ptt' ? '[ÁUDIO]' : msg.body;
    console.log(`\n📩 Nova mensagem de ${userId}: ${messageContent}`);
    saveLog(userId, 'USER', messageContent);

    // Helper for reply with logging
    const sendReply = async (text: string) => {
        saveLog(userId, 'AI', text);
        await msg.reply(text);
    };

    try {
        // Se for imagem (cupom/nota fiscal)
        if (msg.hasMedia && msg.type === 'image') {
            await sendReply('📸 Recebi sua foto! Estou analisando os itens da nota fiscal, aguarde um instante...');
            
            const media = await msg.downloadMedia();
            const buffer = Buffer.from(media.data, 'base64');
            const array = new Uint8Array(buffer);
            const response = await chatService.processImage(array, userId);
            if (response?.text) {
                await sendReply(response.text);
            }
            return;
        }

        // Se for áudio (PTT)
        if (msg.hasMedia && msg.type === 'ptt') {
            await sendReply('🎙️ Estou ouvindo seu áudio, só um segundo...');
            const media = await msg.downloadMedia();
            const buffer = Buffer.from(media.data, 'base64');
            const arrayArray = new Uint8Array(buffer);
            
            const transcribedText = await aiService.transcribeAudio(arrayArray, media.mimetype);
            
            if (!transcribedText) {
                await sendReply('❌ Não consegui entender o áudio. Pode mandar por escrito?');
                return;
            }

            console.log(`[WhatsappBridge] Áudio transcrito: "${transcribedText}"`);
            
            // Continua como se fosse texto
            const chat = await msg.getChat();
            await chat.sendStateTyping();
            
            const response = await chatService.processMessage(transcribedText, userId);
            if (response && response.text) {
                await sendReply(response.text);
            }
            return;
        }

        // Se for localização (GPS)
        if (msg.type === 'location' && msg.location) {
            const lat = msg.location.latitude;
            const lng = msg.location.longitude;
            console.log(`[WhatsappBridge] 📍 Localização recebida: ${lat}, ${lng}`);
            
            // Simula uma mensagem de texto especial para o ChatService interpretar
            const gpsMessage = `[GPS_LOCATION_UPDATE] ${lat}, ${lng}`;
            const response = await chatService.processMessage(gpsMessage, userId);
            
            if (response && response.text) {
                await sendReply(response.text);
            }
            return;
        }

        // Se for texto normal
        if (msg.body) {
            const chat = await msg.getChat();
            await chat.sendStateTyping();

            // Heurística simples: se for uma busca curta, mandar um aviso de "buscando" para dar tempo ao Web Crawler
            const isSearch = msg.body.length < 25 && !msg.body.includes(' ');
            if (isSearch) {
                 // opcional: await sendReply('⏳ Buscando ofertas ao vivo na internet...');
            }

            // Repassa para o ChatService (o cérebro)
            const response = await chatService.processMessage(msg.body, userId);
            
            if (response && response.text) {
                await sendReply(response.text);
            }
        }
    } catch (err) {
        console.error('❌ Erro no processamento:', err);
        await sendReply('Desculpe, deu um tilt aqui no sistema 🛠️. Pode repetir a mensagem?');
    }
});

client.initialize();
