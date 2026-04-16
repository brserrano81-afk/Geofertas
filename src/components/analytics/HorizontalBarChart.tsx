// Componente base reutilizado por TopCategories, TopProducts, TopRegions e MarketRanking
import type { RankedItem } from '../../services/admin/AnalyticsService';
import { adminColors } from '../../pages/admin/adminStyles';

interface Props {
    badge?: string;
    data: RankedItem[];
    color?: string;
    emptyMessage?: string;
}

export default function HorizontalBarChart({
    badge,
    data,
    color = adminColors.primary,
    emptyMessage = 'Sem dados suficientes ainda.',
}: Props) {
    const max = data.length > 0 ? Math.max(...data.map((d) => d.count)) : 1;

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {/* O título agora é passado pelo pai para melhor controle de layout */}
                {badge && (
                    <span style={{
                        background: `${adminColors.primary}12`,
                        color: adminColors.primary,
                        borderRadius: 9,
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '2px 8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                    }}>
                        {badge}
                    </span>
                )}
            </div>

            {data.length === 0 ? (
                <p style={{ margin: 0, color: adminColors.textSecondary, fontSize: 13 }}>
                    {emptyMessage}
                </p>
            ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                    {data.map((item, i) => {
                        const pct = max > 0 ? (item.count / max) * 100 : 0;
                        return (
                            <div key={item.label} style={{ display: 'grid', gap: 6 }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: adminColors.text,
                                }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ color: adminColors.primary, fontWeight: 800, minWidth: 20 }}>
                                            {i + 1}.
                                        </span>
                                        {item.label || '—'}
                                    </span>
                                    <span style={{ color: adminColors.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
                                        {item.count.toLocaleString('pt-BR')}
                                    </span>
                                </div>
                                <div style={{
                                    height: 6,
                                    borderRadius: 999,
                                    background: `${adminColors.primary}08`,
                                    overflow: 'hidden',
                                }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${pct}%`,
                                        borderRadius: 999,
                                        background: i === 0
                                            ? color
                                            : `${adminColors.primary}${Math.round(255 * (0.8 - i * 0.1)).toString(16).padStart(2, '0')}`,
                                        transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                                    }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
