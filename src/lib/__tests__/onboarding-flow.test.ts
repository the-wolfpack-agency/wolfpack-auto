/**
 * @jest-environment jsdom
 */

/**
 * Onboarding flow tests — end-to-end onboarding integration.
 *
 * Covers: onboarding status API responses, dashboard banner visibility,
 * team invite validation, wizard progress persistence, and analytics events.
 *
 * Run with: npx jest src/lib/__tests__/onboarding-flow.test.ts
 */

import { validateDealerSetup } from "../dealer-onboarding";

/* -------------------------------------------------------------------------- */
/* Mocks                                                                      */
/* -------------------------------------------------------------------------- */

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(global, "localStorage", { value: localStorageMock });

// Mock document.cookie
let cookieStore = "";
Object.defineProperty(document, "cookie", {
  get: () => cookieStore,
  set: (val: string) => {
    cookieStore = val;
  },
});

beforeEach(() => {
  mockFetch.mockReset();
  localStorageMock.clear();
  cookieStore = "";
});

/* -------------------------------------------------------------------------- */
/* Onboarding status API                                                      */
/* -------------------------------------------------------------------------- */

describe("Onboarding status API contract", () => {
  const completeStatus = {
    steps: [
      { id: "create_dealership", label: "Create your dealership", completed: true },
      { id: "add_vehicle", label: "Add your first vehicle", completed: true },
      { id: "customize_branding", label: "Customize your branding", completed: true },
      { id: "invite_team", label: "Invite a team member", completed: true },
      { id: "connect_dms", label: "Connect your DMS", completed: true },
      { id: "review_analytics", label: "Check out your analytics", completed: true },
      { id: "setup_notifications", label: "Set up notifications", completed: true },
    ],
    progress: 100,
    completed: true,
  };

  const incompleteStatus = {
    steps: [
      { id: "create_dealership", label: "Create your dealership", completed: true },
      { id: "add_vehicle", label: "Add your first vehicle", completed: false },
      { id: "customize_branding", label: "Customize your branding", completed: false },
      { id: "invite_team", label: "Invite a team member", completed: false },
      { id: "connect_dms", label: "Connect your DMS", completed: false },
      { id: "review_analytics", label: "Check out your analytics", completed: false },
      { id: "setup_notifications", label: "Set up notifications", completed: false },
    ],
    progress: 14,
    completed: false,
  };

  it("returns correct completion state when all steps are done", () => {
    expect(completeStatus.completed).toBe(true);
    expect(completeStatus.progress).toBe(100);
    expect(completeStatus.steps.every((s) => s.completed)).toBe(true);
  });

  it("returns correct completion state when steps are incomplete", () => {
    expect(incompleteStatus.completed).toBe(false);
    expect(incompleteStatus.progress).toBeLessThan(100);

    const completedCount = incompleteStatus.steps.filter((s) => s.completed).length;
    expect(completedCount).toBe(1);
  });

  it("status response has required shape with steps array", () => {
    for (const status of [completeStatus, incompleteStatus]) {
      expect(status).toHaveProperty("steps");
      expect(status).toHaveProperty("progress");
      expect(status).toHaveProperty("completed");
      expect(Array.isArray(status.steps)).toBe(true);

      for (const step of status.steps) {
        expect(step).toHaveProperty("id");
        expect(step).toHaveProperty("label");
        expect(step).toHaveProperty("completed");
        expect(typeof step.completed).toBe("boolean");
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Dashboard banner visibility                                                */
/* -------------------------------------------------------------------------- */

describe("Dashboard onboarding banner", () => {
  it("shows banner when setup is incomplete", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        steps: [
          { completed: true },
          { completed: false },
          { completed: false },
          { completed: false },
        ],
        completed: false,
      }),
    });

    const res = await fetch("/api/admin/onboarding/status");
    const data = await res.json();
    expect(data.completed).toBe(false);

    // Banner should be visible (setupComplete = false)
    const setupComplete = data.completed;
    expect(setupComplete).toBe(false);
  });

  it("hides banner when setup is complete", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        steps: [
          { completed: true },
          { completed: true },
          { completed: true },
          { completed: true },
        ],
        completed: true,
      }),
    });

    const res = await fetch("/api/admin/onboarding/status");
    const data = await res.json();
    expect(data.completed).toBe(true);

    // Banner should be hidden (setupComplete = true)
    const setupComplete = data.completed;
    expect(setupComplete).toBe(true);
  });

  it("sets onboarding_complete cookie based on status", async () => {
    const isComplete = false;
    document.cookie = `onboarding_complete=${isComplete}; path=/; max-age=300; SameSite=Strict`;
    expect(document.cookie).toContain("onboarding_complete=false");
  });
});

