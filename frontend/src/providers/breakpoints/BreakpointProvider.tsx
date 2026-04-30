import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  BreakpointRow,
  deleteBreakpoint,
  getBreakpoints,
  saveBreakpoint,
} from "@/src/services/db";

type BreakpointContextValue = {
  breakpoints: Map<string, BreakpointRow>;
  setBreakpoint: (bp: BreakpointRow) => Promise<void>;
  removeBreakpoint: (artist: string) => Promise<void>;
  getBreakpoint: (artist: string) => BreakpointRow | undefined;
};

const BreakpointContext = createContext<BreakpointContextValue>({
  breakpoints: new Map(),
  setBreakpoint: async () => undefined,
  removeBreakpoint: async () => undefined,
  getBreakpoint: () => undefined,
});

export const BreakpointProvider = ({ children }: { children: React.ReactNode }) => {
  const [breakpoints, setBreakpoints] = useState<Map<string, BreakpointRow>>(new Map());

  useEffect(() => {
    getBreakpoints().then((rows) => {
      setBreakpoints(new Map(rows.map((r) => [r.artist, r])));
    });
  }, []);

  const setBreakpoint = useCallback(async (bp: BreakpointRow) => {
    await saveBreakpoint(bp);
    setBreakpoints((prev) => new Map(prev).set(bp.artist, bp));
  }, []);

  const removeBreakpoint = useCallback(async (artist: string) => {
    await deleteBreakpoint(artist);
    setBreakpoints((prev) => {
      const next = new Map(prev);
      next.delete(artist);
      return next;
    });
  }, []);

  const getBreakpoint = useCallback(
    (artist: string) => breakpoints.get(artist),
    [breakpoints]
  );

  const value = useMemo(
    () => ({ breakpoints, setBreakpoint, removeBreakpoint, getBreakpoint }),
    [breakpoints, setBreakpoint, removeBreakpoint, getBreakpoint]
  );

  return <BreakpointContext.Provider value={value}>{children}</BreakpointContext.Provider>;
};

export const useBreakpoints = () => useContext(BreakpointContext);
