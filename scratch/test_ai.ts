import { aiService } from '../src/services/AiService';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    const message = "adiciona arroz, feijão e café";
    console.log('Testing AiService with message:', message);
    const result = await aiService.interpret(message);
    console.log('Result:', JSON.stringify(result, null, 2));
}

test().catch(console.error);