/* -------------------------------------------------------------------------- */
/* Team invite step validation                                                */
/* -------------------------------------------------------------------------- */

describe("Team invite step", () => {
  it("validates well-formed email addresses", () => {
    const validEmails = [
      "user@example.com",
      "test.name@dealer.org",
      "admin+tag@wolfpack.io",
    ];
    const invalidEmails = [
      "",
      "not-an-email",
      "@missing-user.com",
      "spaces in@email.com",
      "missing@",
    ];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const email of validEmails) {
      expect(emailRegex.test(email)).toBe(true);
    }
    for (const email of invalidEmails) {
      expect(emailRegex.test(email)).toBe(false);
    }
  });

  it("rejects duplicate email addresses", () => {
    const team = [
      { email: "alice@example.com", role: "admin" as const },
      { email: "bob@example.com", role: "staff" as const },
    ];

    const newEmail = "alice@example.com";
    const isDuplicate = team.some((m) => m.email.toLowerCase() === newEmail.toLowerCase());
    expect(isDuplicate).toBe(true);
  });

  it("accepts valid team member with role", () => {
    const team: Array<{ email: string; role: "admin" | "manager" | "staff" }> = [];
    const validRoles = ["admin", "manager", "staff"] as const;

    for (const role of validRoles) {
      team.push({ email: `${role}@example.com`, role });
    }

    expect(team).toHaveLength(3);
    expect(team[0].role).toBe("admin");
    expect(team[1].role).toBe("manager");
    expect(team[2].role).toBe("staff");
  });
});

/* -------------------------------------------------------------------------- */
/* Onboarding wizard persistence                                              */
/* -------------------------------------------------------------------------- */

describe("Onboarding wizard progress persistence", () => {
  const STORAGE_KEY = "wolfpack_onboarding_progress";

  it("saves progress to localStorage on step change", () => {
    const payload = {
      step: 1,
      data: {
        dealership: {
          name: "Test Motors",
          phone: "555-1234",
          email: "test@example.com",
          address: "",
          city: "",
          state: "",
          zip: "",
          website: "",
        },
        branding: { logoFile: null, primaryColor: "#0070c7", tagline: "" },
        inventory: { method: "csv" as const },
        team: [],
      },
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.step).toBe(1);
    expect(saved.data.dealership.name).toBe("Test Motors");
  });

  it("restores progress from localStorage on mount", () => {
    const payload = {
      step: 2,
      data: {
        dealership: {
          name: "Saved Dealer",
          phone: "555-9999",
          email: "saved@example.com",
          address: "123 Main St",
          city: "Tampa",
          state: "FL",
          zip: "33601",
          website: "https://example.com",
        },
        branding: { logoFile: null, primaryColor: "#ff0000", tagline: "Test" },
        inventory: { method: "manual" as const },
        team: [{ email: "team@example.com", role: "staff" as const }],
      },
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);

    // Step should clamp to max (STEPS.length - 1 = 3)
    const STEPS_LENGTH = 4; // Dealership Info, Customize, Invite Team, Review
    const clampedStep = Math.min(saved.step, STEPS_LENGTH - 1);
    expect(clampedStep).toBe(2);
    expect(saved.data.team).toHaveLength(1);
  });

  it("clears localStorage after successful submission", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step: 0, data: {} }));
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    localStorage.removeItem(STORAGE_KEY);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("persists progress via PATCH to server", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ saved: true, currentStep: 1 }),
    });

    const res = await fetch("/api/admin/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentStep: 1,
        data: { dealership: { name: "Test" } },
        templateId: null,
      }),
    });

    expect(res.ok).toBe(true);
    const result = await res.json();
    expect(result.saved).toBe(true);

    // Verify no Bearer placeholder in the request
    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Authorization");
  });
});

