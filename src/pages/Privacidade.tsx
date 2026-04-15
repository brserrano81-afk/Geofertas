import { Link } from "react-router-dom";

const policySections = [
  {
    title: "Quais dados podemos coletar",
    bullets: [
      "identificador do WhatsApp",
      "BSUID",
      "listas de compras",
      "histórico de interações",
      "preferências de mercado",
      "informações necessárias para personalizar sua experiência no serviço",
    ],
  },
  {
    title: "Para que usamos esses dados",
    bullets: [
      "comparar preços e ofertas",
      "salvar listas e histórico",
      "personalizar recomendações e respostas",
      "melhorar a experiência do usuário",
      "gerar análises internas e métricas de uso de forma compatível com a LGPD",
    ],
  },
  {
    title: "Armazenamento e proteção",
    paragraphs: [
      "Os dados são armazenados com medidas de segurança adequadas e tratados conforme a Lei Geral de Proteção de Dados Pessoais (LGPD).",
    ],
  },
  {
    title: "Retenção e anonimização",
    paragraphs: [
      "Dados inativos podem ser anonimizados após 365 dias, conforme regras internas de retenção e necessidade operacional do serviço.",
    ],
  },
  {
    title: "Direitos do usuário",
    bullets: [
      "acesso aos seus dados",
      "correção de informações",
      "exclusão dos seus dados",
      "esclarecimentos sobre o tratamento realizado",
    ],
  },
  {
    title: "Solicitação de exclusão",
    paragraphs: [
      "A exclusão dos dados pode ser solicitada pelo WhatsApp ou por nosso canal oficial de atendimento.",
    ],
  },
  {
    title: "Contato para privacidade",
    paragraphs: ["privacidade@economizafacil.com.br"],
  },
];

export default function Privacidade() {
  return (
    <div
      style={{
        width: "min(960px, 100%)",
        margin: "0 auto",
        display: "grid",
        gap: 20,
      }}
    >
      <section
        style={{
          padding: "clamp(24px, 4vw, 40px)",
          borderRadius: 30,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(246,250,248,0.96) 100%)",
          border: "1px solid rgba(18,51,46,0.08)",
          boxShadow: "0 24px 60px rgba(12,63,56,0.08)",
          display: "grid",
          gap: 18,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            width: "fit-content",
            minHeight: 34,
            padding: "0 14px",
            alignItems: "center",
            borderRadius: 999,
            background: "rgba(15,111,94,0.10)",
            color: "#0d6f5e",
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Privacidade
        </span>

        <div style={{ display: "grid", gap: 12 }}>
          <h1
            style={{
              margin: 0,
              color: "#112a26",
              fontSize: "clamp(2.2rem, 5vw, 4rem)",
              lineHeight: 0.96,
              letterSpacing: -1.6,
            }}
          >
            Política de Privacidade — Economiza Fácil
          </h1>
          <p style={{ margin: 0, color: "rgba(17,42,38,0.74)", lineHeight: 1.8, fontSize: 17 }}>
            No Economiza Fácil, tratamos seus dados para oferecer uma experiência mais útil,
            personalizada e segura na comparação de preços e gestão da sua lista de compras.
          </p>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          {policySections.map((section) => (
            <article
              key={section.title}
              style={{
                padding: "20px 22px",
                borderRadius: 24,
                background: "#ffffff",
                border: "1px solid rgba(16,50,45,0.08)",
                display: "grid",
                gap: 12,
              }}
            >
              <h2 style={{ margin: 0, color: "#12322d", fontSize: 24, lineHeight: 1.1 }}>
                {section.title}
              </h2>

              {section.paragraphs?.map((paragraph) => (
                <p
                  key={paragraph}
                  style={{ margin: 0, color: "rgba(17,42,38,0.76)", lineHeight: 1.8, fontSize: 16 }}
                >
                  {paragraph}
                </p>
              ))}

              {section.bullets ? (
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 22,
                    color: "rgba(17,42,38,0.78)",
                    lineHeight: 1.9,
                    display: "grid",
                    gap: 2,
                  }}
                >
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
            paddingTop: 8,
          }}
        >
          <div style={{ color: "rgba(17,42,38,0.60)", lineHeight: 1.7 }}>
            Documento público de privacidade do Economiza Fácil.
          </div>
          <Link
            to="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 48,
              padding: "0 18px",
              borderRadius: 16,
              background: "linear-gradient(135deg, #0f6f60 0%, #11a288 100%)",
              color: "white",
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Voltar para a landing
          </Link>
        </div>
      </section>
    </div>
  );
}
