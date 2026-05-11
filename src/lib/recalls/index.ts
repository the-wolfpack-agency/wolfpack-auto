export * from "./types";
export {
  classifySeverity,
  fetchRecallsForVehicle,
  fetchRecallsByMake,
} from "./nhtsa-recalls-client";
export {
  getTSBProvider,
  MockTSBProvider,
  AlldataTSBProvider,
  Mitchell1TSBProvider,
  IdentifixTSBProvider,
  type TSBProvider,
} from "./tsb-providers";
export {
  matchRecalls,
  matchTSBs,
  resolveForVehicle,
} from "./vehicle-recall-resolver";
export {
  loadVehicle,
  upsertRecallFromNHTSA,
  upsertTSB,
  buildVehicleRecallReport,
  setRecallStatus,
  refreshRecallsAndTSBs,
} from "./recalls-store";
