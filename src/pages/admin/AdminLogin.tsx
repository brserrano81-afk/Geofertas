import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Lock, ArrowRight, ShieldCheck } from "lucide-react";

import { 
  adminButtonStyle, 
  adminInputStyle, 
  adminPanelStyle, 
  adminColors 
} from "./adminStyles";
import { isAdminAuthenticated, isAdminConfigured, loginAdmin } from "./adminAuth";

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const targetPath =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/admin/home";

  if (isAdminAuthenticated()) {
    return <Navigate to={targetPath} replace />;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    if (!isAdminConfigured()) {
      setError("Configuração pendente: VITE_ADMIN_PASSWORD não encontrada.");
      setLoading(false);
      return;
    }

    setTimeout(() => {
        const ok = loginAdmin(password);
        if (!ok) {
          setError("Senha inválida. Tente novamente.");
          setLoading(false);
          return;
        }
        navigate(targetPath, { replace: true });
    }, 400);
  }

  return (
    <div style={{
        minHeight: '100vh',
        background: adminColors.sidebarBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: 'Inter, sans-serif'
    }}>
      <section style={{ 
          ...adminPanelStyle, 
          maxWidth: 420, 
          width: '100%',
          padding: 40,
          border: 'none',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ 
              width: 56, 
              height: 56, 
              background: adminColors.primaryLight, 
              borderRadius: 16, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              margin: '0 auto 20px',
              color: adminColors.primary
          }}>
            <ShieldCheck size={32} />
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800, color: adminColors.text }}>
            Admin Portal
          </h1>
          <div style={{ color: adminColors.primary, fontWeight: 700, fontSize: 13, letterSpacing: '0.05em' }}>
            ECONOMIZAFACIL.IA.BR
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.textSecondary }}>Assinatura Digital</label>
            <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: adminColors.neutral }} />
                <input
                    style={{ ...adminInputStyle, paddingLeft: 40 }}
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    autoFocus
                />
            </div>
          </div>

          <button type="submit" style={{ ...adminButtonStyle, width: '100%', gap: 10 }} disabled={loading}>
            {loading ? "Verificando..." : "Acessar Painel"}
            {!loading && <ArrowRight size={18} />}
          </button>

          {error ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                background: "#FEF2F2",
                border: "1px solid #FEE2E2",
                color: adminColors.error,
                fontSize: 13,
                fontWeight: 600,
                textAlign: 'center'
              }}
            >
              {error}
            </div>
          ) : null}
        </form>

        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 12, color: adminColors.neutral }}>
          Protegido por Economiza Fácil IA &copy; 2026
        </div>
      </section>
    </div>
  );
}
