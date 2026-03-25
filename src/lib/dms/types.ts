/**
 * DMS (Dealer Management System) feed types.
 *
 * Covers CDK, Reynolds & Reynolds, Dealertrack, Tekion, and generic
 * CSV/XML imports. Every dealer pushes inventory through one of these
 * providers — the types here model the raw inbound data before
 * normalisation into the canonical Vehicle shape.
 */

// ---------------------------------------------------------------------------
// Provider enum
// ---------------------------------------------------------------------------

export enum DMSProvider {
  CDK = "CDK",
  REYNOLDS = "REYNOLDS",
  DEALERTRACK = "DEALERTRACK",
  TEKION = "TEKION",
  GENERIC_CSV = "GENERIC_CSV",
  GENERIC_XML = "GENERIC_XML",
}

// ---------------------------------------------------------------------------
// Feed configuration (stored per-dealer)
// ---------------------------------------------------------------------------

export type DMSFeedStatus = "active" | "paused" | "error" | "pending_setup";

export interface DMSFeedConfig {
  id?: string;
  dealer_id: string;
  provider: DMSProvider;
  endpoint_url: string | null;
  api_key: string | null;
  webhook_secret: string | null;
  poll_interval_minutes: number;
  last_sync: string | null; // ISO 8601
  status: DMSFeedStatus;
  column_mapping: Record<string, string> | null; // For GENERIC_CSV
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Raw DMS vehicle record — intentionally loose
// ---------------------------------------------------------------------------

/**
 * Raw vehicle record straight from a DMS feed.
 *
 * Every field is optional because real-world DMS data is notoriously
 * inconsistent. Field names vary across providers (e.g. CDK sends
 * "StockNo" while Dealertrack sends "stockNumber"). The normaliser
 * handles the mapping.
 */
export interface DMSVehicleRecord {
  // Identity — various key names across providers
  vin?: string;
  VIN?: string;
  Vin?: string;
  stock_number?: string;
  StockNo?: string;
  stockNumber?: string;
  stock_no?: string;

  // Specs
  year?: string | number;
  Year?: string | number;
  make?: string;
  Make?: string;
  model?: string;
  Model?: string;
  trim?: string;
  Trim?: string;
  TrimLevel?: string;
  body_style?: string;
  BodyStyle?: string;
  body_type?: string;
  BodyType?: string;

  // Colors
  exterior_color?: string;
  ExteriorColor?: string;
  ext_color?: string;
  ExtColor?: string;
  color?: string;
  interior_color?: string;
  InteriorColor?: string;
  int_color?: string;
  IntColor?: string;

  // Mechanical
  engine?: string;
  Engine?: string;
  EngineDescription?: string;
  transmission?: string;
  Transmission?: string;
  Trans?: string;
  drivetrain?: string;
  Drivetrain?: string;
  DriveTrain?: string;
  drive_type?: string;
  fuel_type?: string;
  FuelType?: string;
  Fuel?: string;
  mpg_city?: string | number;
  MpgCity?: string | number;
  CityMPG?: string | number;
  mpg_highway?: string | number;
  MpgHighway?: string | number;
  HighwayMPG?: string | number;
  HwyMPG?: string | number;

  // Pricing — the messiest part
  price?: string | number;
  Price?: string | number;
  ListPrice?: string | number;
  listPrice?: string | number;
  asking_price?: string | number;
  AskingPrice?: string | number;
  VehPrice?: string | number;
  msrp?: string | number;
  MSRP?: string | number;
  internet_price?: string | number;
  InternetPrice?: string | number;
  invoicePrice?: string | number;
  InvoicePrice?: string | number;

  // Condition / mileage
  condition?: string;
  Condition?: string;
  NewUsed?: string;
  new_used?: string;
  Type?: string;
  mileage?: string | number;
  Mileage?: string | number;
  Odometer?: string | number;
  Miles?: string | number;

  // Status
  status?: string;
  Status?: string;
  VehicleStatus?: string;

  // Content
  description?: string;
  Description?: string;
  Comments?: string;
  comments?: string;
  features?: string | string[];
  Features?: string | string[];
  Options?: string | string[];
  options?: string | string[];

  // Photos
  photos?: string | string[];
  Photos?: string | string[];
  ImageUrls?: string | string[];
  image_urls?: string | string[];
  PhotoUrl?: string;
  photo_url?: string;

  // Dates (CDK sends YYYYMMDD, others ISO)
  date_in_stock?: string;
  DateInStock?: string;
  InStockDate?: string;

  // Catch-all for unmapped fields
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Feed processing result
// ---------------------------------------------------------------------------

export interface DMSFeedError {
  vin: string | null;
  field: string | null;
  message: string;
  raw_value?: unknown;
}

export interface DMSFeedResult {
  dealer_id: string;
  provider: DMSProvider;
  sync_type: "full" | "incremental" | "upload";
  vehicles_received: number;
  vehicles_added: number;
  vehicles_updated: number;
  vehicles_removed: number;
  vehicles_skipped: number;
  errors: DMSFeedError[];
  warnings: string[];
  sync_duration_ms: number;
  synced_at: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Normalisation result (per-vehicle)
// ---------------------------------------------------------------------------

export interface NormalisationResult {
  vehicle: Partial<import("@/types/vehicle").Vehicle> | null;
  warnings: string[];
  errors: string[];
}
