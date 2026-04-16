import { Navigate, Outlet, useLocation } from "react-router-dom";

import { isAdminAuthenticated, isAdminConfigured } from "./adminAuth";

import AdminLayout from "./AdminLayout";

export default function AdminRouteGuard() {
  const location = useLocation();

  if (!isAdminConfigured()) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f1117",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            padding: 32,
            borderRadius: 16,
            background: "#1a1d27",
            border: "1px solid #ff444460",
            color: "#ff4444",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Admin não configurado
          </div>
          <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6 }}>
            A variável{" "}
            <code
              style={{
                background: "#0f1117",
                padding: "2px 6px",
                borderRadius: 4,
                color: "#ff9944",
              }}
            >
              VITE_ADMIN_PASSWORD
            </code>{" "}
            não está definida neste build.{"\n"}
            Configure-a no painel do Vercel e faça um novo deploy.
          </div>
        </div>
      </div>
    );
  }

  if (!isAdminAuthenticated()) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
