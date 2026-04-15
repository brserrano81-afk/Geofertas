import { useEffect, useState } from 'react';

import { analyticsService, type AnalyticsSummary } from '../../services/admin/AnalyticsService';
import AdminNav from './AdminNav';
import {
    adminBadgeStyle,
    adminPanelStyle,
    adminShellStyle,
    adminTopbarStyle,
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

function SkeletonPanel() {
    return (
        <div style={{
            ...adminPanelStyle,
            minHeight: 160,
            background: 'rgba(15,123,108,0.04)',
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
                setError('Nao foi possivel carregar os dados analíticos agora.');
            })
            .finally(() => setLoading(false));
    }, []);

    return (
        <div style={adminShellStyle}>
            {/* ── Header ──────────────────────────────────────────────── */}
            <section style={adminPanelStyle}>
                <div style={{ display: 'grid', gap: 16 }}>
                    <div style={adminTopbarStyle}>
                        <div style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
                            <span style={adminBadgeStyle('green')}>Inteligência Comercial</span>
                            <h1 style={{ margin: 0, fontSize: 'clamp(1.6rem, 3.5vw, 2.6rem)', color: '#15322d' }}>
                                Painel Analítico
                            </h1>
                            <p style={{ margin: 0, lineHeight: 1.7, color: 'rgba(21,50,45,0.72)' }}>
                                Visão agregada de comportamento de compra, consultas de preço e tendências regionais.
                                Nenhum dado individual ou PII é exibido.
                            </p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                            <span style={adminBadgeStyle('neutral')}>
                                {loading ? '…' : `${summary.eventCount.toLocaleString('pt-BR')} eventos`}
                            </span>
                            <span style={adminBadgeStyle('neutral')}>
                                {loading ? '…' : `${summary.userCount.toLocaleString('pt-BR')} usuários`}
                            </span>
                        </div>
                    </div>
                    <AdminNav />
                </div>
            </section>

            {error && (
                <div style={{ ...adminBadgeStyle('red'), width: 'fit-content', fontSize: 13 }}>
                    {error}
                </div>
            )}

            {/* ── KPIs de compra ──────────────────────────────────────── */}
            <section style={adminPanelStyle}>
                {loading ? <SkeletonPanel /> : (
                    <TicketMedioChart
                        avgTicket={summary.avgTicket}
                        avgBasketSize={summary.avgBasketSize}
                        avgSavings={summary.avgSavings}
                        totalPurchases={summary.totalPurchases}
                    />
                )}
            </section>

            {/* ── Top produtos + top categorias ───────────────────────── */}
            <section style={{
                display: 'grid',
                gap: 14,
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            }}>
                <div style={adminPanelStyle}>
                    {loading ? <SkeletonPanel /> : (
                        <TopProductsChart data={summary.topPriceQueryCategories} />
                    )}
                </div>
                <div style={adminPanelStyle}>
                    {loading ? <SkeletonPanel /> : (
                        <TopCategoriesChart data={summary.topCategories} />
                    )}
                </div>
            </section>

            {/* ── Frequência temporal ─────────────────────────────────── */}
            <section style={adminPanelStyle}>
                {loading ? <SkeletonPanel /> : (
                    <FrequencyHeatmap
                        matrix={summary.weekdayHourMatrix}
                        weekdayFrequency={summary.weekdayFrequency}
                    />
                )}
            </section>

            {/* ── Mercados + regiões ──────────────────────────────────── */}
            <section style={{
                display: 'grid',
                gap: 14,
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            }}>
                <div style={adminPanelStyle}>
                    {loading ? <SkeletonPanel /> : (
                        <MarketRankingChart data={summary.topMarkets} />
                    )}
                </div>
                <div style={adminPanelStyle}>
                    {loading ? <SkeletonPanel /> : (
                        <RegionConsumptionMap data={summary.topRegions} />
                    )}
                </div>
            </section>

            {/* ── Nota de privacidade ─────────────────────────────────── */}
            <section style={{
                ...adminPanelStyle,
                background: 'rgba(15,123,108,0.04)',
                border: '1px solid rgba(15,123,108,0.10)',
            }}>
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(15,80,70,0.7)', lineHeight: 1.6 }}>
                    🔒 <strong>Privacidade por design:</strong> este painel agrega somente{' '}
                    <code>analytics_events</code> e <code>user_aggregates</code> — coleções sem PII.
                    Nenhum userId, nome, telefone, localização exata ou histórico individual é exibido.
                    Dados de frequência com menos de 5 eventos por célula podem aparecer zerados para
                    evitar inferência individual.
                </p>
            </section>
        </div>
    );
}
