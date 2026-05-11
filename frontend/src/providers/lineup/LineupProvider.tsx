import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DayLineup, SONIC_TEMPLE_2026 } from "@/src/data/lineup";
import {
  initDb,
  getSelectedBands,
  upsertBand,
  setBandHidden,
  setBandTier,
  clearAllBands,
} from "@/src/services/db";
import { SCHEDULE } from "@/src/data/schedule";
import { scheduleMustSeeNotification, cancelMustSeeNotification } from "@/src/services/notifications";

type BandMeta = { hidden: boolean; tier: string | null };

type LineupContextValue = {
  lineup: DayLineup[];
  selectedBands: Set<string>;
  toggleBand: (name: string) => void;
  isSelected: (name: string) => boolean;
  isMustSee: (name: string) => boolean;
  toggleMustSee: (name: string) => void;
  selectDay: (day: string) => void;
  deselectDay: (day: string) => void;
  clearAll: () => Promise<void>;
};

const LineupContext = createContext<LineupContextValue>({
  lineup: SONIC_TEMPLE_2026,
  selectedBands: new Set(),
  toggleBand: () => undefined,
  isSelected: () => false,
  isMustSee: () => false,
  toggleMustSee: () => undefined,
  selectDay: () => undefined,
  deselectDay: () => undefined,
  clearAll: async () => undefined,
});

export const LineupProvider = ({ children }: { children: React.ReactNode }) => {
  const [bandMeta, setBandMeta] = useState<Map<string, BandMeta>>(new Map());

  useEffect(() => {
    initDb()
      .then(() => getSelectedBands())
      .then((rows) => {
        if (rows.length > 0) {
          setBandMeta(new Map(rows.map((r) => [r.name, { hidden: r.hidden === 1, tier: r.tier }])));
        }
      })
      .catch((err) => console.error("[LineupProvider] Failed to load saved bands:", err));
  }, []);

  // Visible (non-hidden) bands — consumed by timeline and settings
  const selectedBands = useMemo(
    () => new Set([...bandMeta.entries()].filter(([, v]) => !v.hidden).map(([k]) => k)),
    [bandMeta]
  );

  const toggleBand = useCallback((name: string) => {
    setBandMeta((prev) => {
      const next = new Map(prev);
      const meta = next.get(name);
      if (!meta) {
        // Never selected — insert and show
        upsertBand(name);
        next.set(name, { hidden: false, tier: null });
      } else if (meta.hidden) {
        // Hidden — bring back
        setBandHidden(name, false);
        next.set(name, { ...meta, hidden: false });
      } else {
        // Visible — soft-hide
        setBandHidden(name, true);
        next.set(name, { ...meta, hidden: true });
      }
      return next;
    });
  }, []);

  const isSelected = useCallback(
    (name: string) => {
      const meta = bandMeta.get(name);
      return meta !== undefined && !meta.hidden;
    },
    [bandMeta]
  );

  const isMustSee = useCallback(
    (name: string) => bandMeta.get(name)?.tier === "must_see",
    [bandMeta]
  );

  const toggleMustSee = useCallback((name: string) => {
    const entry = SCHEDULE.find((e) => e.artist === name);
    setBandMeta((prev) => {
      const next = new Map(prev);
      const meta = next.get(name);
      if (!meta) {
        upsertBand(name).then(() => setBandTier(name, "must_see"));
        next.set(name, { hidden: false, tier: "must_see" });
        if (entry) scheduleMustSeeNotification(entry);
      } else if (meta.tier === "must_see") {
        setBandTier(name, null);
        next.set(name, { ...meta, tier: null });
        cancelMustSeeNotification(name);
      } else {
        if (meta.hidden) setBandHidden(name, false);
        setBandTier(name, "must_see");
        next.set(name, { ...meta, hidden: false, tier: "must_see" });
        if (entry) scheduleMustSeeNotification(entry);
      }
      return next;
    });
  }, []);

  const selectDay = useCallback((day: string) => {
    const dayBands = SONIC_TEMPLE_2026.find((d) => d.day === day)?.bands ?? [];
    setBandMeta((prev) => {
      const next = new Map(prev);
      for (const name of dayBands) {
        const meta = next.get(name);
        if (!meta) {
          upsertBand(name);
          next.set(name, { hidden: false, tier: null });
        } else if (meta.hidden) {
          setBandHidden(name, false);
          next.set(name, { ...meta, hidden: false });
        }
      }
      return next;
    });
  }, []);

  const deselectDay = useCallback((day: string) => {
    const dayBands = SONIC_TEMPLE_2026.find((d) => d.day === day)?.bands ?? [];
    setBandMeta((prev) => {
      const next = new Map(prev);
      for (const name of dayBands) {
        const meta = next.get(name);
        if (meta && !meta.hidden) {
          setBandHidden(name, true);
          next.set(name, { ...meta, hidden: true });
        }
      }
      return next;
    });
  }, []);

  const clearAll = useCallback(async () => {
    await clearAllBands();
    setBandMeta(new Map());
  }, []);

  const value = useMemo(
    () => ({ lineup: SONIC_TEMPLE_2026, selectedBands, toggleBand, isSelected, isMustSee, toggleMustSee, selectDay, deselectDay, clearAll }),
    [selectedBands, toggleBand, isSelected, isMustSee, toggleMustSee, selectDay, deselectDay, clearAll]
  );

  return <LineupContext.Provider value={value}>{children}</LineupContext.Provider>;
};

export const useLineup = () => useContext(LineupContext);
