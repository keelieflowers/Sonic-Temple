import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DayLineup, SONIC_TEMPLE_2026 } from "@/src/data/lineup";
import { getSelectedBands, saveSelectedBands } from "@/src/services/db";

type LineupContextValue = {
  lineup: DayLineup[];
  selectedBands: Set<string>;
  toggleBand: (name: string) => void;
  isSelected: (name: string) => boolean;
  selectDay: (day: string) => void;
  deselectDay: (day: string) => void;
};

const LineupContext = createContext<LineupContextValue>({
  lineup: SONIC_TEMPLE_2026,
  selectedBands: new Set(),
  toggleBand: () => undefined,
  isSelected: () => false,
  selectDay: () => undefined,
  deselectDay: () => undefined,
});

export const LineupProvider = ({ children }: { children: React.ReactNode }) => {
  const [selectedBands, setSelectedBands] = useState<Set<string>>(new Set());

  useEffect(() => {
    getSelectedBands().then((saved) => {
      if (saved.length > 0) {
        setSelectedBands(new Set(saved));
      }
    });
  }, []);

  const toggleBand = useCallback((name: string) => {
    setSelectedBands((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      saveSelectedBands([...next]);
      return next;
    });
  }, []);

  const isSelected = useCallback(
    (name: string) => selectedBands.has(name),
    [selectedBands]
  );

  const selectDay = useCallback((day: string) => {
    const dayBands = SONIC_TEMPLE_2026.find((d) => d.day === day)?.bands ?? [];
    setSelectedBands((prev) => {
      const next = new Set(prev);
      dayBands.forEach((b) => next.add(b));
      saveSelectedBands([...next]);
      return next;
    });
  }, []);

  const deselectDay = useCallback((day: string) => {
    const dayBands = SONIC_TEMPLE_2026.find((d) => d.day === day)?.bands ?? [];
    setSelectedBands((prev) => {
      const next = new Set(prev);
      dayBands.forEach((b) => next.delete(b));
      saveSelectedBands([...next]);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ lineup: SONIC_TEMPLE_2026, selectedBands, toggleBand, isSelected, selectDay, deselectDay }),
    [selectedBands, toggleBand, isSelected, selectDay, deselectDay]
  );

  return <LineupContext.Provider value={value}>{children}</LineupContext.Provider>;
};

export const useLineup = () => useContext(LineupContext);
