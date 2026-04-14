import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { adminMvpService, type DashboardMetrics } from "../../services/admin/AdminMvpService";
import AdminNav from "./AdminNav";
import {
  adminBadgeStyle,
  adminButtonStyle,
  adminCardGridStyle,
  adminPanelStyle,
  adminShellStyle,
  adminTopbarStyle,
} from "./adminStyles";

const emptyMetrics: DashboardMetrics = {
  totalMarkets: 0,
  activeOffers: 0,
  expiredOffers: 0,
  featuredOffers: 0,
  recentEntries: [],
};

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

  const statCards = [
    { label: "Total de mercados", value: metrics.totalMarkets, tone: "neutral" as const },
    { label: "Ofertas ativas", value: metrics.activeOffers, tone: "green" as const },
    { label: "Ofertas vencidas", value: metrics.expiredOffers, tone: "amber" as const },
    { label: "Ofertas em destaque", value: metrics.featuredOffers, tone: "green" as const },
  ];

  return (
    <div style={adminShellStyle}>
      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={adminTopbarStyle}>
            <div style={{ display: "grid", gap: 8, maxWidth: 760 }}>
              <span style={adminBadgeStyle("green")}>Admin MVP</span>
              <h1 style={{ margin: 0, fontSize: "clamp(2rem, 4vw, 3rem)", color: "#15322d" }}>
                Painel administrativo operacional do Economiza Facil
              </h1>
              <p style={{ margin: 0, lineHeight: 1.7, color: "rgba(21,50,45,0.76)" }}>
                Use este painel para alimentar a landing com mercados, ofertas e campanhas
                reais direto no Firestore, sem backend extra nesta fase.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link to="/admin/offers" style={adminButtonStyle}>
                Nova oferta
              </Link>
            </div>
          </div>

          <AdminNav />
        </div>
      </section>

      <section style={adminCardGridStyle}>
        {statCards.map((card) => (
          <article key={card.label} style={adminPanelStyle}>
            <div style={{ display: "grid", gap: 10 }}>
              <span style={adminBadgeStyle(card.tone)}>{card.label}</span>
              <div style={{ fontSize: 34, fontWeight: 900, color: "#12332d" }}>
                {loading ? "..." : card.value}
              </div>
            </div>
          </article>
        ))}
      </section>

      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={adminTopbarStyle}>
            <div>
              <h2 style={{ margin: 0, color: "#17332f" }}>Ultimos cadastros</h2>
              <p style={{ margin: "6px 0 0", color: "rgba(23,51,47,0.72)" }}>
                Visao rapida do que entrou mais recentemente no Firestore.
              </p>
            </div>
          </div>

          {error ? (
            <div style={{ ...adminBadgeStyle("red"), width: "fit-content" }}>{error}</div>
          ) : null}

          {!metrics.recentEntries.length && !loading ? (
            <div style={{ color: "rgba(23,51,47,0.68)" }}>
              Ainda nao existem registros recentes para mostrar.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {metrics.recentEntries.map((entry) => (
                <article
                  key={`${entry.type}-${entry.id}`}
                  style={{
                    padding: 16,
                    borderRadius: 18,
                    background: "white",
                    border: "1px solid rgba(15,53,47,0.08)",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={adminTopbarStyle}>
                    <div>
                      <div style={{ fontWeight: 900, color: "#17332f" }}>{entry.title}</div>
                      <div style={{ color: "rgba(23,51,47,0.72)", marginTop: 4 }}>{entry.subtitle}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={adminBadgeStyle(entry.type === "oferta" ? "green" : "neutral")}>
                        {entry.type}
                      </span>
                      <div style={{ marginTop: 6, color: "rgba(23,51,47,0.64)", fontSize: 13 }}>
                        {entry.createdAtLabel}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
