/**
 * SeasonalityService - Inteligência de Tendências de Preço (Item 12 do escopo)
 */

interface SeasonalityTrend {
    product: string;
    cheapestMonths: number[]; // 0-11
    expensiveMonths: number[]; // 0-11
    reason?: string;
}

class SeasonalityService {
    // Base estática inicial baseada em padrões de mercado brasileiro
    private trends: SeasonalityTrend[] = [
        {
            product: 'frango',
            cheapestMonths: [5, 6], // Junho, Julho (Inverno/Safra de grãos)
            expensiveMonths: [11, 0, 1], // Dez, Jan, Fev (Festas)
            reason: 'maior oferta de grãos para ração no meio do ano',
        },
        {
            product: 'carne bovina',
            cheapestMonths: [3, 4, 5], // Abril a Junho (Entressafra, maior abate)
            expensiveMonths: [11, 0], // Dez, Jan
        },
        {
            product: 'ovos',
            cheapestMonths: [8, 9, 10], // Primavera
            expensiveMonths: [1, 2, 3], // Quaresma
        },
        {
            product: 'leite',
            cheapestMonths: [11, 0], // Verão (Pasto melhor)
            expensiveMonths: [5, 6, 7], // Inverno (Pasto seco)
        },
        {
            product: 'tomate',
            cheapestMonths: [6, 7, 8],
            expensiveMonths: [1, 2, 3],
        },
        {
            product: 'banana',
            cheapestMonths: [9, 10, 11],
            expensiveMonths: [5, 6, 7],
        },
    ];

    getTrend(productName: string): SeasonalityTrend | null {
        const normalized = this.normalize(productName);
        return this.trends.find(t => 
            normalized.includes(t.product) || t.product.includes(normalized)
        ) || null;
    }

    formatTrendMessage(productName: string): string | null {
        const trend = this.getTrend(productName);
        if (!trend) return null;

        const now = new Date();
        const currentMonth = now.getMonth();
        const isCheapest = trend.cheapestMonths.includes(currentMonth);
        const isExpensive = trend.expensiveMonths.includes(currentMonth);

        const monthNames = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];

        let message = `💡 **Dica de Sazonalidade**: ${this.capitalize(trend.product)}\n`;

        if (isCheapest) {
            message += `✅ **Aproveite!** Estamos nos meses de menor preço para este item.`;
        } else if (isExpensive) {
            message += `⚠️ **Atenção!** Este item costuma ficar mais caro nesta época do ano.`;
        } else {
            message += `ℹ️ O preço costuma cair em: **${trend.cheapestMonths.map(m => monthNames[m]).join(', ')}**.`;
        }

        if (trend.reason) {
            message += `\n_(Motivo: ${trend.reason})_`;
        }

        return message;
    }

    private normalize(str: string): string {
        return str.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    private capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

export const seasonalityService = new SeasonalityService();
