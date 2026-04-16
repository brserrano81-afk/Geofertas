/**
 * Admin UI Design System (Optsolv Model - Royal Purple Theme)
 * Centralized styles for the Economiza Fácil Admin Panel.
 */

export const adminColors = {
  primary: "#6D28D9", // Royal Purple
  primaryLight: "#EDE9FE",
  primaryText: "#FFFFFF",
  sidebarBg: "#0F1117", // Dark Navy
  sidebarActive: "rgba(109, 40, 217, 0.25)",
  background: "#F9FAFB",
  surface: "#FFFFFF",
  text: "#111827",
  textSecondary: "#6B7280",
  border: "#E5E7EB",
  success: "#10B981",
  error: "#EF4444",
  warning: "#F59E0B",
  neutral: "#9CA3AF",
};

export const adminShellStyle = {
  display: "grid",
  gap: 24,
  color: adminColors.text,
};

export const adminTopbarStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "16px 24px",
  background: adminColors.surface,
  borderBottom: `1px solid ${adminColors.border}`,
  minHeight: 64,
  boxSizing: "border-box" as const,
};

export const adminPanelStyle = {
  background: adminColors.surface,
  border: `1px solid ${adminColors.border}`,
  borderRadius: 12,
  boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  padding: "24px",
  transition: "box-shadow 0.2s ease",
};

export const adminGridStyle = {
  display: "grid",
  gap: 20,
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
};

export const adminKPIStyle = {
  ...adminPanelStyle,
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
};

export const adminInputStyle = {
  width: "100%",
  borderRadius: 8,
  border: `1px solid ${adminColors.border}`,
  background: "white",
  padding: "10px 14px",
  fontSize: 14,
  color: adminColors.text,
  outline: "none",
  boxSizing: "border-box" as const,
  transition: "border-color 0.2s, box-shadow 0.2s",
  ":focus": {
    borderColor: adminColors.primary,
    boxShadow: `0 0 0 3px ${adminColors.primaryLight}`,
  },
};

export const adminButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 40,
  padding: "0 20px",
  borderRadius: 8,
  border: "none",
  background: adminColors.primary,
  color: "white",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  textDecoration: "none",
  transition: "filter 0.2s",
};

export const adminSecondaryButtonStyle = {
  ...adminButtonStyle,
  background: adminColors.primaryLight,
  color: adminColors.primary,
  border: `1px solid ${adminColors.primary}33`,
};

export const adminDangerButtonStyle = {
  ...adminButtonStyle,
  background: "#FEE2E2",
  color: adminColors.error,
  border: `1px solid ${adminColors.error}33`,
};

export const adminBadgeStyle = (tone: "green" | "red" | "amber" | "neutral" | "purple" = "neutral") => {
  const variants = {
    green: {
      background: "#D1FAE5",
      color: "#065F46",
    },
    red: {
      background: "#FEE2E2",
      color: "#991B1B",
    },
    amber: {
      background: "#FEF3C7",
      color: "#92400E",
    },
    neutral: {
      background: "#F3F4F6",
      color: "#374151",
    },
    purple: {
      background: adminColors.primaryLight,
      color: adminColors.primary,
    },
  }[tone];

  return {
    display: "inline-flex",
    alignItems: "center",
    height: 24,
    padding: "0 8px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    ...variants,
  };
};

export const adminGhostLinkStyle = {
  color: adminColors.primary,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 14,
};
