/**
 * Core vehicle types for the Wolfpack Auto inventory system.
 */

export type VehicleCondition = "new" | "used" | "certified";
export type VehicleStatus = "available" | "pending" | "sold" | "in_transit";
export type FuelType = "gasoline" | "diesel" | "electric" | "hybrid" | "plug_in_hybrid";
export type TransmissionType = "automatic" | "manual" | "cvt";
export type DrivetrainType = "fwd" | "rwd" | "awd" | "4wd";

export interface VehiclePhoto {
  url: string;
  alt: string;
  sort_order: number;
  is_primary: boolean;
}

export interface Vehicle {
  id: string;
  vin: string;
  stock_number: string;
  dealer_id: string;

  // Core specs
  year: number;
  make: string;
  model: string;
  trim: string;
  body_style: string;
  exterior_color: string;
  interior_color: string;

  // Mechanical
  engine: string;
  transmission: TransmissionType;
  drivetrain: DrivetrainType;
  fuel_type: FuelType;
  mpg_city: number | null;
  mpg_highway: number | null;

  // Pricing
  msrp: number | null;
  price: number;
  internet_price: number | null;

  // Condition
  condition: VehicleCondition;
  mileage: number;
  status: VehicleStatus;

  // Media
  photos: VehiclePhoto[];
  photo_count: number;

  // Content
  description: string;
  features: string[];

  // Metadata
  created_at: string;
  updated_at: string;
}

/**
 * Subset of Vehicle used in search result listings.
 */
export interface VehicleListItem {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number;
  condition: VehicleCondition;
  status: VehicleStatus;
  exterior_color: string;
  photo_url: string | null;
  dealer_id: string;
}

/**
 * Faceted search filters for inventory queries.
 */
export interface InventoryFilters {
  make?: string;
  model?: string;
  year_min?: number;
  year_max?: number;
  price_min?: number;
  price_max?: number;
  mileage_max?: number;
  condition?: VehicleCondition;
  body_style?: string;
  fuel_type?: FuelType;
  transmission?: TransmissionType;
  drivetrain?: DrivetrainType;
  exterior_color?: string;
  sort_by?: "price_asc" | "price_desc" | "mileage_asc" | "year_desc" | "days_on_lot_desc" | "newest";
  page?: number;
  per_page?: number;
}
