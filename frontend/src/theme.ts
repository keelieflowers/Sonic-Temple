export type ColorTokens = {
  background: string;
  card: string;
  cardSecondary: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  success: string;
  warning: string;
  error: string;
  divider: string;
  inputBackground: string;
};

const sonicTemple: ColorTokens = {
  background: "#F2EDE4",
  card: "#FFFFFF",
  cardSecondary: "#E8E2D9",
  text: "#0D0D0D",
  textSecondary: "#2A2A2A",
  textMuted: "#7A7060",
  primary: "#CC1F1F",
  success: "#2A7A2A",
  warning: "#F5C400",
  error: "#CC1F1F",
  divider: "#D4CEC5",
  inputBackground: "#FFFFFF",
};

export const colors = sonicTemple;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const fontSizes = { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 };
export const radii = { sm: 4, md: 8, lg: 12 };
