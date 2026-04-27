import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { 
  Store, 
  Tag, 
  Clock, 
  Star, 
  Plus, 
  ArrowRight,
  ShoppingCart,
  Zap
} from "lucide-react";

import { adminMvpService, type DashboardMetrics } from "../../services/admin/AdminMvpService";
import {
  adminBadgeStyle,
  adminButtonStyle,
  adminPanelStyle,
  adminShellStyle,
  adminColors,
} from "./adminStyles";

const emptyMetrics: DashboardMetrics = {
  totalMarkets: 0,
  activeOffers: 0,
  expiredOffers: 0,
  featuredOffers: 0,
  recentEntries: [],
};

function StatCard({ label, value, icon: Icon, color, trend }: { label: string, value: number | string, icon: any, color: string, trend?: string }) {
  return (
    <article style={{
      ...adminPanelStyle,
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      padding: '32px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: `${color}10`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: color
      }}>
        <Icon size={24} strokeWidth={2.5} />
      </div>
      <div>
        <div style={{ fontSize: 13, color: adminColors.textSecondary, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: adminColors.text }}>{value}</div>
        {trend && (
          <div style={{ marginTop: 8, fontSize: 12, color: adminColors.success, fontWeight: 700 }}>{trend}</div>
        )}
      </div>
    </article>
  );
}

export default function AdminHome() {
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminMvpService
      .getDashboardMetrics()
      .then(setMetrics)
      .catch((loadError) => {
        console.error("[AdminHome] load error", loadError);
        setError("Nao foi possivel carregar o dashboard agora.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ ...adminShellStyle, gap: 48 }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 900, letterSpacing: '-0.05em', color: adminColors.text }}>Visão Geral</h1>
          <p style={{ margin: '8px 0 0', color: adminColors.textSecondary, fontSize: 16, fontWeight: 500 }}>
            Monitoramento em tempo real da operação Economiza Fácil.
          </p>
        </div>
        <Link to="/admin/offers" style={{ ...adminButtonStyle, height: 52, padding: '0 32px', gap: 12, boxShadow: `0 12px 24px ${adminColors.primary}33` }}>
          <Plus size={22} strokeWidth={3} />
          <span>Nova Oferta</span>
        </Link>
      </div>

      {error ? (
        <div style={{ ...adminBadgeStyle("red"), padding: '16px 32px', borderRadius: 12, fontSize: 14 }}>{error}</div>
      ) : null}

      {/* ── Stats Grid ──────────────────────────────────────── */}
      <section style={{
        display: "grid",
        gap: 32,
        gridTemplateColumns: "repeat(4, 1fr)",
      }}>
        <StatCard label="Mercados" value={loading ? "..." : metrics.totalMarkets} icon={Store} color={adminColors.primary} trend="+2 esta semana" />
        <StatCard label="Ofertas Ativas" value={loading ? "..." : metrics.activeOffers} icon={Tag} color={adminColors.success} trend="+48 hoje" />
        <StatCard label="Vencidas" value={loading ? "..." : metrics.expiredOffers} icon={Clock} color={adminColors.error} />
        <StatCard label="Destaques" value={loading ? "..." : metrics.featuredOffers} icon={Star} color={adminColors.warning} />
      </section>

      {/* ── Bottom Content ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 32 }}>
        
        {/* Recent Entries */}
        <section style={{ ...adminPanelStyle, padding: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em' }}>Últimas Atividades</h2>
            <Link to="/admin/offers" style={{ color: adminColors.primary, fontSize: 14, fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              Ver relatório completo <ArrowRight size={16} />
            </Link>
          </div>

          {!metrics.recentEntries.length && !loading ? (
            <div style={{ color: adminColors.textSecondary, padding: '40px 0', textAlign: 'center', fontWeight: 600 }}>
              Ainda não existem registros recentes na plataforma.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {metrics.recentEntries.map((entry) => (
                <article
                  key={`${entry.type}-${entry.id}`}
                  style={{
                    padding: '20px 24px',
                    borderRadius: 16,
                    background: '#F8FAFC',
                    border: `1px solid ${adminColors.border}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: 'transform 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(8px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div style={{ 
                      width: 48, 
                      height: 48, 
                      borderRadius: 12, 
                      background: entry.type === 'oferta' ? adminColors.primaryLight : '#fff', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: entry.type === 'oferta' ? adminColors.primary : adminColors.neutral,
                      border: `1px solid ${adminColors.border}`
                    }}>
                      {entry.type === 'oferta' ? <ShoppingCart size={22} /> : <Store size={22} />}
                    </div>
                    <div>
                      <div style={{ fontWeight: 900, color: adminColors.text, fontSize: 16 }}>{entry.title}</div>
                      <div style={{ color: adminColors.textSecondary, fontSize: 13, marginTop: 4, fontWeight: 600 }}>{entry.subtitle}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ ...adminBadgeStyle(entry.type === "oferta" ? "purple" : "neutral"), padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>
                      {entry.type}
                    </span>
                    <div style={{ color: adminColors.textSecondary, fontSize: 12, fontWeight: 600 }}>
                      {entry.createdAtLabel}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Quick Tips / Info */}
        <section style={{ display: 'grid', gap: 32, alignContent: 'start' }}>
          <div style={{ ...adminPanelStyle, background: adminColors.sidebarBg, color: '#fff', border: 'none', padding: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ color: adminColors.primary }}><Zap size={32} fill={adminColors.primary} strokeWidth={0} /></div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Dica de Performance</h3>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: '#94A3B8', lineHeight: 1.6, fontWeight: 500 }}>
              O processamento de imagens por IA está com 94% de acurácia. Revise a fila de moderação para garantir que as ofertas em destaque estejam com preços corretos.
            </p>
          </div>

          <div style={{ ...adminPanelStyle, background: '#fff', padding: '40px' }}>
            <h3 style={{ margin: '0 0 24px 0', fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>Status da Infraestrutura</h3>
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: adminColors.textSecondary, fontWeight: 700 }}>API Gateway</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                   <div style={{ width: 8, height: 8, borderRadius: '50%', background: adminColors.success, boxShadow: `0 0 10px ${adminColors.success}` }} />
                   <span style={{ fontSize: 12, fontWeight: 900, color: adminColors.success, textTransform: 'uppercase' }}>Operacional</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: adminColors.textSecondary, fontWeight: 700 }}>WhatsApp Webhook</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                   <div style={{ width: 8, height: 8, borderRadius: '50%', background: adminColors.success, boxShadow: `0 0 10px ${adminColors.success}` }} />
                   <span style={{ fontSize: 12, fontWeight: 900, color: adminColors.success, textTransform: 'uppercase' }}>Operacional</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: adminColors.textSecondary, fontWeight: 700 }}>Banco de Dados</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                   <div style={{ width: 8, height: 8, borderRadius: '50%', background: adminColors.success, boxShadow: `0 0 10px ${adminColors.success}` }} />
                   <span style={{ fontSize: 12, fontWeight: 900, color: adminColors.success, textTransform: 'uppercase' }}>Operacional</span>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
