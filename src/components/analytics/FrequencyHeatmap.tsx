import { adminColors } from '../../pages/admin/adminStyles';

interface Props {
    matrix: number[][]; // [dia_da_semana][hora]
    weekdayFrequency: number[];
}

const DAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
const HOURS = Array.from({ length: 24 }, (_, i) => `${i}h`);

export default function FrequencyHeatmap({ matrix, weekdayFrequency }: Props) {
    const max = Math.max(...matrix.flat(), 1);

    return (
        <div style={{ display: 'grid', gap: 32 }}>
            {/* Heatmap Grid */}
            <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 800 }}>
                    {/* Header Horas */}
                    <div style={{ display: 'flex', marginBottom: 8, paddingLeft: 60 }}>
                        {HOURS.map(h => (
                            <div key={h} style={{ flex: 1, fontSize: 10, color: adminColors.textSecondary, textAlign: 'center' }}>
                                {h}
                            </div>
                        ))}
                    </div>

                    {/* Linhas Dias */}
                    <div style={{ display: 'grid', gap: 4 }}>
                        {DAYS.map((day, dIdx) => (
                            <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 60, fontSize: 11, fontWeight: 700, color: adminColors.textSecondary }}>
                                    {day}
                                </div>
                                <div style={{ display: 'flex', flex: 1, gap: 4 }}>
                                    {matrix[dIdx].map((val, hIdx) => {
                                        const intensity = val / max;
                                        return (
                                            <div
                                                key={hIdx}
                                                title={`${day} às ${hIdx}h: ${val} eventos`}
                                                style={{
                                                    flex: 1,
                                                    aspectRatio: '1',
                                                    borderRadius: 4,
                                                    background: val === 0 
                                                        ? `${adminColors.primary}05` 
                                                        : adminColors.primary,
                                                    opacity: val === 0 ? 1 : 0.1 + (intensity * 0.9),
                                                    transition: 'transform 0.2s',
                                                    cursor: 'pointer'
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Sumário por dia */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 16 }}>
                {DAYS.map((day, i) => {
                    const total = weekdayFrequency[i];
                    const maxFreq = Math.max(...weekdayFrequency, 1);
                    const pct = (total / maxFreq) * 100;

                    return (
                        <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: adminColors.textSecondary }}>{day}</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: adminColors.text }}>{total}</div>
                            <div style={{ height: 4, background: `${adminColors.primary}10`, borderRadius: 999 }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: adminColors.primary, borderRadius: 999 }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
