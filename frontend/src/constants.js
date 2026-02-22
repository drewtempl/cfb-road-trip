export const COLORS = {
  bg: "#0B0E14",
  panel: "#111620",
  panelBorder: "#1C2333",
  surface: "#161D2B",
  text: "#E2E8F0",
  textMuted: "#64748B",
  textDim: "#475569",
  accent: "#F59E0B",
  accentGlow: "#F59E0B44",
  routeLine: "#F59E0B",
  routeGlow: "#F59E0B66",
};

export const TIME_SLOT_COLORS = {
  evening:   { bg: "#7C3AED22", border: "#7C3AED", dot: "#A78BFA", label: "Evening" },
  noon:      { bg: "#059B6922", border: "#059B69", dot: "#34D399", label: "Noon" },
  afternoon: { bg: "#D9770622", border: "#D97706", dot: "#F59E0B", label: "Afternoon" },
};

export const ALL_TIME_SLOTS = ["noon", "afternoon", "evening"];

export const WEEKS = Array.from({ length: 15 }, (_, i) => i + 1);
