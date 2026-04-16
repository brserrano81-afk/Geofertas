import { useEffect, useState } from 'react';
import { 
    Users, 
    Activity, 
    TrendingUp, 
    PiggyBank,
    ShieldCheck
} from 'lucide-react';

import { analyticsService, type AnalyticsSummary } from '../../services/admin/AnalyticsService';
import {
    adminBadgeStyle,
    adminPanelStyle,
    adminShellStyle,
    adminColors,
} from './adminStyles';

import TopProductsChart from '../../components/analytics/TopProductsChart';
import TopCategoriesChart from '../../components/analytics/TopCategoriesChart';
import TicketMedioChart from '../../components/analytics/TicketMedioChart';
import FrequencyHeatmap from '../../components/analytics/FrequencyHeatmap';
import RegionConsumptionMap from '../../components/analytics/RegionConsumptionMap';
import MarketRankingChart from '../../components/analytics/MarketRankingChart';

const EMPTY_MATRIX = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

const emptySummary: AnalyticsSummary = {
    eventCount: 0,
    userCount: 0,
    topCategories: [],
    topPriceQueryCategories: [],
    topMarkets: [],
    topRegions: [],
    weekdayFrequency: new Array<number>(7).fill(0),
    weekdayHourMatrix: EMPTY_MATRIX,
    avgTicket: 0,
    avgBasketSize: 0,
    avgSavings: 0,
    totalPurchases: 0,
};

