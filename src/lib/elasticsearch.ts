import { Client } from "@elastic/elasticsearch";

/**
 * Singleton Elasticsearch client.
 *
 * Attached to `globalThis` during development to survive HMR without
 * opening new connections on every reload.
 */
function createElasticsearchClient(): Client {
  const globalForEs = globalThis as unknown as { __esClient?: Client };

  if (!globalForEs.__esClient) {
    const url = process.env.ELASTICSEARCH_URL ?? "http://localhost:9200";

    globalForEs.__esClient = new Client({
      node: url,
      maxRetries: 3,
      requestTimeout: 10_000,
    });
  }

  return globalForEs.__esClient;
}

export const esClient = createElasticsearchClient();

export const VEHICLES_INDEX = "vehicles";

/**
 * Vehicle index mapping for Elasticsearch.
 *
 * - `keyword` fields: exact match / facet aggregations
 * - `text` fields: full-text search
 * - `integer` / `float` / `long`: numeric range queries
 */
const vehiclesMapping = {
  properties: {
    // Identity
    vin: { type: "keyword" as const },
    stock_number: { type: "keyword" as const },
    dealer_id: { type: "keyword" as const },

    // Specs — keyword for facets
    year: { type: "integer" as const },
    make: { type: "keyword" as const, copy_to: "searchable" },
    model: { type: "keyword" as const, copy_to: "searchable" },
    trim: { type: "keyword" as const, copy_to: "searchable" },
    body_style: { type: "keyword" as const },
    exterior_color: { type: "keyword" as const },
    interior_color: { type: "keyword" as const },

    // Mechanical — keyword for facets
    engine: { type: "keyword" as const },
    transmission: { type: "keyword" as const },
    drivetrain: { type: "keyword" as const },
    fuel_type: { type: "keyword" as const },
    mpg_city: { type: "integer" as const },
    mpg_highway: { type: "integer" as const },

    // Pricing
    msrp: { type: "float" as const },
    price: { type: "float" as const },
    internet_price: { type: "float" as const },

    // Condition
    condition: { type: "keyword" as const },
    mileage: { type: "long" as const },
    status: { type: "keyword" as const },

    // Content — full-text
    description: { type: "text" as const },
    features: { type: "text" as const },

    // Searchable catch-all
    searchable: { type: "text" as const },

    // Photos
    photo_url: { type: "keyword" as const, index: false },
    photo_count: { type: "integer" as const },

    // Timestamps
    created_at: { type: "date" as const },
    updated_at: { type: "date" as const },

    // Derived
    days_on_lot: { type: "integer" as const },
  },
};

/**
 * Ensure the vehicles index exists with the correct mapping.
 * Safe to call multiple times — no-ops if index already exists.
 */
export async function ensureVehiclesIndex(): Promise<void> {
  const exists = await esClient.indices.exists({ index: VEHICLES_INDEX });

  if (!exists) {
    await esClient.indices.create({
      index: VEHICLES_INDEX,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
        mappings: vehiclesMapping,
      },
    });
  }
}
