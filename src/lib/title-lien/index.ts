/**
 * Public surface for the title/lien lookup module.
 *
 * Routes import from "@/lib/title-lien" — not from individual client files —
 * so the registry can be reshaped without rippling into call sites.
 */

export type {
  TitleLienClient,
  TitleLienResult,
  TitleLienReason,
} from "./types";

export {
  dispatchTitleLien,
  isStateRegistered,
  registeredStateCodes,
} from "./dispatcher";

export { caClient } from "./ca-client";
export { txClient } from "./tx-client";
export { flClient, parseFlhsmvResponse } from "./fl-client";

export {
  getCachedTitleLien,
  upsertTitleLienCache,
  loadOrFetchTitleLien,
} from "./persistence";
