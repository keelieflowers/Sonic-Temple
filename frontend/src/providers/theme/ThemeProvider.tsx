import React, { createContext, useContext } from "react";
import { ColorTokens, colors } from "@/src/theme";

type ThemeContextValue = {
  colors: ColorTokens;
};

const ThemeContext = createContext<ThemeContextValue>({ colors });

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  return <ThemeContext.Provider value={{ colors }}>{children}</ThemeContext.Provider>;
};

export const useColors = () => useContext(ThemeContext).colors;
