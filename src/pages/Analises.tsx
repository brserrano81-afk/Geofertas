


import { useNavigate } from "react-router-dom";

export default function Analises() {
  const navigate = useNavigate();

  const Box = ({ title, value }: { title: string; value: string }) => (
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
      <div style={{ fontSize: 12, color: "rgba(0,0,0,0.60)", fontWeight: 700 }}>
        {title}
      </div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 24, fontWeight: 900 }}>Área de Análises</div>

      <div style={{ color: "rgba(0,0,0,0.70)" }}>
        Aqui o usuário acompanha economia, histórico e insights.
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Box title="Economia estimada (mês)" value="R$ 0,00" />
        <Box title="Cupons enviados" value="0" />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Box title="Itens monitorados" value="0" />
        <Box title="Alertas de oferta" value="0" />
      </div>

      {/* Ponto claro de voltar */}
      <button
        onClick={() => navigate("/")}
        style={{
          marginTop: 6,
          width: "100%",
          padding: "12px 14px",
          borderRadius: 14,
          border: "1px solid rgba(0,0,0,0.10)",
          background: "white",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        ← Voltar para Home
      </button>
    </div>
  );
}