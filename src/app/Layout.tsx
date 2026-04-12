import { NavLink, Outlet } from "react-router-dom";

const navLinkStyle = (isActive: boolean) => ({
  flex: 1,
  textAlign: "center" as const,
  padding: "10px 12px",
  borderRadius: 12,
  textDecoration: "none",
  fontWeight: 700,
  color: isActive ? "white" : "#0b5f55",
  background: isActive ? "#0b5f55" : "rgba(11,95,85,0.08)",
});

export default function Layout() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #f5efe7 0%, #e9dfd7 45%, #ddd0c3 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: "100%",
          borderRadius: 18,
          background: "#f7f7f7",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
          overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ background: "#0b5f55", padding: "18px 18px 14px" }}>
          <div style={{ color: "white", fontWeight: 800, letterSpacing: 0.5 }}>
            GEOOFERTAS
          </div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12 }}>
            produto focado em WhatsApp first
          </div>
        </div>

        <div style={{ padding: 16 }}>
          <Outlet />
        </div>

        <div
          style={{
            borderTop: "1px solid rgba(0,0,0,0.08)",
            padding: 12,
            display: "flex",
            gap: 10,
            justifyContent: "space-between",
            background: "white",
          }}
        >
          <NavLink to="/" style={({ isActive }) => navLinkStyle(isActive)}>
            Inicio
          </NavLink>

          <NavLink to="/analises" style={({ isActive }) => navLinkStyle(isActive)}>
            Analises
          </NavLink>
        </div>
      </div>
    </div>
  );
}
