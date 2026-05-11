import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  BreakpointRow,
  deleteBreakpoint,
  getBreakpoints,
  initDb,
  saveBreakpoint,
  clearAllBreakpoints,
} from "@/src/services/db";
import { cancelBreakpointNotifications } from "@/src/services/notifications";

type BreakpointContextValue = {
  breakpoints: Map<string, BreakpointRow>;
  setBreakpoint: (bp: BreakpointRow) => Promise<void>;
  removeBreakpoint: (artist: string) => Promise<void>;
  getBreakpoint: (artist: string) => BreakpointRow | undefined;
  clearAll: () => Promise<void>;
};

const BreakpointContext = createContext<BreakpointContextValue>({
  breakpoints: new Map(),
  setBreakpoint: async () => undefined,
  removeBreakpoint: async () => undefined,
  getBreakpoint: () => undefined,
  clearAll: async () => undefined,
});

export const BreakpointProvider = ({ children }: { children: React.ReactNode }) => {
  const [breakpoints, setBreakpoints] = useState<Map<string, BreakpointRow>>(new Map());

  useEffect(() => {
    initDb()
      .then(() => getBreakpoints())
      .then((rows) => {
        setBreakpoints(new Map(rows.map((r) => [r.artist, r])));
      })
      .catch((err) => console.error("[BreakpointProvider] Failed to load breakpoints:", err));
  }, []);

  const setBreakpoint = useCallback(async (bp: BreakpointRow) => {
    await saveBreakpoint(bp);
    setBreakpoints((prev) => new Map(prev).set(bp.artist, bp));
  }, []);

  const removeBreakpoint = useCallback(async (artist: string) => {
    await Promise.all([deleteBreakpoint(artist), cancelBreakpointNotifications(artist)]);
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

  const clearAll = useCallback(async () => {
    await clearAllBreakpoints();
    setBreakpoints(new Map());
  }, []);

  const value = useMemo(
    () => ({ breakpoints, setBreakpoint, removeBreakpoint, getBreakpoint, clearAll }),
    [breakpoints, setBreakpoint, removeBreakpoint, getBreakpoint, clearAll]
  );

  return <BreakpointContext.Provider value={value}>{children}</BreakpointContext.Provider>;
};

export const useBreakpoints = () => useContext(BreakpointContext);
