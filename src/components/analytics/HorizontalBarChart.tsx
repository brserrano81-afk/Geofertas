// Componente base reutilizado por TopCategories, TopProducts, TopRegions e MarketRanking
import type { RankedItem } from '../../services/admin/AnalyticsService';

interface Props {
    title: string;
    badge?: string;
    data: RankedItem[];
    color?: string;
    emptyMessage?: string;
}

export default function HorizontalBarChart({
    title,
    badge,
    data,
    color = '#0f7b6c',
    emptyMessage = 'Sem dados suficientes ainda.',
}: Props) {
    const max = data.length > 0 ? Math.max(...data.map((d) => d.count)) : 1;

    return (
        <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#15322d' }}>
                    {title}
                </h3>
                {badge && (
                    <span style={{
                        background: 'rgba(15,123,108,0.10)',
                        color: '#0f6d61',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '2px 9px',
                    }}>
                        {badge}
                    </span>
                )}
            </div>

            {data.length === 0 ? (
                <p style={{ margin: 0, color: 'rgba(21,50,45,0.5)', fontSize: 13 }}>
                    {emptyMessage}
                </p>
            ) : (
                <div style={{ display: 'grid', gap: 9 }}>
                    {data.map((item, i) => {
                        const pct = max > 0 ? (item.count / max) * 100 : 0;
                        return (
                            <div key={item.label} style={{ display: 'grid', gap: 4 }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: '#17332f',
                                }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <span style={{ color: '#0f7b6c', fontWeight: 900, minWidth: 18 }}>
                                            {i + 1}.
                                        </span>
                                        {item.label || '—'}
                                    </span>
                                    <span style={{ color: 'rgba(23,51,47,0.6)', fontVariantNumeric: 'tabular-nums' }}>
                                        {item.count.toLocaleString('pt-BR')}
                                    </span>
                                </div>
                                <div style={{
                                    height: 8,
                                    borderRadius: 999,
                                    background: 'rgba(15,123,108,0.10)',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${pct}%`,
                                        borderRadius: 999,
                                        background: i === 0
                                            ? color
                                            : `rgba(15,123,108,${0.85 - i * 0.08})`,
                                        transition: 'width 0.6s ease',
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
