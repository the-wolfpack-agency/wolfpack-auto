/**
 * DMS adapter framework — public surface.
 *
 * Importers should pull from `@/lib/dms-adapters`, not from the individual
 * adapter files. The registry handles factory routing + credential storage;
 * call sites only need the typed adapter interface + result types.
 *
 * See `src/lib/dms-adapters/adapter-interface.ts` for the contract every
 * adapter implements. See `docs/wolfpack-assistant-overlay-strategy-2026-05-12.md`
 * for the strategic frame.
 */

export type {
  AdapterCapability,
  AdapterPingStatus,
  AdapterResult,
  AdapterResultError,
  AdapterCredentialStatus,
  ConfiguredAdapterRecord,
  DealFilter,
  DMSAdapterProvider,
  DMSDeal,
  DMSLead,
  DMSServiceOrder,
  DMSVehicle,
  LeadFilter,
  ServiceOrderFilter,
  VehicleFilter,
} from "./types";

export {
  ALL_ADAPTER_PROVIDERS,
  ALL_CAPABILITIES,
} from "./types";

export type { DMSAdapter } from "./adapter-interface";
export {
  notConfigured,
  notSupported,
  upstreamError,
} from "./adapter-interface";

export {
  configureAdapter,
  deleteAdapter,
  getAdapter,
  getConfiguredAdapter,
  listAvailableAdapters,
  listConfiguredAdapters,
  recordActionExecuted,
  registerAdapter,
  revokeAdapter,
  rotateAdapterCredentials,
  seedDefaultAdapters,
} from "./adapter-registry";

export { MockDMSAdapter, createMockAdapter } from "./mock-adapter";
export {
  CoxVAutoAdapter,
  createCoxVAutoAdapter,
  type CoxVAutoCredentials,
} from "./cox-vauto-adapter";
export {
  DealerSocketAdapter,
  createDealerSocketAdapter,
  type DealerSocketCredentials,
} from "./dealersocket-adapter";
export {
  CDKAdapter,
  createCDKAdapter,
  type CDKCredentials,
} from "./cdk-adapter";
