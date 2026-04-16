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

function StatCard({ label, value, icon: Icon, color }: { label: string, value: number | string, icon: any, color: string }) {
  return (
    <article style={{
      ...adminPanelStyle,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '20px'
    }}>
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        background: `${color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: color
      }}>
        <Icon size={22} />
      </div>
      <div>
        <div style={{ fontSize: 13, color: adminColors.textSecondary, fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: adminColors.text }}>{value}</div>
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
    <div style={adminShellStyle}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Dashboard Operacional</h1>
          <p style={{ margin: '4px 0 0', color: adminColors.textSecondary, fontSize: 15 }}>
            Bem-vindo ao centro de comando do Economiza Facil.
          </p>
        </div>
        <Link to="/admin/offers" style={{ ...adminButtonStyle, gap: 8 }}>
          <Plus size={18} />
          Nova Oferta
        </Link>
      </div>

      {error ? (
        <div style={{ ...adminBadgeStyle("red"), padding: '12px 20px' }}>{error}</div>
      ) : null}

      {/* ── Stats Grid ──────────────────────────────────────── */}
      <section style={{
        display: "grid",
        gap: 20,
        gridTemplateColumns: "repeat(4, 1fr)",
      }}>
        <StatCard label="Total de Mercados" value={loading ? "..." : metrics.totalMarkets} icon={Store} color={adminColors.primary} />
        <StatCard label="Ofertas Ativas" value={loading ? "..." : metrics.activeOffers} icon={Tag} color="#10B981" />
        <StatCard label="Ofertas Vencidas" value={loading ? "..." : metrics.expiredOffers} icon={Clock} color="#EF4444" />
        <StatCard label="Destaques" value={loading ? "..." : metrics.featuredOffers} icon={Star} color="#F59E0B" />
      </section>

      {/* ── Bottom Content ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }}>
        
        {/* Recent Entries */}
        <section style={adminPanelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Últimos Cadastros</h2>
            <Link to="/admin/offers" style={{ color: adminColors.primary, fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              Ver todos <ArrowRight size={14} />
            </Link>
          </div>

          {!metrics.recentEntries.length && !loading ? (
            <div style={{ color: adminColors.textSecondary, padding: '20px 0', textAlign: 'center' }}>
              Ainda não existem registros recentes.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {metrics.recentEntries.map((entry) => (
                <article
                  key={`${entry.type}-${entry.id}`}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    background: '#F9FAFB',
                    border: `1px solid ${adminColors.border}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ 
                      width: 36, 
                      height: 36, 
                      borderRadius: 8, 
                      background: entry.type === 'oferta' ? '#ECFDF5' : '#F3F4F6', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: entry.type === 'oferta' ? '#10B981' : '#6B7280'
                    }}>
                      {entry.type === 'oferta' ? <ShoppingCart size={18} /> : <Store size={18} />}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: adminColors.text, fontSize: 14 }}>{entry.title}</div>
                      <div style={{ color: adminColors.textSecondary, fontSize: 12, marginTop: 2 }}>{entry.subtitle}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={adminBadgeStyle(entry.type === "oferta" ? "green" : "neutral")}>
                      {entry.type}
                    </span>
                    <div style={{ color: adminColors.textSecondary, fontSize: 11 }}>
                      {entry.createdAtLabel}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Quick Tips / Info */}
        <section style={{ display: 'grid', gap: 24 }}>
          <div style={{ ...adminPanelStyle, background: adminColors.sidebarBg, color: '#fff', border: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ color: adminColors.primary }}><Zap size={24} fill={adminColors.primary} /></div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Dica Rápida</h3>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#9CA3AF', lineHeight: 1.6 }}>
              O sistema de ofertas é atualizado em tempo real na landing page. Lembre-se de revisar a validade dos produtos antes de publicá-los como destaque.
            </p>
          </div>

          <div style={{ ...adminPanelStyle, background: `${adminColors.primary}05`, border: `1px dashed ${adminColors.primary}33` }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 700 }}>Status do Sistema</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: adminColors.textSecondary }}>Integração WhatsApp</span>
                <span style={adminBadgeStyle('green')}>Online</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: adminColors.textSecondary }}>Processamento IA</span>
                <span style={adminBadgeStyle('green')}>Estável</span>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
