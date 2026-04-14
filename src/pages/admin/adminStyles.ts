export const adminShellStyle = {
  display: "grid",
  gap: 18,
};

export const adminTopbarStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap" as const,
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

export const adminCardGridStyle = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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

export const adminTextAreaStyle = {
  ...adminInputStyle,
  minHeight: 108,
  resize: "vertical" as const,
  lineHeight: 1.5,
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

export const adminDangerButtonStyle = {
  ...adminButtonStyle,
  background: "rgba(158, 40, 40, 0.10)",
  color: "#8d2a2a",
  border: "1px solid rgba(158, 40, 40, 0.16)",
};

export const adminGhostLinkStyle = {
  color: "#0f6d61",
  textDecoration: "none",
  fontWeight: 800,
};

export const adminBadgeStyle = (tone: "green" | "red" | "amber" | "neutral" = "neutral") => {
  const variants = {
    green: {
      background: "rgba(15,123,108,0.12)",
      color: "#0f6d61",
    },
    red: {
      background: "rgba(158, 40, 40, 0.10)",
      color: "#8d2a2a",
    },
    amber: {
      background: "rgba(184, 128, 16, 0.12)",
      color: "#9c6c0c",
    },
    neutral: {
      background: "rgba(17,52,47,0.08)",
      color: "#11342f",
    },
  }[tone];

  return {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 30,
    padding: "0 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    ...variants,
  };
};

export const adminActionsRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap" as const,
  alignItems: "center",
};
