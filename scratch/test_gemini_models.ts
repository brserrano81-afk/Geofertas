import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    const key = process.env.VITE_GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    if (!key) {
        console.error('API KEY MISSING');
        return;
    }
    const genAI = new GoogleGenerativeAI(key);
    
    const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'];
    
    for (const m of models) {
        try {
            console.log(`Testing model: ${m}...`);
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent("Oi");
            console.log(`✅ Model ${m} works: ${result.response.text().slice(0, 20)}...`);
        } catch (err) {
            console.error(`❌ Model ${m} failed:`, err.message);
        }
    }
}

test();
