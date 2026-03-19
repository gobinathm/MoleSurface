export type Theme = "light" | "dark";

export function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function onThemeChange(cb: (theme: Theme) => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => cb(e.matches ? "dark" : "light");
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

export const colors = {
  light: {
    bg: "rgba(246,246,246,0.85)",
    sidebar: "rgba(238,238,238,0.9)",
    sidebarBorder: "rgba(0,0,0,0.08)",
    text: "#111",
    textMuted: "rgba(0,0,0,0.45)",
    activeItem: "rgba(0,0,0,0.09)",
    card: "rgba(0,0,0,0.04)",
    cardBorder: "rgba(0,0,0,0.08)",
    termBg: "#f0f0f0",
    termText: "#222",
    termBorder: "rgba(0,0,0,0.10)",
    titleText: "rgba(0,0,0,0.5)",
    accent: "#007AFF",
    success: "#34C759",
    warning: "#FF9500",
    danger: "#FF3B30",
    scrollThumb: "rgba(0,0,0,0.18)",
  },
  dark: {
    bg: "rgba(28,28,28,0.85)",
    sidebar: "rgba(22,22,22,0.9)",
    sidebarBorder: "rgba(255,255,255,0.07)",
    text: "#f2f2f2",
    textMuted: "rgba(255,255,255,0.4)",
    activeItem: "rgba(255,255,255,0.11)",
    card: "rgba(255,255,255,0.06)",
    cardBorder: "rgba(255,255,255,0.08)",
    termBg: "#161616",
    termText: "#d4d4d4",
    termBorder: "rgba(255,255,255,0.08)",
    titleText: "rgba(255,255,255,0.55)",
    accent: "#0A84FF",
    success: "#30D158",
    warning: "#FF9F0A",
    danger: "#FF453A",
    scrollThumb: "rgba(255,255,255,0.18)",
  },
} as const;
