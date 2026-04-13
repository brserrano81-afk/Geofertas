import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { isAdminAuthenticated, logoutAdmin } from "../pages/admin/adminAuth";

const WHATSAPP_URL =
  import.meta.env.VITE_WHATSAPP_ENTRY_URL ||
  "https://api.whatsapp.com/send?text=Oi%2C%20quero%20economizar%20nas%20compras%20com%20o%20Economiza%20Facil";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminArea = location.pathname.startsWith("/admin");
  const isHomePage = location.pathname === "/";
  const showAdminLogout = isAdminArea && isAdminAuthenticated();

  function handleAdminLogout() {
    logoutAdmin();
    navigate("/admin/login", { replace: true });
  }

  if (isHomePage) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background:
            "linear-gradient(180deg, #f9f4ea 0%, #eef2ee 42%, #e0ebe6 100%)",
          padding: "16px 0 40px",
        }}
      >
        <Outlet />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #fff6e9 0%, #eef4ef 42%, #dbe7e1 100%)",
        padding: "20px clamp(16px, 3vw, 28px) 40px",
      }}
    >
      <div
        style={{
          width: "min(1180px, 100%)",
          margin: "0 auto",
          display: "grid",
          gap: 20,
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "16px 18px",
            borderRadius: 24,
            background: "rgba(255,255,255,0.72)",
            border: "1px solid rgba(18,51,46,0.08)",
            boxShadow: "0 12px 30px rgba(12,63,56,0.08)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div>
            <div
              style={{
                color: "#11342f",
                fontWeight: 900,
                letterSpacing: 0.4,
                fontSize: 18,
              }}
            >
              ECONOMIZA FACIL
            </div>
            <div style={{ color: "rgba(17,52,47,0.64)", fontSize: 13 }}>
              assistente de compras em modo WhatsApp-first
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {showAdminLogout ? (
              <button
                type="button"
                onClick={handleAdminLogout}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 46,
                  padding: "0 18px",
                  borderRadius: 14,
                  background: "rgba(17,52,47,0.08)",
                  color: "#11342f",
                  border: "1px solid rgba(17,52,47,0.12)",
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
              >
                Sair do admin
              </button>
            ) : null}

            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 46,
                padding: "0 18px",
                borderRadius: 14,
                background: "#0f7b6c",
                color: "white",
                textDecoration: "none",
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              Entrar no WhatsApp
            </a>
          </div>
        </header>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
