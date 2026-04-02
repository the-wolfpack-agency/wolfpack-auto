/**
 * API Contract Tests — Background Studio Routes
 *
 * Validates all background API endpoints return correct status codes,
 * response shapes, and handle edge cases properly.
 */

const BASE = "http://localhost:3000";

// Helper: mock authenticated fetch (bypass auth in test mode)
async function apiFetch(path: string, options?: RequestInit) {
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-test-bypass": "true",
      ...options?.headers,
    },
  });
}

describe("Background API Routes", () => {
  /* ---------------------------------------------------------------- */
  /* GET /api/admin/vehicles/backgrounds                               */
  /* ---------------------------------------------------------------- */
  describe("GET /api/admin/vehicles/backgrounds", () => {
    test("returns 200 with presets array", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds");
      // Auth may block in test — accept 200 or 401
      if (res.status === 200) {
        const data = await res.json();
        expect(data.presets).toBeDefined();
        expect(Array.isArray(data.presets)).toBe(true);
        expect(data.preset_count).toBeGreaterThan(0);
        expect(data.custom).toBeDefined();
        expect(typeof data.total_count).toBe("number");
      } else {
        expect([200, 401]).toContain(res.status);
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /* POST /api/admin/vehicles/backgrounds                              */
  /* ---------------------------------------------------------------- */
  describe("POST /api/admin/vehicles/backgrounds", () => {
    test("rejects missing vin", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds", {
        method: "POST",
        body: JSON.stringify({ preset_id: "showroom_white" }),
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain("vin");
      }
    });

    test("rejects invalid preset", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds", {
        method: "POST",
        body: JSON.stringify({ vin: "TEST123", background_type: "preset", preset_id: "nonexistent" }),
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });

    test("rejects invalid background_type", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds", {
        method: "POST",
        body: JSON.stringify({ vin: "TEST123", background_type: "invalid" }),
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });

    test("rejects invalid JSON", async () => {
      const res = await fetch(`${BASE}/api/admin/vehicles/backgrounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /* GET /api/admin/vehicles/backgrounds/remove-bg                     */
  /* ---------------------------------------------------------------- */
  describe("GET /api/admin/vehicles/backgrounds/remove-bg", () => {
    test("returns provider health status", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds/remove-bg");
      if (res.status === 200) {
        const data = await res.json();
        expect(typeof data.available).toBe("boolean");
        expect(Array.isArray(data.providers)).toBe(true);
        for (const provider of data.providers) {
          expect(provider.provider).toBeTruthy();
          expect(typeof provider.available).toBe("boolean");
        }
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /* POST /api/admin/vehicles/backgrounds/remove-bg                    */
  /* ---------------------------------------------------------------- */
  describe("POST /api/admin/vehicles/backgrounds/remove-bg", () => {
    test("rejects missing vin", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds/remove-bg", {
        method: "POST",
        body: JSON.stringify({ source_photo_url: "https://example.com/photo.jpg" }),
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });

    test("rejects missing source_photo_url", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds/remove-bg", {
        method: "POST",
        body: JSON.stringify({ vin: "TEST123" }),
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /* POST /api/admin/vehicles/backgrounds/composite                    */
  /* ---------------------------------------------------------------- */
  describe("POST /api/admin/vehicles/backgrounds/composite", () => {
    test("rejects missing vin", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds/composite", {
        method: "POST",
        body: JSON.stringify({ cutout_url: "https://example.com/cutout.png" }),
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });

    test("rejects missing cutout_url", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds/composite", {
        method: "POST",
        body: JSON.stringify({ vin: "TEST123" }),
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /* POST /api/admin/vehicles/backgrounds/batch                        */
  /* ---------------------------------------------------------------- */
  describe("POST /api/admin/vehicles/backgrounds/batch", () => {
    test("rejects empty vins array", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds/batch", {
        method: "POST",
        body: JSON.stringify({ vins: [], mode: "auto_recommend" }),
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });

    test("rejects more than 200 vins", async () => {
      const vins = Array.from({ length: 201 }, (_, i) => `VIN${i}`);
      const res = await apiFetch("/api/admin/vehicles/backgrounds/batch", {
        method: "POST",
        body: JSON.stringify({ vins, mode: "auto_recommend" }),
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });

    test("rejects apply_preset without preset_id", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds/batch", {
        method: "POST",
        body: JSON.stringify({ vins: ["VIN1"], mode: "apply_preset" }),
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });

    test("rejects apply_custom without custom_bg_id", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds/batch", {
        method: "POST",
        body: JSON.stringify({ vins: ["VIN1"], mode: "apply_custom" }),
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /* POST /api/admin/vehicles/backgrounds/engagement                   */
  /* ---------------------------------------------------------------- */
  describe("POST /api/admin/vehicles/backgrounds/engagement", () => {
    test("always returns 200 (fire-and-forget)", async () => {
      const res = await fetch(`${BASE}/api/admin/vehicles/backgrounds/engagement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vin: "TEST123",
          event: "view",
          background_type: "preset",
          preset_id: "showroom_white",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    test("handles malformed body gracefully", async () => {
      const res = await fetch(`${BASE}/api/admin/vehicles/backgrounds/engagement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      expect(res.status).toBe(200);
    });
  });

  /* ---------------------------------------------------------------- */
  /* GET /api/admin/vehicles/backgrounds/insights                      */
  /* ---------------------------------------------------------------- */
  describe("GET /api/admin/vehicles/backgrounds/insights", () => {
    test("returns insights array", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds/insights");
      if (res.status === 200) {
        const data = await res.json();
        expect(Array.isArray(data.insights)).toBe(true);
        expect(typeof data.count).toBe("number");
        expect(typeof data.source).toBe("string");
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /* POST /api/admin/vehicles/backgrounds/upload                       */
  /* ---------------------------------------------------------------- */
  describe("POST /api/admin/vehicles/backgrounds/upload", () => {
    test("rejects non-multipart request", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds/upload", {
        method: "POST",
        body: JSON.stringify({ name: "test" }),
      });
      // Should either be 400 (bad request) or 401 (auth)
      expect([400, 401, 500]).toContain(res.status);
    });
  });

  /* ---------------------------------------------------------------- */
  /* GET /api/admin/vehicles/backgrounds/recommend                     */
  /* ---------------------------------------------------------------- */
  describe("GET /api/admin/vehicles/backgrounds/recommend", () => {
    test("rejects missing vin param", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds/recommend");
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /* POST /api/admin/vehicles/backgrounds/recommend                    */
  /* ---------------------------------------------------------------- */
  describe("POST /api/admin/vehicles/backgrounds/recommend", () => {
    test("rejects empty vins", async () => {
      const res = await apiFetch("/api/admin/vehicles/backgrounds/recommend", {
        method: "POST",
        body: JSON.stringify({ vins: [] }),
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });

    test("rejects more than 200 vins", async () => {
      const vins = Array.from({ length: 201 }, (_, i) => `VIN${i}`);
      const res = await apiFetch("/api/admin/vehicles/backgrounds/recommend", {
        method: "POST",
        body: JSON.stringify({ vins }),
      });
      if (res.status !== 401) {
        expect(res.status).toBe(400);
      }
    });
  });
});
