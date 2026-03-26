"use client";

import { createContext, useContext } from "react";
import type { DealerConfig } from "@/lib/dealer-config-shared";
import { DEFAULT_CONFIG } from "@/lib/dealer-config-shared";

export const DealerContext = createContext<DealerConfig>(DEFAULT_CONFIG);

export function DealerProvider({
  config,
  children,
}: {
  config: DealerConfig;
  children: React.ReactNode;
}) {
  return (
    <DealerContext.Provider value={config}>{children}</DealerContext.Provider>
  );
}

export function useDealerConfig(): DealerConfig {
  return useContext(DealerContext);
}
