import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getPartnerBands, setPartnerBands, clearPartnerBands, initDb } from "@/src/services/db";

type PartnerLineupContextValue = {
  partnerBands: Set<string>;
  importPartnerBands: (bands: string[]) => Promise<void>;
  clearPartner: () => Promise<void>;
};

const PartnerLineupContext = createContext<PartnerLineupContextValue>({
  partnerBands: new Set(),
  importPartnerBands: async () => undefined,
  clearPartner: async () => undefined,
});

export const PartnerLineupProvider = ({ children }: { children: React.ReactNode }) => {
  const [partnerBands, setPartnerBandsState] = useState<Set<string>>(new Set());

  useEffect(() => {
    initDb()
      .then(() => getPartnerBands())
      .then((names) => setPartnerBandsState(new Set(names)))
      .catch(() => {});
  }, []);

  const importPartnerBands = useCallback(async (bands: string[]) => {
    await setPartnerBands(bands);
    setPartnerBandsState(new Set(bands));
  }, []);

  const clearPartner = useCallback(async () => {
    await clearPartnerBands();
    setPartnerBandsState(new Set());
  }, []);

  const value = useMemo(
    () => ({ partnerBands, importPartnerBands, clearPartner }),
    [partnerBands, importPartnerBands, clearPartner]
  );

  return (
    <PartnerLineupContext.Provider value={value}>
      {children}
    </PartnerLineupContext.Provider>
  );
};

export const usePartnerLineup = () => useContext(PartnerLineupContext);
