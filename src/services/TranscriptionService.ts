// TranscriptionService — Transcrição de áudio via OpenAI Whisper
// Padrão de injeção de dependência idêntico ao VisionService.

function getOpenAIKey(): string {
    return process.env.OPENAI_API_KEY || '';
}

class TranscriptionService {
    /**
     * Transcreve um payload de áudio usando a API Whisper da OpenAI.
     *
     * @param audioPayload - Buffer com os bytes do áudio OU string base64
     * @returns Texto transcrito (sem espaços extras)
     * @throws Error se a API falhar ou a chave não estiver configurada
     */
    async transcribeAudio(audioPayload: string | Buffer): Promise<string> {
        const apiKey = getOpenAIKey();
        if (!apiKey) {
            throw new Error('[TranscriptionService] OPENAI_API_KEY não configurada.');
        }

        const buffer: Buffer = typeof audioPayload === 'string'
            ? Buffer.from(audioPayload, 'base64')
            : audioPayload;

        const formData = new FormData();
        // WhatsApp envia áudio em formato OGG/OPUS
        formData.append('file', new Blob([buffer as any], { type: 'audio/ogg' }), 'audio.ogg');
        formData.append('model', 'whisper-1');
        formData.append('language', 'pt');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`[TranscriptionService] API error (${response.status}): ${errorText}`);
        }

        const result = await response.json() as { text: string };
        const transcribed = String(result.text || '').trim();

        console.log(`[TranscriptionService] Transcrição concluída (${transcribed.length} chars).`);
        return transcribed;
    }
}

export const transcriptionService = new TranscriptionService();
