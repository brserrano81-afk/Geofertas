import { useParams } from "react-router-dom";

const BOT_PHONE = (import.meta as Record<string, Record<string, string>>).env?.VITE_BOT_PHONE || "5527999999999";

function waLink(text: string) {
  return `https://wa.me/${BOT_PHONE}?text=${encodeURIComponent(text)}`;
}

export default function Lista() {
  const { token } = useParams<{ token?: string }>();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>🛒 Lista de Compras</div>
        {token && (
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
            Token: {token.slice(0, 8)}...
          </div>
        )}
      </div>

      {/* Info box */}
      <div
        style={{
          background: "#dff7c9",
          borderRadius: "4px 18px 18px 18px",
          padding: "14px 16px",
          fontSize: 13,
          lineHeight: 1.5,
          border: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          Gerencie sua lista pelo WhatsApp!
        </div>
        <div style={{ color: "#444" }}>
          Adicione, remova e compartilhe itens direto pelo chat. O link desta
          página aparece quando você pede pra compartilhar a lista.
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { label: "Ver minha lista", text: "minha lista", icon: "📋" },
          { label: "Adicionar itens", text: "add ", icon: "➕" },
          { label: "Onde comprar mais barato", text: "onde comprar minha lista", icon: "💰" },
          { label: "Compartilhar lista", text: "compartilha minha lista", icon: "📤" },
          { label: "Limpar lista", text: "limpa minha lista", icon: "🗑️" },
        ].map(({ label, text, icon }) => (
          <a
            key={label}
            href={waLink(text)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              borderRadius: 14,
              background: "white",
              border: "1px solid rgba(11,95,85,0.15)",
              textDecoration: "none",
              color: "#222",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span>{label}</span>
          </a>
        ))}
      </div>

      <div style={{ textAlign: "center", fontSize: 11, color: "#bbb" }}>
        A lista fica salva no WhatsApp. Sem conta, sem cadastro. 💚
      </div>
    </div>
  );
}
