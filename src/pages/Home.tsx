import type { CSSProperties } from "react";

const WHATSAPP_URL =
  import.meta.env.VITE_WHATSAPP_ENTRY_URL ||
  "https://api.whatsapp.com/send?text=Oi%2C%20quero%20economizar%20na%20compra";

const cardStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  background: "white",
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 14,
  padding: 14,
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
};

export default function Home() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          background: "#dff7c9",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14,
          padding: 14,
          fontWeight: 700,
          lineHeight: 1.4,
        }}
      >
        Economiza Facil agora opera em modo WhatsApp-first.
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14,
          padding: 14,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Como usar</div>
        <div style={{ fontSize: 14, color: "rgba(0,0,0,0.72)", lineHeight: 1.5 }}>
          Consultas de preco, lista de compras, compartilhamento e conversa com a IA
          acontecem no WhatsApp. A web nao e mais canal principal do produto.
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 18 }}>1</div>
        <div>
          <div style={{ fontWeight: 800 }}>Abra o WhatsApp</div>
          <div style={{ fontSize: 13, color: "rgba(0,0,0,0.65)" }}>
            Envie uma mensagem para iniciar o atendimento e montar sua compra por la.
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 18 }}>2</div>
        <div>
          <div style={{ fontWeight: 800 }}>Mande texto, audio, foto ou localizacao</div>
          <div style={{ fontSize: 13, color: "rgba(0,0,0,0.65)" }}>
            O fluxo principal foi desenhado para conversa curta, objetiva e mobile.
          </div>
        </div>
      </div>

      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
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
          textAlign: "center",
          textDecoration: "none",
        }}
      >
        Abrir no WhatsApp
      </a>

      <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 4, lineHeight: 1.5 }}>
        Se quiser, podemos trocar esse link pelo numero oficial assim que ele estiver definido.
      </div>
    </div>
  );
}
