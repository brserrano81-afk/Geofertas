import { useEffect, useState } from "react";

const API_URL = (import.meta as Record<string, Record<string, string>>).env?.VITE_API_URL || "http://localhost:8000";
const BOT_PHONE = (import.meta as Record<string, Record<string, string>>).env?.VITE_BOT_PHONE || "5527999999999";

interface Summary {
  total_users: number;
  monthly_receipts: number;
  monthly_savings: number;
  total_price_lookups: number;
}

interface Event {
  id: string;
  event_type: string;
  savings_amount: number | null;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  price_lookup: "🔎 Consulta de preço",
  list_add: "🛒 Item na lista",
  receipt_scanned: "🧾 Cupom escaneado",
  offer_search: "🏪 Busca de oferta",
  trip_calc: "🚗 Cálculo de rota",
  list_optimize: "💰 Otimização de lista",
};

function StatBox({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        flex: 1,
        background: "white",
        border: "1px solid rgba(0,0,0,0.10)",
        borderRadius: 14,
        padding: 14,
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", fontWeight: 700, marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 20, fontWeight: 900, color: "#0b5f55" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function Analises() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = async () => {
    try {
      const [sumRes, evRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/analytics/summary`),
        fetch(`${API_URL}/api/v1/analytics/events/recent?limit=10`),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (evRes.ok) setEvents(await evRes.json());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll every 30 seconds
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, []);

  const month = new Date().toLocaleString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: "system-ui, sans-serif" }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>📊 Análises</div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{month}</div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", color: "#aaa", padding: 24, fontSize: 14 }}>
          Carregando dados...
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            background: "#fff3cd",
            border: "1px solid #ffc107",
            borderRadius: 12,
            padding: 12,
            fontSize: 13,
          }}
        >
          ⚠️ Backend não conectado.{" "}
          <a
            href={`https://wa.me/${BOT_PHONE}?text=quanto+gastei+esse+mês`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#0b5f55", fontWeight: 700 }}
          >
            Ver no WhatsApp →
          </a>
        </div>
      )}

      {summary && (
        <>
          <div style={{ display: "flex", gap: 10 }}>
            <StatBox
              title="Economia este mês"
              value={`R$ ${summary.monthly_savings.toFixed(2).replace(".", ",")}`}
              sub="calculada por preços reais"
            />
            <StatBox
              title="Cupons processados"
              value={String(summary.monthly_receipts)}
              sub="este mês"
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <StatBox
              title="Consultas de preço"
              value={String(summary.total_price_lookups)}
              sub="total histórico"
            />
            <StatBox
              title="Usuários ativos"
              value={String(summary.total_users)}
              sub="na plataforma"
            />
          </div>
        </>
      )}

      {/* Recent activity */}
      {events.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#888",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Atividade recente
          </div>
          <div
            style={{
              background: "white",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {events.map((ev, i) => (
              <div
                key={ev.id}
                style={{
                  padding: "10px 14px",
                  borderBottom: i < events.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <div>{EVENT_LABELS[ev.event_type] || ev.event_type}</div>
                <div style={{ fontSize: 11, color: "#aaa" }}>
                  {ev.savings_amount
                    ? <span style={{ color: "#0b5f55", fontWeight: 700 }}>-R$ {ev.savings_amount.toFixed(2)}</span>
                    : new Date(ev.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WhatsApp deeper analytics */}
      <a
        href={`https://wa.me/${BOT_PHONE}?text=quanto+gastei+esse+mês`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: "#25D366",
          color: "white",
          borderRadius: 14,
          padding: "12px 20px",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        <span>💬</span> Ver análise completa no WhatsApp
      </a>
    </div>
  );
}
