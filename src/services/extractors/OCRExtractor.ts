// ─────────────────────────────────────────────
// OCRExtractor — Extrai texto de imagens usando Canvas
// ─────────────────────────────────────────────

export async function extractTextFromImage(imageData: Uint8Array): Promise<string> {
    console.log(`[OCRExtractor] Processing ${imageData.length} bytes`);
    // Fallback: retorna vazio, pois a extração real é feita pelo VisionService (GPT-4o)
    return '';
}

export function extractQRCodeFromImage(imageData: Uint8Array): string | null {
    try {
        // QR Code detection via jsQR would go here
        // For now, returns null — the IngestionPipeline handles QR via links
        console.log(`[OCRExtractor] QR detection not yet implemented in browser (${imageData.length} bytes).`);
        return null;
    } catch (err) {
        return null;
    }
}
