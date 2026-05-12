/**
 * E-commerce adapter framework — public surface.
 *
 * Year-2 retail-vertical foundation per
 * `docs/wolfpack-platform-multivertical-2026-05-12.md`. Mirrors
 * `src/lib/dms-adapters/index.ts` exactly — same shape, e-commerce
 * providers instead of DMS providers.
 *
 * Importers should pull from `@/lib/ecommerce-adapters`, not from the
 * individual adapter files. The registry handles factory routing +
 * credential storage; call sites only need the typed adapter interface +
 * result types.
 *
 * See `src/lib/ecommerce-adapters/adapter-interface.ts` for the contract
 * every adapter implements.
 */

export type {
  AdapterCredentialStatus,
  AdapterPingStatus,
  AdapterResult,
  AdapterResultError,
  AdPerformanceFilter,
  AdPerformanceRow,
  CampaignSpec,
  CartFilter,
  CartSnapshot,
  ConfiguredEcommerceAdapterRecord,
  CustomerFilter,
  EcommerceAdapterProvider,
  EcommerceCapability,
  EcommerceCustomer,
  EcommerceOrder,
  EcommerceProduct,
  EmailEngagementFilter,
  EmailEngagementRow,
  FunnelMetrics,
  OrderFilter,
  ProductFilter,
} from "./types";

export {
  ALL_ECOMMERCE_ADAPTER_PROVIDERS,
  ALL_ECOMMERCE_CAPABILITIES,
} from "./types";

export type { EcommerceAdapter } from "./adapter-interface";
export {
  notConfigured,
  notSupported,
  upstreamError,
} from "./adapter-interface";

export {
  configureEcommerceAdapter,
  deleteEcommerceAdapter,
  getConfiguredEcommerceAdapter,
  getEcommerceAdapter,
  listAvailableEcommerceAdapters,
  listConfiguredEcommerceAdapters,
  recordEcommerceActionExecuted,
  registerEcommerceAdapter,
  revokeEcommerceAdapter,
  rotateEcommerceAdapterCredentials,
  seedDefaultEcommerceAdapters,
} from "./adapter-registry";

export {
  MockEcommerceAdapter,
  createMockEcommerceAdapter,
} from "./mock-adapter";
export {
  ShopifyAdapter,
  createShopifyAdapter,
  type ShopifyCredentials,
} from "./shopify-adapter";
export {
  BigCommerceAdapter,
  createBigCommerceAdapter,
  type BigCommerceCredentials,
} from "./bigcommerce-adapter";
export {
  AdobeCommerceAdapter,
  createAdobeCommerceAdapter,
  type AdobeCommerceCredentials,
} from "./adobe-commerce-adapter";
export {
  KlaviyoAdapter,
  createKlaviyoAdapter,
  type KlaviyoCredentials,
} from "./klaviyo-adapter";
export {
  AttentiveAdapter,
  createAttentiveAdapter,
  type AttentiveCredentials,
} from "./attentive-adapter";
export {
  MetaAdsAdapter,
  createMetaAdsAdapter,
  type MetaAdsCredentials,
} from "./meta-ads-adapter";
export {
  GoogleAdsAdapter,
  createGoogleAdsAdapter,
  type GoogleAdsCredentials,
} from "./google-ads-adapter";
