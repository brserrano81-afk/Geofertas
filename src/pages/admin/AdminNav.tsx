import { NavLink } from "react-router-dom";

import { adminGhostLinkStyle } from "./adminStyles";

const links = [
  { to: "/admin/home", label: "Dashboard" },
  { to: "/admin/markets", label: "Mercados" },
  { to: "/admin/offers", label: "Ofertas" },
  { to: "/admin/queue", label: "Fila" },
  { to: "/admin/campaigns", label: "Campanhas" },
];

export default function AdminNav() {
  return (
    <nav style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          style={({ isActive }) => ({
            ...adminGhostLinkStyle,
            display: "inline-flex",
            alignItems: "center",
            minHeight: 38,
            padding: "0 14px",
            borderRadius: 999,
            background: isActive ? "rgba(15,123,108,0.12)" : "transparent",
            border: isActive ? "1px solid rgba(15,123,108,0.14)" : "1px solid transparent",
          })}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
