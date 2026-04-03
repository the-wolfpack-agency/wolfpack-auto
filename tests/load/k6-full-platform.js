/**
 * Full Platform Load Test
 *
 * Simulates realistic dealer traffic patterns:
 *   - Customer browsing inventory (most traffic)
 *   - Lead submissions (conversion events)
 *   - Admin dashboard usage (staff)
 *   - API health checks (monitoring)
 *
 * Stages:
 *   1. Warm-up: 1 → 10 VUs over 30s
 *   2. Normal load: 10 VUs for 60s (typical day)
 *   3. Spike: 10 → 30 VUs over 15s (marketing blast)
 *   4. Sustained spike: 30 VUs for 60s
 *   5. Peak: 30 → 50 VUs over 15s (viral moment)
 *   6. Sustained peak: 50 VUs for 30s
 *   7. Cool-down: 50 → 0 over 30s
 *
 * Results are output as JSON for ingestion into the analytics pipeline.
 *
 * Run:
 *   k6 run --out json=load-results.json tests/load/k6-full-platform.js
 *   # Against production:
 *   k6 run --env BASE_URL=https://wolfpack-auto.vercel.app tests/load/k6-full-platform.js
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

// ---------------------------------------------------------------------------
// Custom metrics — these feed the learning system
// ---------------------------------------------------------------------------
const inventoryLatency = new Trend("inventory_latency", true);
const leadSubmitLatency = new Trend("lead_submit_latency", true);
const adminDashboardLatency = new Trend("admin_dashboard_latency", true);
const healthLatency = new Trend("health_latency", true);
const errorRate = new Rate("error_rate");
const leadSubmissions = new Counter("lead_submissions");
const inventoryViews = new Counter("inventory_views");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
export const options = {
  stages: [
    { duration: "30s", target: 10 }, // warm-up
    { duration: "60s", target: 10 }, // normal load
    { duration: "15s", target: 30 }, // spike ramp
    { duration: "60s", target: 30 }, // sustained spike
    { duration: "15s", target: 50 }, // peak ramp
    { duration: "30s", target: 50 }, // sustained peak
    { duration: "30s", target: 0 }, // cool-down
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"], // <5% errors overall
    http_req_duration: ["p(95)<3000"], // 95th percentile under 3s
    inventory_latency: ["p(95)<2000"], // inventory must be fast
    lead_submit_latency: ["p(95)<3000"], // lead submit under 3s
    admin_dashboard_latency: ["p(95)<3000"], // dashboard under 3s
    health_latency: ["p(95)<500"], // health check must be snappy
    error_rate: ["rate<0.05"], // <5% errors
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const DEALER_ID =
  __ENV.DEALER_ID || "00000000-0000-4000-a000-000000000001";

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

function customerBrowse() {
  group("Customer: Browse Inventory", () => {
    // List inventory
    let r = http.get(`${BASE_URL}/api/inventory`, {
      tags: { name: "inventory_list" },
    });
    inventoryLatency.add(r.timings.duration);
    inventoryViews.add(1);
    check(r, { "inventory list: 200": (res) => res.status === 200 });
    errorRate.add(r.status >= 400);

    // View a specific vehicle (use shadow VIN)
    r = http.get(`${BASE_URL}/api/inventory/1HGCV1F34PA000001?dealer_id=${DEALER_ID}`, {
      tags: { name: "inventory_vdp" },
    });
    inventoryLatency.add(r.timings.duration);
    check(r, {
      "VDP: 200 or 404": (res) => [200, 404].includes(res.status),
    });
    errorRate.add(r.status >= 500);

    // Spotlight vehicles
    r = http.get(`${BASE_URL}/api/inventory/spotlight?dealer_id=${DEALER_ID}`, {
      tags: { name: "inventory_spotlight" },
    });
    inventoryLatency.add(r.timings.duration);
    check(r, { "spotlight: 200": (res) => res.status === 200 });
    errorRate.add(r.status >= 400);
  });
}

function customerSubmitLead() {
  group("Customer: Submit Lead", () => {
    const email = `k6-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 6)}@loadtest.invalid`;

    const payload = JSON.stringify({
      dealer_id: DEALER_ID,
      first_name: "Load",
      last_name: "Test",
      email,
      phone: `+1555${String(Math.floor(Math.random() * 10000000)).padStart(7, "0")}`,
      vehicle_interest: "2025 Honda Accord Sport",
      source: "website_form",
    });

    const r = http.post(`${BASE_URL}/api/leads`, payload, {
      headers: { "Content-Type": "application/json" },
      tags: { name: "lead_submit" },
    });

    leadSubmitLatency.add(r.timings.duration);
    leadSubmissions.add(1);

    check(r, {
      "lead: success or rate limited": (res) =>
        [200, 201, 422, 429].includes(res.status),
      "lead: not 500": (res) => res.status !== 500,
    });
    errorRate.add(r.status >= 500);
  });
}

function adminDashboard() {
  group("Admin: Dashboard", () => {
    // Stats
    let r = http.get(`${BASE_URL}/api/admin/stats`, {
      tags: { name: "admin_stats" },
    });
    adminDashboardLatency.add(r.timings.duration);
    check(r, {
      "admin stats: 200": (res) => res.status === 200,
    });
    errorRate.add(r.status >= 400 && r.status !== 401);

    // Analytics dashboard
    r = http.get(`${BASE_URL}/api/admin/analytics/dashboard`, {
      tags: { name: "admin_analytics" },
    });
    adminDashboardLatency.add(r.timings.duration);
    check(r, {
      "analytics: 200": (res) => res.status === 200,
    });
    errorRate.add(r.status >= 400 && r.status !== 401);

    // Leads list
    r = http.get(`${BASE_URL}/api/admin/leads`, {
      tags: { name: "admin_leads" },
    });
    adminDashboardLatency.add(r.timings.duration);
    check(r, {
      "leads list: 200": (res) => res.status === 200,
    });
    errorRate.add(r.status >= 400 && r.status !== 401);
  });
}

function healthCheck() {
  group("System: Health Check", () => {
    const r = http.get(`${BASE_URL}/api/health`, {
      tags: { name: "health" },
    });
    healthLatency.add(r.timings.duration);
    check(r, {
      "health: responsive": (res) => [200, 503].includes(res.status),
    });
    errorRate.add(r.status >= 500 && r.status !== 503);
  });
}

// ---------------------------------------------------------------------------
// Main VU logic — weighted random scenario selection
// ---------------------------------------------------------------------------

export default function () {
  const roll = Math.random();

  if (roll < 0.5) {
    // 50% — customer browsing
    customerBrowse();
  } else if (roll < 0.7) {
    // 20% — lead submission
    customerSubmitLead();
  } else if (roll < 0.9) {
    // 20% — admin dashboard
    adminDashboard();
  } else {
    // 10% — health check
    healthCheck();
  }

  // Simulate think time
  sleep(Math.random() * 2 + 0.5);
}

// ---------------------------------------------------------------------------
// Summary — output results for analytics ingestion
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    type: "load_test",
    base_url: BASE_URL,
    duration_s: Math.round(
      (data.state?.testRunDurationMs || 240000) / 1000,
    ),
    max_vus: 50,
    metrics: {
      http_reqs: data.metrics?.http_reqs?.values?.count || 0,
      http_req_duration_p95:
        data.metrics?.http_req_duration?.values?.["p(95)"] || 0,
      http_req_duration_avg:
        data.metrics?.http_req_duration?.values?.avg || 0,
      http_req_failed_rate:
        data.metrics?.http_req_failed?.values?.rate || 0,
      inventory_latency_p95:
        data.metrics?.inventory_latency?.values?.["p(95)"] || 0,
      lead_submit_latency_p95:
        data.metrics?.lead_submit_latency?.values?.["p(95)"] || 0,
      admin_dashboard_latency_p95:
        data.metrics?.admin_dashboard_latency?.values?.["p(95)"] || 0,
      health_latency_p95:
        data.metrics?.health_latency?.values?.["p(95)"] || 0,
      error_rate: data.metrics?.error_rate?.values?.rate || 0,
      total_lead_submissions:
        data.metrics?.lead_submissions?.values?.count || 0,
      total_inventory_views:
        data.metrics?.inventory_views?.values?.count || 0,
    },
    thresholds_passed: Object.entries(data.root_group?.checks || {}).every(
       
      ([_, v]) => v.fails === 0,
    ),
  };

  return {
    "load-test-results.json": JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}

// k6 built-in text summary
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.3/index.js";