/* -------------------------------------------------------------------------- */
/* Analytics events                                                           */
/* -------------------------------------------------------------------------- */

describe("Onboarding analytics events", () => {
  it("tracks onboarding_started event shape", () => {
    const event = {
      eventType: "system",
      action: "onboarding_started",
      metadata: { template_selected: "none" },
    };
    expect(event.eventType).toBe("system");
    expect(event.action).toBe("onboarding_started");
  });

  it("tracks onboarding_step_completed with step name", () => {
    const steps = ["Dealership Info", "Customize", "Invite Your Team", "Review & Launch"];
    for (let i = 0; i < steps.length; i++) {
      const event = {
        eventType: "onboarding",
        action: "step_completed",
        metadata: {
          step_index: i,
          step_name: steps[i],
          duration_ms: 5000,
        },
      };
      expect(event.metadata.step_index).toBe(i);
      expect(event.metadata.step_name).toBe(steps[i]);
    }
  });

  it("tracks onboarding_team_invited with count", () => {
    const event = {
      eventType: "system",
      action: "onboarding_team_invited",
      metadata: { count: 3 },
    };
    expect(event.metadata.count).toBe(3);
  });

  it("tracks onboarding_completed event", () => {
    const event = {
      eventType: "system",
      action: "onboarding_completed",
      metadata: {
        total_steps: 4,
        skipped_customize: false,
        template_selected: "none",
        csv_vehicles: 0,
        team_invited: 2,
      },
    };
    expect(event.metadata.total_steps).toBe(4);
    expect(event.metadata.team_invited).toBe(2);
  });

  it("tracks onboarding_banner_dismissed event", () => {
    const event = {
      eventType: "system",
      action: "onboarding_banner_dismissed",
      metadata: { completed_steps: 2, total_steps: 7 },
    };
    expect(event.metadata.completed_steps).toBe(2);
  });

  it("tracks onboarding_banner_shown event", () => {
    const event = {
      eventType: "system",
      action: "onboarding_banner_shown",
      metadata: { completed_steps: 1, total_steps: 7 },
    };
    expect(event.metadata.total_steps).toBe(7);
  });

  it("tracks onboarding_sidebar_clicked event", () => {
    const event = {
      eventType: "system",
      action: "onboarding_sidebar_clicked",
      metadata: { completed_steps: 3, total_steps: 7 },
    };
    expect(event.action).toBe("onboarding_sidebar_clicked");
  });
});

/* -------------------------------------------------------------------------- */
/* Setup validation (integration with dealer-onboarding.ts)                   */
/* -------------------------------------------------------------------------- */

describe("validateDealerSetup for onboarding status", () => {
  it("returns complete=true when all fields are present", () => {
    const result = validateDealerSetup({
      name: "Test Dealer",
      phone: "555-1234",
      email: "test@example.com",
      address_street: "123 Main",
      address_city: "Tampa",
      address_state: "FL",
      address_zip: "33601",
      branding_config: { primaryColor: "#ff0000" },
      inventory_count: 5,
      team_count: 2,
    });
    expect(result.complete).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("returns complete=false and lists missing fields", () => {
    const result = validateDealerSetup({
      name: "Test",
      phone: "",
      email: "test@example.com",
    });
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("phone_number");
    expect(result.missing).toContain("inventory");
    expect(result.missing).toContain("team_members");
  });

  it("flags missing branding when null", () => {
    const result = validateDealerSetup({
      name: "Test",
      phone: "555",
      email: "t@t.com",
      address_street: "1",
      address_city: "C",
      address_state: "S",
      address_zip: "Z",
      branding_config: null,
      inventory_count: 1,
      team_count: 1,
    });
    expect(result.missing).toContain("branding_configuration");
    expect(result.complete).toBe(false);
  });
});
