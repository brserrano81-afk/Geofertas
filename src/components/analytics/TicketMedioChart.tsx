import { adminColors } from '../../pages/admin/adminStyles';

interface Props {
    avgTicket: number;
    avgBasketSize: number;
    avgSavings: number;
    totalPurchases: number;
}

export default function TicketMedioChart({
    avgTicket,
    avgBasketSize,
    avgSavings,
    totalPurchases,
}: Props) {
    const savingsPct = avgTicket > 0 ? (avgSavings / (avgTicket + avgSavings)) * 100 : 0;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: 20 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 13, color: adminColors.textSecondary, fontWeight: 500 }}>Ticket Médio por Compra</div>
                    <div style={{ fontSize: 36, fontWeight: 800, color: adminColors.text }}>
                        R$ {avgTicket.toFixed(2).replace('.', ',')}
                    </div>
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                        <span style={{ color: adminColors.textSecondary }}>Itens por Carrinho</span>
                        <span style={{ fontWeight: 700 }}>{avgBasketSize.toFixed(1)} itens</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                        <span style={{ color: adminColors.textSecondary }}>Compras Analisadas</span>
                        <span style={{ fontWeight: 700 }}>{totalPurchases.toLocaleString('pt-BR')}</span>
                    </div>
                </div>
            </div>

            <div style={{ 
                background: `${adminColors.primary}08`, 
                borderRadius: 16, 
                padding: '24px',
                border: `1px solid ${adminColors.primary}15`,
                display: 'flex',
                flexDirection: 'column',
                gap: 16
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: adminColors.primary }}>Economia Estimada</div>
                    <div style={{ 
                        fontSize: 18, 
                        fontWeight: 800, 
                        color: adminColors.success 
                    }}>
                        {savingsPct.toFixed(1)}%
                    </div>
                </div>

                <div style={{
                    height: 10,
                    background: '#fff',
                    borderRadius: 999,
                    overflow: 'hidden'
                }}>
                    <div style={{
                        height: '100%',
                        width: `${savingsPct}%`,
                        background: adminColors.primary,
                        borderRadius: 999
                    }} />
                </div>

                <p style={{ margin: 0, fontSize: 12, color: adminColors.textSecondary, lineHeight: 1.5 }}>
                    Representa a diferença entre o preço médio e o menor preço encontrado 
                    nos mercados da região para os mesmos itens.
                </p>
            </div>
        </div>
    );
}
