/**
 * eContracting — E2E Tests
 *
 * Covers the full eContracting feature: API contract CRUD, signing flow,
 * status transitions, validation errors, and the admin page rendering.
 *
 * All API routes must return 200 (or the correct status) in DEMO_MODE.
 * A non-200 on GET means a white page for the dealer user.
 */

import { test, expect } from "@playwright/test";

/* ========================================================================== */
/* API Tests                                                                  */
/* ========================================================================== */

test.describe("eContracting API — GET /api/admin/econtracting", () => {
  test("returns 200 with contracts array", async ({ request }) => {
    const resp = await request.get("/api/admin/econtracting");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("contracts");
    expect(Array.isArray(data.contracts)).toBe(true);
    expect(data).toHaveProperty("total");
    expect(typeof data.total).toBe("number");
  });

  test("each contract has the expected structure", async ({ request }) => {
    const resp = await request.get("/api/admin/econtracting");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.contracts.length).toBeGreaterThan(0);

    const contract = data.contracts[0];
    // Core fields
    expect(contract).toHaveProperty("id");
    expect(contract).toHaveProperty("deal_id");
    expect(contract).toHaveProperty("customer_name");
    expect(contract).toHaveProperty("customer_email");
    expect(contract).toHaveProperty("vehicle_description");
    expect(contract).toHaveProperty("provider");
    expect(contract).toHaveProperty("status");
    expect(contract).toHaveProperty("documents");
    expect(contract).toHaveProperty("envelope_id");
    expect(contract).toHaveProperty("sent_at");
    expect(contract).toHaveProperty("completed_at");
    expect(contract).toHaveProperty("expires_at");
    expect(contract).toHaveProperty("created_at");
    expect(contract).toHaveProperty("updated_at");

    // Documents sub-structure
    expect(Array.isArray(contract.documents)).toBe(true);
    expect(contract.documents.length).toBeGreaterThan(0);
    const doc = contract.documents[0];
    expect(doc).toHaveProperty("type");
    expect(doc).toHaveProperty("name");
    expect(doc).toHaveProperty("status");
    expect(doc).toHaveProperty("signed_at");

    // Enum values
    expect(["docusign", "hellosign", "internal"]).toContain(contract.provider);
    expect(["draft", "sent", "partially_signed", "completed", "voided", "expired"]).toContain(contract.status);
  });

  test("status filter returns only matching contracts", async ({ request }) => {
    const resp = await request.get("/api/admin/econtracting?status=completed");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    for (const contract of data.contracts) {
      expect(contract.status).toBe("completed");
    }
  });

  test("status filter with no matches returns empty array", async ({ request }) => {
    const resp = await request.get("/api/admin/econtracting?status=expired");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.contracts).toEqual([]);
    expect(data.total).toBe(0);
  });
});

