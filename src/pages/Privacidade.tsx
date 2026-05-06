import { Link } from "react-router-dom";

interface PolicySection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
  note?: string;
}

const sections: PolicySection[] = [
  {
    title: "1. Quem somos",
    paragraphs: [
      "O Economiza Fácil é um assistente via WhatsApp que ajuda usuários a montar listas de compras, comparar preços e encontrar mercados próximos.",
    ],
  },
  {
    title: "2. Quais dados usamos",
    paragraphs: ["Podemos tratar:"],
    bullets: [
      "número de WhatsApp;",
      "mensagens enviadas ao bot;",
      "listas de compras;",
      "produtos pesquisados;",
      "localização aproximada ou localização enviada pelo usuário;",
      "preferências informadas, como transporte, mercado favorito ou objetivo de economia;",
      "registros técnicos necessários para segurança, auditoria e funcionamento.",
    ],
    note: "Não pedimos CPF, documento, senha bancária ou dados de pagamento pelo WhatsApp.",
  },
  {
    title: "3. Para que usamos seus dados",
    paragraphs: ["Usamos os dados para:"],
    bullets: [
      "responder suas mensagens;",
      "salvar sua lista de compras;",
      "comparar preços;",
      "encontrar mercados próximos;",
      "personalizar a experiência;",
      "melhorar o serviço;",
      "cumprir obrigações legais e de segurança.",
    ],
  },
  {
    title: "4. Base legal",
    paragraphs: [
      "O tratamento pode ocorrer com base no consentimento do usuário e na execução do serviço solicitado, conforme a LGPD.",
    ],
  },
  {
    title: "5. Compartilhamento",
    paragraphs: [
      "Não vendemos seus dados pessoais.",
      "Dados agregados e sem identificação pessoal podem ser usados para análises internas e melhoria do serviço.",
      "Algumas integrações técnicas podem ser usadas para manter o serviço funcionando, como infraestrutura, mensageria, banco de dados e recursos de IA.",
    ],
  },
  {
    title: "6. Localização",
    paragraphs: [
      "A localização é usada para encontrar mercados próximos e calcular distância.",
      "Você pode atualizar ou apagar sua localização quando quiser.",
    ],
  },
  {
    title: "7. Seus direitos",
    paragraphs: ["Você pode solicitar:"],
    bullets: [
      "confirmação de tratamento;",
      "acesso aos dados;",
      "correção;",
      "exclusão;",
      "revogação do consentimento;",
      "informações sobre uso e compartilhamento.",
    ],
  },
  {
    title: "8. Como pedir exclusão ou correção",
    paragraphs: ["Pelo próprio WhatsApp, você pode mandar:"],
    bullets: [
      '"o que sabe sobre mim?"',
      '"corrigir meus dados"',
      '"apagar meus dados"',
      '"privacidade"',
    ],
  },
  {
    title: "9. Segurança",
    paragraphs: [
      "Adotamos medidas técnicas para proteger os dados e evitar acesso indevido.",
      "Alguns registros técnicos podem ser mantidos pelo tempo necessário para segurança, auditoria e funcionamento do serviço.",
    ],
  },
  {
    title: "10. Contato",
    paragraphs: [
      "Para dúvidas sobre privacidade, entre em contato pelo WhatsApp oficial do Economiza Fácil ou pelo canal informado no site.",
    ],
  },
];

export default function Privacidade() {
  return (
    <main
      style={{
        width: "min(920px, 100%)",
        margin: "0 auto",
        padding: "clamp(20px, 4vw, 40px) 0",
      }}
    >
      <article
        style={{
          background: "#ffffff",
          border: "1px solid rgba(18,51,46,0.10)",
          borderRadius: 8,
          boxShadow: "0 18px 50px rgba(12,63,56,0.08)",
          padding: "clamp(24px, 5vw, 48px)",
        }}
      >
        <header style={{ display: "grid", gap: 12, marginBottom: 30 }}>
          <p
            style={{
              margin: 0,
              color: "#0d6f5e",
              fontSize: 13,
              fontWeight: 800,
              textTransform: "uppercase",
            }}
          >
            Documento público
          </p>
          <h1
            style={{
              margin: 0,
              color: "#112a26",
              fontSize: "clamp(2rem, 5vw, 3.4rem)",
              lineHeight: 1.05,
            }}
          >
            Política de Privacidade — Economiza Fácil
          </h1>
          <p style={{ margin: 0, color: "rgba(17,42,38,0.70)", lineHeight: 1.7 }}>
            Última atualização: 4 de maio de 2026
          </p>
        </header>

        <div style={{ display: "grid", gap: 22 }}>
          {sections.map((section) => (
            <section key={section.title} style={{ display: "grid", gap: 10 }}>
              <h2 style={{ margin: 0, color: "#12322d", fontSize: 22, lineHeight: 1.2 }}>
                {section.title}
              </h2>

              {section.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  style={{ margin: 0, color: "rgba(17,42,38,0.78)", lineHeight: 1.75 }}
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
                    lineHeight: 1.8,
                  }}
                >
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}

              {section.note ? (
                <p
                  style={{
                    margin: 0,
                    color: "#12322d",
                    fontWeight: 700,
                    lineHeight: 1.7,
                  }}
                >
                  {section.note}
                </p>
              ) : null}
            </section>
          ))}
        </div>

        <footer
          style={{
            borderTop: "1px solid rgba(18,51,46,0.10)",
            marginTop: 34,
            paddingTop: 22,
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <p style={{ margin: 0, color: "rgba(17,42,38,0.62)", lineHeight: 1.6 }}>
            Esta página resume como o Economiza Fácil trata dados pessoais.
          </p>
          <Link
            to="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 44,
              padding: "0 16px",
              borderRadius: 8,
              background: "#0f6f60",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            Voltar para o início
          </Link>
        </footer>
      </article>
    </main>
  );
}
