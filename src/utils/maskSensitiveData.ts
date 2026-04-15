/**
 * Mascaramento de identificadores pessoais para logs operacionais.
 * Mantém diagnóstico sem expor dados brutos em plaintext.
 */

/**
 * Mascara número de telefone: mantém prefixo (6 dígitos) e sufixo (4 dígitos).
 * Exemplo: "5527998862440" → "552799*****2440"
 */
export function maskPhone(phone: string): string {
    if (!phone || typeof phone !== 'string') return '***';
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 10) return '***' + digits.slice(-4);
    const prefix = digits.slice(0, 6);
    const suffix = digits.slice(-4);
    const masked = '*'.repeat(Math.max(digits.length - 10, 3));
    return `${prefix}${masked}${suffix}`;
}

/**
 * Mascara JID do WhatsApp: mascara a parte numérica, preserva domínio.
 * Exemplo: "5527998862440@s.whatsapp.net" → "552799*****2440@s.whatsapp.net"
 */
export function maskJid(jid: string): string {
    if (!jid || typeof jid !== 'string') return '***';
    const atIdx = jid.indexOf('@');
    if (atIdx === -1) return maskPhone(jid);
    const numeric = jid.slice(0, atIdx);
    const domain = jid.slice(atIdx);
    return `${maskPhone(numeric)}${domain}`;
}

/**
 * Mascara remoteJid ou telefone bruto conforme formato detectado.
 * Aceita JID completo ou apenas dígitos.
 */
export function maskIdentifier(value: string | undefined | null): string {
    if (!value) return 'desconhecido';
    return value.includes('@') ? maskJid(value) : maskPhone(value);
}
