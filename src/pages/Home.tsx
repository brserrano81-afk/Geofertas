import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  const Card = ({
    title,
    subtitle,
    icon,
    onClick,
  }: {
    title: string;
    subtitle: string;
    icon: string;
    onClick?: () => void;
  }) => (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        background: "white",
        border: "1px solid rgba(0,0,0,0.10)",
        borderRadius: 14,
        padding: 14,
        display: "flex",
        gap: 12,
        alignItems: "center",
        cursor: onClick ? "pointer" : "default",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          background: "rgba(11,95,85,0.10)",
          display: "grid",
          placeItems: "center",
          fontSize: 18,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 12, color: "rgba(0,0,0,0.65)" }}>{subtitle}</div>
      </div>
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          background: "#dff7c9",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14,
          padding: 14,
          fontWeight: 700,
        }}
      >
        👋 Olá! Eu vou te ajudar a economizar no mercado.
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14,
          padding: 12,
          fontWeight: 700,
        }}
      >
        O que você quer fazer hoje?
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Card
          title="Consultar preço"
          subtitle="Digite o produto e compare rapidamente."
          icon="🔎"
        />
        <Card
          title="Criar lista"
          subtitle="Lista simples pra não esquecer nada."
          icon="🧾"
        />
        <Card
          title="Cupom Escanear"
          subtitle="Enviar cupom e organizar gastos."
          icon="📷"
        />
        <Card
          title="Ver perto"
          subtitle="Achar ofertas próximas de você."
          icon="📍"
        />
      </div>

      {/* Ponto claro de ir para Análises */}
      <button
        onClick={() => navigate("/analises")}
        style={{
          marginTop: 6,
          width: "100%",
          padding: "12px 14px",
          borderRadius: 14,
          border: "none",
          background: "#0b5f55",
          color: "white",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        Ir para Análises →
      </button>

      <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 4 }}>
        Dica: você pode usar tudo pelo WhatsApp.
      </div>
    </div>
  );
}