test.describe("eContracting API — POST /api/admin/econtracting", () => {
  test("creates a new contract and returns 201", async ({ request }) => {
    const resp = await request.post("/api/admin/econtracting", {
      data: {
        deal_id: "deal-test-001",
        signer_name: "Test Buyer",
        signer_email: "test@example.com",
        vehicle_description: "2025 Tesla Model Y Long Range",
        provider: "internal",
        document_types: ["purchase_agreement", "buyers_guide"],
      },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data).toHaveProperty("contract");
    expect(data).toHaveProperty("created", true);

    const contract = data.contract;
    expect(contract.deal_id).toBe("deal-test-001");
    expect(contract.customer_name).toBe("Test Buyer");
    expect(contract.customer_email).toBe("test@example.com");
    expect(contract.status).toBe("draft");
    expect(contract.provider).toBe("internal");
    expect(contract.documents).toHaveLength(2);
    expect(contract.documents[0].status).toBe("pending");
    expect(contract.documents[0].type).toBe("purchase_agreement");
  });

  test("missing deal_id returns 422", async ({ request }) => {
    const resp = await request.post("/api/admin/econtracting", {
      data: {
        signer_name: "Test Buyer",
        signer_email: "test@example.com",
        document_types: ["purchase_agreement"],
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("deal_id");
  });

  test("missing signer_name returns 422", async ({ request }) => {
    const resp = await request.post("/api/admin/econtracting", {
      data: {
        deal_id: "deal-test-002",
        signer_email: "test@example.com",
        document_types: ["purchase_agreement"],
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("signer_name");
  });

  test("missing document_types returns 422", async ({ request }) => {
    const resp = await request.post("/api/admin/econtracting", {
      data: {
        deal_id: "deal-test-003",
        signer_name: "Test Buyer",
        signer_email: "test@example.com",
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("document_types");
  });

  test("invalid document type returns 422", async ({ request }) => {
    const resp = await request.post("/api/admin/econtracting", {
      data: {
        deal_id: "deal-test-004",
        signer_name: "Test Buyer",
        signer_email: "test@example.com",
        document_types: ["purchase_agreement", "nonexistent_form"],
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("nonexistent_form");
  });

  test("empty document_types array returns 422", async ({ request }) => {
    const resp = await request.post("/api/admin/econtracting", {
      data: {
        deal_id: "deal-test-005",
        signer_name: "Test Buyer",
        signer_email: "test@example.com",
        document_types: [],
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("non-empty");
  });

  test("invalid signer_email returns 422", async ({ request }) => {
    const resp = await request.post("/api/admin/econtracting", {
      data: {
        deal_id: "deal-test-006",
        signer_name: "Test Buyer",
        signer_email: "not-an-email",
        document_types: ["purchase_agreement"],
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("signer_email");
  });
});

test.describe("eContracting API — GET /api/admin/econtracting/[id]", () => {
  test("returns 200 with single contract", async ({ request }) => {
    const resp = await request.get("/api/admin/econtracting/contract-001");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("contract");
    expect(data.contract).toHaveProperty("id");
    expect(data.contract).toHaveProperty("documents");
    expect(Array.isArray(data.contract.documents)).toBe(true);
  });

  test("contract has all expected fields", async ({ request }) => {
    const resp = await request.get("/api/admin/econtracting/contract-001");
    expect(resp.status()).toBe(200);

    const { contract } = await resp.json();
    expect(contract).toHaveProperty("deal_id");
    expect(contract).toHaveProperty("customer_name");
    expect(contract).toHaveProperty("customer_email");
    expect(contract).toHaveProperty("vehicle_description");
    expect(contract).toHaveProperty("provider");
    expect(contract).toHaveProperty("status");
    expect(contract).toHaveProperty("envelope_id");
    expect(contract).toHaveProperty("created_at");
    expect(contract).toHaveProperty("updated_at");
  });
});

test.describe("eContracting API — PATCH /api/admin/econtracting/[id]", () => {
  test("action 'send' transitions contract to sent status", async ({ request }) => {
    const resp = await request.patch("/api/admin/econtracting/contract-003", {
      data: { action: "send" },
    });
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("contract");
    expect(data).toHaveProperty("updated", true);
    expect(data.contract.status).toBe("sent");
    expect(data.contract.envelope_id).toBeTruthy();
    expect(data.contract.sent_at).toBeTruthy();
    expect(data.contract.expires_at).toBeTruthy();

    // All pending docs should become sent
    for (const doc of data.contract.documents) {
      expect(doc.status).not.toBe("pending");
    }
  });

  test("action 'void' marks contract as voided", async ({ request }) => {
    const resp = await request.patch("/api/admin/econtracting/contract-void-test", {
      data: { action: "void" },
    });
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("contract");
    expect(data).toHaveProperty("updated", true);
    expect(data.contract.status).toBe("voided");
  });

  test("unknown action returns 422", async ({ request }) => {
    const resp = await request.patch("/api/admin/econtracting/contract-001", {
      data: { action: "invalid_action" },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("Unknown action");
  });

  test("action 'add_documents' appends new documents", async ({ request }) => {
    const resp = await request.patch("/api/admin/econtracting/contract-add-test", {
      data: {
        action: "add_documents",
        document_types: ["title_application", "privacy_notice"],
      },
    });
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("updated", true);
    // Should have original mock docs + 2 new ones
    const docs = data.contract.documents;
    const titleDoc = docs.find((d: { type: string }) => d.type === "title_application");
    const privacyDoc = docs.find((d: { type: string }) => d.type === "privacy_notice");
    expect(titleDoc).toBeTruthy();
    expect(privacyDoc).toBeTruthy();
    expect(titleDoc.status).toBe("pending");
    expect(privacyDoc.status).toBe("pending");
  });

  test("add_documents with invalid type returns 422", async ({ request }) => {
    const resp = await request.patch("/api/admin/econtracting/contract-001", {
      data: {
        action: "add_documents",
        document_types: ["fake_document"],
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("fake_document");
  });
});

test.describe("eContracting API — POST /api/admin/econtracting/sign", () => {
  test("signs a document and returns updated contract", async ({ request }) => {
    const resp = await request.post("/api/admin/econtracting/sign", {
      data: {
        contract_id: "contract-002",
        document_type: "odometer_disclosure",
      },
    });
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("contract");
    expect(data).toHaveProperty("signed", true);
    expect(data).toHaveProperty("all_complete");
    expect(typeof data.all_complete).toBe("boolean");
  });

  test("invalid contract_id returns 404", async ({ request }) => {
    const resp = await request.post("/api/admin/econtracting/sign", {
      data: {
        contract_id: "nonexistent-contract-999",
        document_type: "purchase_agreement",
      },
    });
    expect(resp.status()).toBe(404);

    const data = await resp.json();
    expect(data.error).toContain("not found");
  });

  test("missing required fields returns 422", async ({ request }) => {
    const resp = await request.post("/api/admin/econtracting/sign", {
      data: {
        contract_id: "contract-001",
        // missing document_type
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("document_type");
  });

  test("signing all remaining docs transitions contract to completed", async ({ request }) => {
    // contract-002 in mock has 4 docs: 2 signed, 2 sent (odometer_disclosure, credit_application)
    // Sign the remaining two
    const signOdometer = await request.post("/api/admin/econtracting/sign", {
      data: {
        contract_id: "contract-002",
        document_type: "odometer_disclosure",
      },
    });
    expect(signOdometer.status()).toBe(200);
    const odometerData = await signOdometer.json();
    // Not yet complete (credit_application still unsigned)
    expect(odometerData.all_complete).toBe(false);
    expect(odometerData.contract.status).toBe("partially_signed");

    const signCredit = await request.post("/api/admin/econtracting/sign", {
      data: {
        contract_id: "contract-002",
        document_type: "credit_application",
      },
    });
    expect(signCredit.status()).toBe(200);
    const creditData = await signCredit.json();
    // All docs signed — should be completed
    expect(creditData.all_complete).toBe(true);
    expect(creditData.contract.status).toBe("completed");
  });
});

/* ========================================================================== */
/* Page Tests                                                                 */
/* ========================================================================== */

test.describe("eContracting Page — /admin/econtracting", () => {
  test("page loads with 200 status", async ({ page }) => {
    const resp = await page.goto("/admin/econtracting", {
      waitUntil: "domcontentloaded",
    });
    expect(resp).not.toBeNull();
    expect(resp!.status()).toBe(200);
  });

  test("page has 'eContracting' heading", async ({ page }) => {
    await page.goto("/admin/econtracting", { waitUntil: "domcontentloaded" });
    const heading = page.locator("h1");
    await expect(heading).toContainText("eContracting");
  });

  test("page shows descriptive subtitle", async ({ page }) => {
    await page.goto("/admin/econtracting", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=Digital contracts")).toBeAttached();
  });

  test("stats cards are visible", async ({ page }) => {
    await page.goto("/admin/econtracting", { waitUntil: "networkidle" });

    // Stats cards render immediately with computed values from the fetched data
    await expect(page.locator("text=Total Contracts")).toBeVisible();
    await expect(page.locator("text=Pending Signatures")).toBeVisible();
    await expect(page.locator("text=Completion Rate")).toBeVisible();
    await expect(page.locator("text=Avg Time to Sign")).toBeVisible();
  });

  test("contract table displays after loading", async ({ page }) => {
    await page.goto("/admin/econtracting", { waitUntil: "networkidle" });

    // Wait for contracts to load (loading state disappears)
    await page.waitForSelector("text=Loading contracts...", {
      state: "hidden",
      timeout: 10000,
    }).catch(() => {});

    // Table should be present — either with data rows or empty state
    const table = page.locator("table");
    await expect(table).toBeVisible();
  });

  test("'New Contract' button is visible", async ({ page }) => {
    await page.goto("/admin/econtracting", { waitUntil: "domcontentloaded" });
    const button = page.locator("button", { hasText: "New Contract" });
    await expect(button).toBeVisible();
  });

  test("status filter dropdown is present", async ({ page }) => {
    await page.goto("/admin/econtracting", { waitUntil: "domcontentloaded" });
    const select = page.locator("select").first();
    await expect(select).toBeAttached();
    // Should contain "All Statuses" option
    await expect(select.locator("option", { hasText: "All Statuses" })).toBeAttached();
  });

  test("table has expected column headers", async ({ page }) => {
    await page.goto("/admin/econtracting", { waitUntil: "domcontentloaded" });
    const thead = page.locator("thead");
    await expect(thead.locator("th").first()).toBeAttached();
    const headerText = await thead.textContent();
    expect(headerText).toContain("Status");
  });
});
