interface Props {
    /** matrix[weekday 0-6][hour 0-23] */
    matrix: number[][];
    /** Contagem total por dia da semana */
    weekdayFrequency: number[];
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOUR_LABELS = ['0h', '3h', '6h', '9h', '12h', '15h', '18h', '21h'];

function heatColor(intensity: number): string {
    // intensity ∈ [0,1]: branco → verde-escuro
    if (intensity <= 0) return 'rgba(15,123,108,0.04)';
    const alpha = 0.08 + intensity * 0.82;
    return `rgba(15,123,108,${alpha.toFixed(2)})`;
}

export default function FrequencyHeatmap({ matrix, weekdayFrequency }: Props) {
    // Normalizar pela célula máxima de toda a matriz
    const allValues = matrix.flatMap((row) => row);
    const maxVal = Math.max(...allValues, 1);

    return (
        <div style={{ display: 'grid', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#15322d' }}>
                Frequência por dia e hora
            </h3>

            {/* Rótulos de hora */}
            <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 480 }}>
                    {/* Linha de rótulos de hora */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '36px repeat(24, 1fr)',
                        gap: 2,
                        marginBottom: 4,
                    }}>
                        <div />
                        {Array.from({ length: 24 }, (_, h) => (
                            <div key={h} style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: 'rgba(23,51,47,0.45)',
                                textAlign: 'center',
                                visibility: h % 3 === 0 ? 'visible' : 'hidden',
                            }}>
                                {HOUR_LABELS[h / 3]}
                            </div>
                        ))}
                    </div>

                    {/* Grade de calor */}
                    {matrix.map((hours, day) => (
                        <div key={day} style={{
                            display: 'grid',
                            gridTemplateColumns: '36px repeat(24, 1fr)',
                            gap: 2,
                            marginBottom: 2,
                        }}>
                            {/* Rótulo do dia */}
                            <div style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: '#17332f',
                                display: 'flex',
                                alignItems: 'center',
                            }}>
                                {DAY_LABELS[day]}
                            </div>
                            {hours.map((val, hour) => (
                                <div
                                    key={hour}
                                    title={`${DAY_LABELS[day]} ${hour}h — ${val} evento(s)`}
                                    style={{
                                        height: 18,
                                        borderRadius: 3,
                                        background: heatColor(val / maxVal),
                                    }}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Barra de frequência por dia (resumo) */}
            <div>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'rgba(23,51,47,0.6)' }}>
                    Total por dia da semana
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                    {weekdayFrequency.map((count, day) => {
                        const maxDay = Math.max(...weekdayFrequency, 1);
                        const pct = (count / maxDay) * 100;
                        return (
                            <div key={day} style={{ display: 'grid', gap: 4, textAlign: 'center' }}>
                                <div style={{
                                    height: 48,
                                    display: 'flex',
                                    alignItems: 'flex-end',
                                    justifyContent: 'center',
                                }}>
                                    <div style={{
                                        width: '60%',
                                        height: `${Math.max(pct, 4)}%`,
                                        borderRadius: '4px 4px 0 0',
                                        background: pct >= 90
                                            ? '#0f7b6c'
                                            : `rgba(15,123,108,${0.25 + pct * 0.006})`,
                                    }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 800, color: '#17332f' }}>
                                    {DAY_LABELS[day]}
                                </span>
                                <span style={{ fontSize: 10, color: 'rgba(23,51,47,0.5)', fontVariantNumeric: 'tabular-nums' }}>
                                    {count}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
