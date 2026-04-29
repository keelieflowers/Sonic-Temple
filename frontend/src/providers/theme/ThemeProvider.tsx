import React, { createContext, useContext, useMemo } from "react";
import { ColorTokens, colors } from "@/src/theme";

type ThemeContextValue = {
  colors: ColorTokens;
};

const ThemeContext = createContext<ThemeContextValue>({ colors });

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const value = useMemo(() => ({ colors }), []);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useColors = () => useContext(ThemeContext).colors;
