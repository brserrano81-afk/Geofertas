import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { adminButtonStyle, adminInputStyle, adminPanelStyle, adminShellStyle } from "./adminStyles";
import { isAdminAuthenticated, isAdminConfigured, loginAdmin } from "./adminAuth";

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const targetPath =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/admin/home";

  if (isAdminAuthenticated()) {
    return <Navigate to={targetPath} replace />;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!isAdminConfigured()) {
      setError("Defina VITE_ADMIN_PASSWORD para liberar o admin.");
      return;
    }

    const ok = loginAdmin(password);
    if (!ok) {
      setError("Senha invalida.");
      return;
    }

    navigate(targetPath, { replace: true });
  }

  return (
    <div style={adminShellStyle}>
      <section style={{ ...adminPanelStyle, maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "grid", gap: 10 }}>
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
            Admin Login
          </span>
          <h1 style={{ margin: 0, color: "#17332f" }}>Entrar no admin</h1>
          <p style={{ margin: 0, lineHeight: 1.7, color: "rgba(23,51,47,0.74)" }}>
            Protecao operacional simples para o MVP. Use a senha unica configurada por variavel de ambiente.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14, marginTop: 22 }}>
          <input
            style={adminInputStyle}
            type="password"
            placeholder="Senha do admin"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />

          <button type="submit" style={adminButtonStyle}>
            Entrar
          </button>

          {error ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                background: "rgba(160,38,38,0.08)",
                border: "1px solid rgba(160,38,38,0.12)",
                color: "#8a2222",
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          ) : null}
        </form>
      </section>
    </div>
  );
}
