/**
 * Admin UI Design System (Economiza Fácil Model - Premium Clean Theme)
 * Centralized styles for the Economiza Fácil Admin Panel.
 */

export const adminColors = {
  primary: "#7C3AED", // Royal Purple (Vibrant)
  primaryLight: "#F5F3FF",
  primaryText: "#FFFFFF",
  sidebarBg: "#0B0E14", // Deeper Dark Navy
  sidebarActive: "rgba(124, 58, 237, 0.12)",
  background: "#F1F5F9", // Crisp grey (Slate 100)
  surface: "#FFFFFF",
  text: "#0F172A", // Slate 900
  textSecondary: "#64748B", // Slate 500
  border: "#E2E8F0", // Slate 200
  success: "#10B981",
  error: "#EF4444",
  warning: "#F59E0B",
  neutral: "#94A3B8",
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
  borderRadius: 16,
  boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  padding: "32px",
  transition: "all 0.2s ease",
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
  borderRadius: 10,
  border: `1px solid ${adminColors.border}`,
  background: "#FFFFFF",
  padding: "12px 16px",
  fontSize: 14,
  color: adminColors.text,
  outline: "none",
  boxSizing: "border-box" as const,
  transition: "all 0.2s ease",
  ":focus": {
    borderColor: adminColors.primary,
    boxShadow: `0 0 0 4px ${adminColors.primary}1A`,
  },
};

export const adminButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  padding: "0 24px",
  borderRadius: 10,
  border: "none",
  background: adminColors.primary,
  color: "white",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  textDecoration: "none",
  transition: "all 0.2s ease",
  ":hover": {
    filter: "brightness(1.1)",
    transform: "translateY(-1px)",
  },
  ":active": {
    transform: "translateY(0)",
  }
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