function KPICard({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: any; color: string }) {
    return (
        <div style={{
            ...adminPanelStyle,
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            padding: '24px'
        }}>
            <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: `${color}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: color
            }}>
                <Icon size={24} />
            </div>
            <div>
                <div style={{ fontSize: 13, color: adminColors.textSecondary, fontWeight: 500, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: adminColors.text }}>{value}</div>
            </div>
        </div>
    );
}

function SkeletonPanel() {
    return (
        <div style={{
            ...adminPanelStyle,
            minHeight: 160,
            background: 'rgba(109, 40, 217, 0.02)',
            animation: 'pulse 1.6s ease-in-out infinite',
        }} />
    );
}

export default function AdminAnalytics() {
    const [summary, setSummary] = useState<AnalyticsSummary>(emptySummary);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        analyticsService
            .loadSummary()
            .then(setSummary)
            .catch((err) => {
                console.error('[AdminAnalytics] load error', err);
                setError('Não foi possível carregar os dados analíticos agora.');
            })
            .finally(() => setLoading(false));
    }, []);

    return (
        <div style={adminShellStyle}>
            {/* ── Page Title ────────────────────────────────────────── */}
            <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Painel Analítico</h1>
                    <span style={adminBadgeStyle('purple')}>Inteligência de Mercado</span>
                </div>
                <p style={{ margin: 0, color: adminColors.textSecondary, fontSize: 15 }}>
                    Análise agregada de comportamento, intenções de compra e economia gerada.
                </p>
            </div>

            {error && (
                <div style={{ ...adminBadgeStyle('red'), width: 'fit-content', padding: '12px 20px', fontSize: 13 }}>
                    {error}
                </div>
            )}

            {/* ── KPI Grid ──────────────────────────────────────────── */}
            <div style={{
                display: 'grid',
                gap: 20,
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))'
            }}>
                <KPICard 
                    title="Volume de Eventos" 
                    value={loading ? '...' : summary.eventCount.toLocaleString('pt-BR')} 
                    icon={Activity} 
                    color={adminColors.primary} 
                />
                <KPICard 
                    title="Usuários Ativos" 
                    value={loading ? '...' : summary.userCount.toLocaleString('pt-BR')} 
                    icon={Users} 
                    color="#0EA5E9" 
                />
                <KPICard 
                    title="Ticket Médio" 
                    value={loading ? '...' : `R$ ${summary.avgTicket.toFixed(2).replace('.', ',')}`} 
                    icon={TrendingUp} 
                    color="#10B981" 
                />
                <KPICard 
                    title="Economia Realizada" 
                    value={loading ? '...' : `R$ ${summary.avgSavings.toFixed(2).replace('.', ',')}`} 
                    icon={PiggyBank} 
                    color="#F59E0B" 
                />
            </div>

            {/* ── Main Analytics Grid ───────────────────────────────── */}
            <div style={{
                display: 'grid',
                gap: 20,
                gridTemplateColumns: 'repeat(2, 1fr)',
            }}>
                {/* 1. Ticket Médio Detalhado (Full width in its row) */}
                <div style={{ ...adminPanelStyle, gridColumn: 'span 2' }}>
                    <h3 style={{ margin: '0 0 24px 0', fontSize: 16, fontWeight: 700 }}>Distribuição de Compra & Poupança</h3>
                    {loading ? <SkeletonPanel /> : (
                        <TicketMedioChart
                            avgTicket={summary.avgTicket}
                            avgBasketSize={summary.avgBasketSize}
                            avgSavings={summary.avgSavings}
                            totalPurchases={summary.totalPurchases}
                        />
                    )}
                </div>

                {/* 2. Top Categorias & Produtos */}
                <div>
                    <h3 style={{ margin: '0 0 16px 8px', fontSize: 15, fontWeight: 700 }}>Produtos Mais Consultados</h3>
                    <div style={adminPanelStyle}>
                        {loading ? <SkeletonPanel /> : (
                            <TopProductsChart data={summary.topPriceQueryCategories} />
                        )}
                    </div>
                </div>
                <div>
                    <h3 style={{ margin: '0 0 16px 8px', fontSize: 15, fontWeight: 700 }}>Categorias Dominantes</h3>
                    <div style={adminPanelStyle}>
                        {loading ? <SkeletonPanel /> : (
                            <TopCategoriesChart data={summary.topCategories} />
                        )}
                    </div>
                </div>

                {/* 3. Frequência Temporal (Full width) */}
                <div style={{ ...adminPanelStyle, gridColumn: 'span 2' }}>
                    <h3 style={{ margin: '0 0 24px 0', fontSize: 16, fontWeight: 700 }}>Mapa de Calor de Engajamento (Dia vs Hora)</h3>
                    {loading ? <SkeletonPanel /> : (
                        <FrequencyHeatmap
                            matrix={summary.weekdayHourMatrix}
                            weekdayFrequency={summary.weekdayFrequency}
                        />
                    )}
                </div>

                {/* 4. Mercados & Regiões */}
                <div>
                    <h3 style={{ margin: '0 0 16px 8px', fontSize: 15, fontWeight: 700 }}>Market Share (Menor Preço)</h3>
                    <div style={adminPanelStyle}>
                        {loading ? <SkeletonPanel /> : (
                            <MarketRankingChart data={summary.topMarkets} />
                        )}
                    </div>
                </div>
                <div>
                    <h3 style={{ margin: '0 0 16px 8px', fontSize: 15, fontWeight: 700 }}>Geografia do Consumo</h3>
                    <div style={adminPanelStyle}>
                        {loading ? <SkeletonPanel /> : (
                            <RegionConsumptionMap data={summary.topRegions} />
                        )}
                    </div>
                </div>
            </div>

            {/* ── Privacy Footer ────────────────────────────────────── */}
            <div style={{
                ...adminPanelStyle,
                background: `${adminColors.primary}05`,
                border: `1px dashed ${adminColors.primary}33`,
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start'
            }}>
                <div style={{ color: adminColors.primary, paddingTop: 2 }}>
                    <ShieldCheck size={20} />
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#4B5563', lineHeight: 1.6 }}>
                    <strong>Privacidade & Conformidade:</strong> Este painel opera sob o princípio de 
                    <em> Differential Privacy</em>. Os dados são agregados de forma anônima e 
                    não permitem a identificação individual de usuários ou comportamentos específicos. 
                    Nenhum dado pessoal (PII) é armazenado ou processado neste nó de visualização.
                </p>
            </div>
        </div>
    );
}
