import { useUIStore } from "@/store";

export interface ColorPalette {
  bgBase: string; bgCard: string; bgElevated: string;
  border: string; borderHover: string;
  accent: string; accentSoft: string;
  green: string; greenSoft: string;
  amber: string; amberSoft: string;
  red: string; redSoft: string;
  text: string; textMuted: string; textSub: string;
}

const dark: ColorPalette = {
  bgBase: "#0A0A0F", bgCard: "#111118", bgElevated: "#16161F",
  border: "rgba(255,255,255,0.07)", borderHover: "rgba(255,255,255,0.12)",
  accent: "#7C6FFF", accentSoft: "rgba(124,111,255,0.12)",
  green: "#22C55E", greenSoft: "rgba(34,197,94,0.1)",
  amber: "#F59E0B", amberSoft: "rgba(245,158,11,0.1)",
  red: "#EF4444", redSoft: "rgba(239,68,68,0.1)",
  text: "#F0F0FF", textMuted: "rgba(240,240,255,0.45)", textSub: "rgba(240,240,255,0.22)",
};

const light: ColorPalette = {
  bgBase: "#F4F4F8", bgCard: "#FFFFFF", bgElevated: "#EEEEF3",
  border: "rgba(0,0,0,0.08)", borderHover: "rgba(0,0,0,0.14)",
  accent: "#6157E8", accentSoft: "rgba(97,87,232,0.1)",
  green: "#16A34A", greenSoft: "rgba(22,163,74,0.1)",
  amber: "#D97706", amberSoft: "rgba(217,119,6,0.1)",
  red: "#DC2626", redSoft: "rgba(220,38,38,0.1)",
  text: "#111118", textMuted: "rgba(17,17,24,0.5)", textSub: "rgba(17,17,24,0.3)",
};

export const palettes = { dark, light };

export function useColors(): ColorPalette {
  const theme = useUIStore((s) => s.theme);
  return palettes[theme];
}