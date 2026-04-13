import { Link } from "react-router-dom";

import {
  adminButtonStyle,
  adminGridStyle,
  adminPanelStyle,
  adminShellStyle,
} from "./adminStyles";

const cards = [
  {
    title: "Ofertas",
    description: "Cadastrar, listar e ativar ou inativar ofertas do MVP.",
    to: "/admin/offers",
  },
  {
    title: "Mercados",
    description: "Listar mercados da base e cadastrar novas unidades.",
    to: "/admin/markets",
  },
  {
    title: "Campanhas",
    description: "Criar campanhas promocionais e acompanhar status ativo.",
    to: "/admin/campaigns",
  },
];

export default function AdminHome() {
  return (
    <div style={adminShellStyle}>
      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
          <span
            style={{
              display: "inline-flex",
              width: "fit-content",
              padding: "6px 12px",
              borderRadius: 999,
              background: "rgba(15,123,108,0.12)",
              color: "#0f6d61",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Admin MVP
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 4vw, 3rem)", color: "#15322d" }}>
            Painel operacional simples, direto e no mesmo frontend.
          </h1>
          <p style={{ margin: 0, lineHeight: 1.7, color: "rgba(21,50,45,0.76)" }}>
            Este painel usa Firestore direto no navegador para acelerar operacao de MVP.
            O foco aqui e manter cadastro e manutencao de ofertas, mercados e campanhas
            sem adicionar outro backend.
          </p>
        </div>
      </section>

      <section style={adminGridStyle}>
        {cards.map((card) => (
          <article key={card.to} style={adminPanelStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              <h2 style={{ margin: 0, color: "#17332f" }}>{card.title}</h2>
              <p style={{ margin: 0, lineHeight: 1.7, color: "rgba(23,51,47,0.72)" }}>
                {card.description}
              </p>
              <div>
                <Link to={card.to} style={adminButtonStyle}>
                  Abrir modulo
                </Link>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
