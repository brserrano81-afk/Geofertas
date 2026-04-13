export const adminShellStyle = {
  display: "grid",
  gap: 18,
};

export const adminPanelStyle = {
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(15, 53, 47, 0.08)",
  borderRadius: 22,
  boxShadow: "0 18px 40px rgba(12,63,56,0.08)",
  padding: "22px",
};

export const adminGridStyle = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

export const adminInputStyle = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(15,53,47,0.14)",
  background: "white",
  padding: "12px 14px",
  fontSize: 14,
  color: "#16322e",
  outline: "none",
  boxSizing: "border-box" as const,
};

export const adminButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 46,
  padding: "0 16px",
  borderRadius: 14,
  border: "none",
  background: "#0f7b6c",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
};

export const adminSecondaryButtonStyle = {
  ...adminButtonStyle,
  background: "rgba(15,123,108,0.12)",
  color: "#0f6d61",
  border: "1px solid rgba(15,123,108,0.14)",
};
