interface Props {
    avgTicket: number;
    avgBasketSize: number;
    avgSavings: number;
    totalPurchases: number;
}

function formatCurrency(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface KpiCardProps {
    label: string;
    value: string;
    sub?: string;
    tone?: 'green' | 'neutral' | 'amber';
}

function KpiCard({ label, value, sub, tone = 'neutral' }: KpiCardProps) {
    const colors = {
        green: { bg: 'rgba(15,123,108,0.08)', fg: '#0f6d61', num: '#0a5a50' },
        neutral: { bg: 'rgba(17,52,47,0.05)', fg: '#17332f', num: '#12302b' },
        amber: { bg: 'rgba(184,128,16,0.08)', fg: '#9c6c0c', num: '#7a520a' },
    }[tone];

    return (
        <div style={{
            background: colors.bg,
            borderRadius: 16,
            padding: '18px 20px',
            display: 'grid',
            gap: 6,
        }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: colors.fg, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {label}
            </span>
            <span style={{ fontSize: 28, fontWeight: 900, color: colors.num, lineHeight: 1 }}>
                {value}
            </span>
            {sub && (
                <span style={{ fontSize: 12, color: 'rgba(23,51,47,0.56)' }}>
                    {sub}
                </span>
            )}
        </div>
    );
}

export default function TicketMedioChart({ avgTicket, avgBasketSize, avgSavings, totalPurchases }: Props) {
    return (
        <div style={{ display: 'grid', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#15322d' }}>
                KPIs de compra
            </h3>
            <div style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            }}>
                <KpiCard
                    label="Ticket médio"
                    value={formatCurrency(avgTicket)}
                    sub="média dos usuários ativos"
                    tone="green"
                />
                <KpiCard
                    label="Cesta média"
                    value={`${avgBasketSize.toFixed(1)} itens`}
                    sub="por compra registrada"
                    tone="neutral"
                />
                <KpiCard
                    label="Economia média"
                    value={formatCurrency(avgSavings)}
                    sub="por usuário no período"
                    tone="amber"
                />
                <KpiCard
                    label="Compras registradas"
                    value={totalPurchases.toLocaleString('pt-BR')}
                    sub="total acumulado"
                    tone="neutral"
                />
            </div>
        </div>
    );
}
