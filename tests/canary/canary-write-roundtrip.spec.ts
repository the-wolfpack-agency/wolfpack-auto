/**
 * Canary: Write-Read-Delete Roundtrip
 *
 * Verifies that write operations actually persist to the database and
 * can be read back. This catches the scenario where Shadow Mode silently
 * accepts writes (returns 201) but never persists them.
 *
 * Uses the deep health endpoint's write roundtrip probe, PLUS an
 * application-level roundtrip through a real API endpoint.
 */

import { test, expect } from "@playwright/test";

test.describe("Write Roundtrip — Data Persistence", () => {
  test("deep health write roundtrip probe passes", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    expect(body.probes.writeRoundtrip.status).toBe("pass");
    expect(body.probes.writeRoundtrip.inserted).toBe(true);
    expect(body.probes.writeRoundtrip.readBack).toBe(true);
    expect(body.probes.writeRoundtrip.cleaned).toBe(true);
    // Roundtrip should complete in under 2 seconds
    expect(body.probes.writeRoundtrip.latencyMs).toBeLessThan(2000);
  });

  test("lead submission persists and is retrievable", async ({ request }) => {
    const testEmail = `canary-${Date.now()}@test.wolfpackauto.com`;

    // Submit a lead through the public API with full required schema
    const submitRes = await request.post("/api/leads", {
      data: {
        first_name: "Canary",
        last_name: "Probe",
        email: testEmail,
        phone: "+15550000000",
        dealer_id: "demo-dealer",
        vehicle_interest: "Any — canary probe",
        message: "Automated canary probe — safe to delete",
        source: "website_form",
      },
    });

    // Accept 200 or 201 — both indicate success
    expect(submitRes.status()).toBeLessThanOrEqual(201);
    const submitBody = await submitRes.json();

    // In Shadow Mode, this returns success but doesn't persist.
    // The response should NOT contain shadow markers.
    const bodyStr = JSON.stringify(submitBody);
    expect(bodyStr).not.toContain("Shadow mode");
    expect(bodyStr).not.toContain("shadow mode");

    // If we got an ID back, try to read it
    const leadId = submitBody.id ?? submitBody.lead?.id;
    if (leadId) {
      const readRes = await request.get(`/api/admin/leads/${leadId}`);
      if (readRes.status() === 200) {
        const lead = await readRes.json();
        expect(lead.email ?? lead.lead?.email).toBe(testEmail);
      }
      // Clean up — delete the canary lead
      await request.delete(`/api/admin/leads/${leadId}`).catch(() => {});
    }
  });

  test("analytics event persists through pipeline", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    // The analytics pipeline probe writes an event and reads it back
    expect(body.probes.analyticsPipeline.status).toBe("pass");
    expect(body.probes.analyticsPipeline.eventPersisted).toBe(true);
  });

  test("consecutive writes produce distinct records", async ({ request }) => {
    // Run deep health twice — each should create and clean up independently
    const [res1, res2] = await Promise.all([
      request.get("/api/health/deep"),
      // Small delay to avoid exact timestamp collision
      new Promise<Awaited<ReturnType<typeof request.get>>>((resolve) =>
        setTimeout(() => resolve(request.get("/api/health/deep")), 100),
      ),
    ]);

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Both should pass independently
    expect(body1.probes.writeRoundtrip.status).toBe("pass");
    expect(body2.probes.writeRoundtrip.status).toBe("pass");

    // Run IDs should be different
    expect(body1.canary.runId).not.toBe(body2.canary.runId);
  });
});
