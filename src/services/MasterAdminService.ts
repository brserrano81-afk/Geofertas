// ─────────────────────────────────────────────
// MasterAdminService — Comandos de administração via WhatsApp
// Número master pode: ver fila pendente, aprovar/rejeitar itens por ID
// ─────────────────────────────────────────────

import { offerQueueService, type OfferQueueItem } from './admin/OfferQueueService';

/** Normaliza número de telefone para formato comparavel (apenas dígitos, sem @s.whatsapp.net) */
function normalizePhone(phone: string): string {
    return String(phone || '')
        .split('@')[0]
        .replace(/\D/g, '')
        .replace(/^0+/, '');
}

/** Lê o número master da variável de ambiente */
function getMasterAdminPhone(): string {
    const raw =
        (typeof process !== 'undefined' ? process.env.MASTER_ADMIN_PHONE : '') || '';
    return normalizePhone(raw);
}

/** Verifica se um remoteJid pertence ao master admin */
export function isMasterAdmin(remoteJid: string): boolean {
    const master = getMasterAdminPhone();
    if (!master) return false;
    return normalizePhone(remoteJid) === master;
}

/** Resultado de um comando de admin */
export interface AdminCommandResult {
    handled: boolean;
    text: string;
}

// ── Formatação ──────────────────────────────────────────────────────

function formatPrice(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function itemSummary(item: OfferQueueItem, index?: number): string {
    const prefix = index !== undefined ? `*#${index + 1}* \`ID:${item.id.slice(-6)}\`` : `\`ID:${item.id.slice(-6)}\``;
    return (
        `${prefix}\n` +
        `🏷️ ${item.productName} — ${formatPrice(item.price)}\n` +
        `🏪 ${item.marketName}\n` +
        `📸 Enviado por: ${item.submittedBy}`
    );
}

// ── Parser de comandos ───────────────────────────────────────────────

const CMD_FILA = /^\s*(fila|queue|pendentes?)\s*$/i;
const CMD_APROVAR = /^\s*(aprovar?|aprov|ok|aceitar?)\s+([a-zA-Z0-9]+)\s*$/i;
const CMD_REJEITAR = /^\s*(rejeitar?|rejeito|rej|negar?|nao)\s+([a-zA-Z0-9]+)\s*(.*)$/i;
const CMD_AJUDA = /^\s*(ajuda|help|comandos?)\s*$/i;

function helpText(): string {
    return (
        `🔑 *Painel Master Admin via WhatsApp*\n\n` +
        `📋 *fila* — ver ofertas pendentes de aprovação\n` +
        `✅ *aprovar XXXXXX* — aprovar item pelo ID (6 últimos chars)\n` +
        `❌ *rejeitar XXXXXX [motivo]* — rejeitar com motivo opcional\n` +
        `❓ *ajuda* — exibir este menu\n\n` +
        `Exemplo:\n` +
        `  _aprovar ab12cd_\n` +
        `  _rejeitar ab12cd preco errado_`
    );
}

// ── Serviço principal ────────────────────────────────────────────────

class MasterAdminService {
    /**
     * Processa uma mensagem de texto enviada pelo master admin.
     * Retorna { handled: true, text } se reconheceu um comando, senão { handled: false }.
     */
    async processCommand(message: string, remoteJid: string): Promise<AdminCommandResult> {
        const trimmed = message.trim();

        // CMD: ajuda
        if (CMD_AJUDA.test(trimmed)) {
            return { handled: true, text: helpText() };
        }

        // CMD: fila
        if (CMD_FILA.test(trimmed)) {
            return this.handleListQueue();
        }

        // CMD: aprovar <id>
        const mAprovar = trimmed.match(CMD_APROVAR);
        if (mAprovar) {
            return this.handleApprove(mAprovar[2], remoteJid);
        }

        // CMD: rejeitar <id> [motivo]
        const mRejeitar = trimmed.match(CMD_REJEITAR);
        if (mRejeitar) {
            return this.handleReject(mRejeitar[2], remoteJid, (mRejeitar[3] || '').trim());
        }

        return { handled: false, text: '' };
    }

    private async handleListQueue(): Promise<AdminCommandResult> {
        try {
            const items = await offerQueueService.listPending();
            if (items.length === 0) {
                return { handled: true, text: '✅ Fila de ofertas vazia. Nenhuma pendente de aprovação.' };
            }

            const header = `📋 *${items.length} oferta(s) aguardando aprovação:*\n\n`;
            const lines = items.slice(0, 10).map((item, i) => itemSummary(item, i)).join('\n─────────────\n');
            const footer = items.length > 10
                ? `\n\n_...e mais ${items.length - 10}. Acesse /admin/queue para ver todas._`
                : '';

            return { handled: true, text: header + lines + footer };
        } catch (err) {
            console.error('[MasterAdminService] handleListQueue error:', err);
            return { handled: true, text: '❌ Erro ao carregar a fila. Tente novamente.' };
        }
    }

    private async handleApprove(partialId: string, reviewedBy: string): Promise<AdminCommandResult> {
        try {
            const items = await offerQueueService.listPending();
            const item = items.find((i) => i.id.endsWith(partialId) || i.id.startsWith(partialId));

            if (!item) {
                return {
                    handled: true,
                    text: `❌ Nenhum item pendente com ID terminando em *${partialId}* encontrado.\n\nDigite *fila* para ver os IDs atuais.`,
                };
            }

            const offerId = await offerQueueService.approve(item.id, item, reviewedBy);
            return {
                handled: true,
                text:
                    `✅ *Aprovado e publicado!*\n\n` +
                    itemSummary(item) +
                    `\n\n🆔 Oferta publicada com ID: \`${offerId.slice(-8)}\``,
            };
        } catch (err) {
            console.error('[MasterAdminService] handleApprove error:', err);
            return { handled: true, text: '❌ Erro ao aprovar o item. Tente novamente.' };
        }
    }

    private async handleReject(
        partialId: string,
        reviewedBy: string,
        reason: string,
    ): Promise<AdminCommandResult> {
        try {
            const items = await offerQueueService.listPending();
            const item = items.find((i) => i.id.endsWith(partialId) || i.id.startsWith(partialId));

            if (!item) {
                return {
                    handled: true,
                    text: `❌ Nenhum item pendente com ID terminando em *${partialId}* encontrado.\n\nDigite *fila* para ver os IDs atuais.`,
                };
            }

            await offerQueueService.reject(item.id, reviewedBy, reason);
            return {
                handled: true,
                text:
                    `🗑️ *Item rejeitado.*\n\n` +
                    itemSummary(item) +
                    (reason ? `\n\n📝 Motivo: ${reason}` : ''),
            };
        } catch (err) {
            console.error('[MasterAdminService] handleReject error:', err);
            return { handled: true, text: '❌ Erro ao rejeitar o item. Tente novamente.' };
        }
    }
}

export const masterAdminService = new MasterAdminService();
