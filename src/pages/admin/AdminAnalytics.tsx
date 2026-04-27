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
        <div style={{ ...adminShellStyle, gap: 48 }}>
            {/* ── Page Title ────────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 36, fontWeight: 900, letterSpacing: '-0.05em', color: adminColors.text }}>Inteligência de Mercado</h1>
                    <p style={{ margin: '8px 0 0', color: adminColors.textSecondary, fontSize: 16, fontWeight: 500 }}>
                        Visão analítica de consumo, comportamento e economia gerada.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ ...adminBadgeStyle('green'), padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 800 }}>Dados em Tempo Real</div>
                    <div style={{ ...adminBadgeStyle('neutral'), padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 800 }}>Últimos 30 dias</div>
                </div>
            </div>

            {error && (
                <div style={{ ...adminBadgeStyle('red'), width: 'fit-content', padding: '16px 32px', fontSize: 14, borderRadius: 12 }}>
                    {error}
                </div>
            )}

            {/* ── KPI Grid ──────────────────────────────────────────── */}
            <div style={{
                display: 'grid',
                gap: 32,
                gridTemplateColumns: 'repeat(4, 1fr)'
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
                gap: 32,
                gridTemplateColumns: 'repeat(2, 1fr)',
            }}>
                {/* 1. Ticket Médio Detalhado (Full width in its row) */}
                <div style={{ ...adminPanelStyle, gridColumn: 'span 2', padding: 40 }}>
                    <h3 style={{ margin: '0 0 32px 0', fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}>Distribuição de Compra & Poupança</h3>
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
                <div style={{ ...adminPanelStyle, padding: 40 }}>
                    <h3 style={{ margin: '0 0 32px 0', fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>Produtos Mais Consultados</h3>
                    {loading ? <SkeletonPanel /> : (
                        <TopProductsChart data={summary.topPriceQueryCategories} />
                    )}
                </div>
                <div style={{ ...adminPanelStyle, padding: 40 }}>
                    <h3 style={{ margin: '0 0 32px 0', fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>Categorias Dominantes</h3>
                    {loading ? <SkeletonPanel /> : (
                        <TopCategoriesChart data={summary.topCategories} />
                    )}
                </div>

                {/* 3. Frequência Temporal (Full width) */}
                <div style={{ ...adminPanelStyle, gridColumn: 'span 2', padding: 40 }}>
                    <h3 style={{ margin: '0 0 32px 0', fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}>Mapa de Calor de Engajamento</h3>
                    {loading ? <SkeletonPanel /> : (
                        <FrequencyHeatmap
                            matrix={summary.weekdayHourMatrix}
                            weekdayFrequency={summary.weekdayFrequency}
                        />
                    )}
                </div>

                {/* 4. Mercados & Regiões */}
                <div style={{ ...adminPanelStyle, padding: 40 }}>
                    <h3 style={{ margin: '0 0 32px 0', fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>Market Share (Menor Preço)</h3>
                    {loading ? <SkeletonPanel /> : (
                        <MarketRankingChart data={summary.topMarkets} />
                    )}
                </div>
                <div style={{ ...adminPanelStyle, padding: 40 }}>
                    <h3 style={{ margin: '0 0 32px 0', fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>Geografia do Consumo</h3>
                    {loading ? <SkeletonPanel /> : (
                        <RegionConsumptionMap data={summary.topRegions} />
                    )}
                </div>
            </div>

            {/* ── Privacy Footer ────────────────────────────────────── */}
            <div style={{
                ...adminPanelStyle,
                background: '#F8FAFC',
                border: '1px solid #F1F5F9',
                padding: '32px 40px',
                display: 'flex',
                gap: 24,
                alignItems: 'flex-start',
                borderRadius: 24
            }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: adminColors.primary, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', flexShrink: 0 }}>
                    <ShieldCheck size={24} />
                </div>
                <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 900, color: adminColors.text }}>Privacidade & Conformidade (LGPD)</h4>
                    <p style={{ margin: 0, fontSize: 14, color: adminColors.textSecondary, lineHeight: 1.6, fontWeight: 500 }}>
                        Este painel opera sob o princípio de <strong>Differential Privacy</strong>. Os dados são agregados de forma anônima e 
                        não permitem a identificação individual de usuários. Nenhum dado pessoal (PII) é armazenado ou processado neste nó de visualização, garantindo total conformidade com a LGPD.
                    </p>
                </div>
            </div>
            
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </div>
    );
}
