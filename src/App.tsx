import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Home from "./pages/Home";
import Analises from "./pages/Analises";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#e9dfd7",
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
        {/* Header */}
        <div style={{ background: "#0b5f55", padding: "18px 18px 14px" }}>
          <div style={{ color: "white", fontWeight: 800, letterSpacing: 0.5 }}>
            GEOOFERTAS
          </div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12 }}>
            agora online
          </div>
        </div>

        {/* Conteúdo */}
        <div style={{ padding: 16 }}>{children}</div>

        {/* Footer (nav fixo) */}
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
          <NavLink
            to="/"
            style={({ isActive }) => ({
              flex: 1,
              textAlign: "center",
              padding: "10px 12px",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 700,
              color: isActive ? "white" : "#0b5f55",
              background: isActive ? "#0b5f55" : "rgba(11,95,85,0.08)",
            })}
          >
            Lar
          </NavLink>

          <NavLink
            to="/analises"
            style={({ isActive }) => ({
              flex: 1,
              textAlign: "center",
              padding: "10px 12px",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 700,
              color: isActive ? "white" : "#0b5f55",
              background: isActive ? "#0b5f55" : "rgba(11,95,85,0.08)",
            })}
          >
            Análises
          </NavLink>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <Shell>
              <Home />
            </Shell>
          }
        />
        <Route
          path="/analises"
          element={
            <Shell>
              <Analises />
            </Shell>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}