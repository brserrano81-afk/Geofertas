import { useState } from "react";

const BOT_PHONE = (import.meta as Record<string, Record<string, string>>).env?.VITE_BOT_PHONE || "5527999999999";

function waLink(text: string) {
  return `https://wa.me/${BOT_PHONE}?text=${encodeURIComponent(text)}`;
}

const QUICK_ACTIONS = [
  { icon: "🔎", label: "Consultar preço", text: "quanto tá o arroz?" },
  { icon: "🏪", label: "Ver ofertas hoje", text: "quais as ofertas hoje?" },
  { icon: "🛒", label: "Criar lista", text: "add arroz feijão e café na lista" },
  { icon: "🧾", label: "Escanear cupom", text: "quero escanear um cupom fiscal" },
  { icon: "🚗", label: "Vale ir de carro?", text: "vale ir de carro no Atacadão?" },
  { icon: "📊", label: "Meus gastos", text: "quanto gastei esse mês" },
];

const STORES = [
  { name: "Extrabom", color: "#e8f5e9" },
  { name: "Atacadão", color: "#fff3e0" },
  { name: "Carone", color: "#e3f2fd" },
];

export default function Home() {
  const [copied, setCopied] = useState(false);

  const handleCopyNumber = () => {
    navigator.clipboard
      .writeText(`+${BOT_PHONE}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Welcome bubble */}
      <div
        style={{
          background: "#dff7c9",
          borderRadius: "4px 18px 18px 18px",
          padding: "14px 16px",
          fontSize: 14,
          lineHeight: 1.5,
          border: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 4 }}>
          👋 Olá! Sou o EconomizaFacil.IA
        </div>
        <div style={{ color: "#333" }}>
          Comparo preços do <strong>Extrabom, Atacadão e Carone</strong> aqui
          na Grande Vitória pra você economizar em cada compra. Tudo pelo
          WhatsApp, sem baixar nada!
        </div>
      </div>

      {/* WhatsApp CTA */}
      <a
        href={waLink("oi")}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          background: "#25D366",
          color: "white",
          borderRadius: 14,
          padding: "14px 20px",
          textDecoration: "none",
          fontWeight: 800,
          fontSize: 15,
          boxShadow: "0 4px 12px rgba(37,211,102,0.35)",
        }}
      >
        <span style={{ fontSize: 22 }}>💬</span>
        Abrir no WhatsApp
      </a>

      {/* Phone number copy */}
      <div style={{ textAlign: "center", fontSize: 12, color: "#666" }}>
        Ou salve o número:{" "}
        <button
          onClick={handleCopyNumber}
          style={{
            background: "none",
            border: "none",
            color: "#0b5f55",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 12,
            padding: 0,
          }}
        >
          +{BOT_PHONE} {copied ? "✅ copiado!" : "📋"}
        </button>
      </div>

      {/* Quick actions */}
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
          Atalhos rápidos
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {QUICK_ACTIONS.map(({ icon, label, text }) => (
            <a
              key={label}
              href={waLink(text)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 10px",
                borderRadius: 12,
                background: "white",
                border: "1px solid rgba(11,95,85,0.15)",
                textDecoration: "none",
                color: "#222",
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span>{label}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Stores covered */}
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
          Mercados cobertos
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {STORES.map(({ name, color }) => (
            <div
              key={name}
              style={{
                flex: 1,
                background: color,
                borderRadius: 10,
                padding: "8px 4px",
                textAlign: "center",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div
        style={{
          background: "white",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          padding: 12,
          fontSize: 12,
          color: "#555",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6, color: "#222" }}>
          Como funciona?
        </div>
        <div>
          Salva o número → manda mensagem → economiza. Sem cadastro, sem
          senha, sem app. 💚
        </div>
        <div style={{ marginTop: 6, color: "#0b5f55", fontStyle: "italic" }}>
          "kto ta o cafe?" · "add leite na lista" · "vale ir no atacadão?"
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 11, color: "#bbb" }}>
        Grande Vitória/ES · EconomizaFacil.IA 2026
      </div>
    </div>
  );
}
