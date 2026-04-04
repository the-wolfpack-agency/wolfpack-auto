/**
 * Drip Campaigns — Tests
 *
 * Covers: trigger evaluation, enrollment, step advancement,
 * conversion tracking, unsubscribe, campaign listing.
 */

import * as fs from "fs";
import * as path from "path";

jest.mock("@/lib/analytics-hooks", () => ({
  trackDripCampaign: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  query: jest.fn(),
}));

import {
  createCampaign,
  evaluateTriggers,
  enrollLead,
  advanceEnrollments,
  getEnrollmentStatus,
  markConverted,
  unsubscribe,
  listCampaigns,
  toggleCampaign,
  getCampaign,
  _resetForTesting,
  type BehaviorEvent,
} from "@/lib/drip-campaigns";

beforeEach(() => {
  _resetForTesting();
  delete process.env.DATABASE_URL;
});

/* ------------------------------------------------------------------ */
/*  Campaign creation                                                  */
/* ------------------------------------------------------------------ */

describe("createCampaign", () => {
  it("creates a campaign with steps", async () => {
    const campaign = await createCampaign({
      dealerId: "dealer-1",
      name: "Welcome Series",
      trigger: "lead_created",
      steps: [
        { stepNumber: 0, subject: "Welcome!", bodyTemplate: "Hi {{lead_id}}", delayHours: 1 },
        { stepNumber: 0, subject: "Follow up", bodyTemplate: "Still interested?", delayHours: 48 },
      ],
    });

    expect(campaign.id).toBeTruthy();
    expect(campaign.name).toBe("Welcome Series");
    expect(campaign.trigger).toBe("lead_created");
    expect(campaign.steps).toHaveLength(2);
    expect(campaign.steps[0].stepNumber).toBe(1);
    expect(campaign.steps[1].stepNumber).toBe(2);
    expect(campaign.active).toBe(true);
    expect(campaign.stats.totalEnrolled).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Trigger evaluation                                                 */
/* ------------------------------------------------------------------ */

describe("evaluateTriggers", () => {
  it("enrolls leads matching campaign triggers", async () => {
    const campaign = await createCampaign({
      dealerId: "dealer-1",
      name: "New Lead",
      trigger: "lead_created",
      steps: [{ stepNumber: 1, subject: "Welcome", bodyTemplate: "Hi", delayHours: 1 }],
    });

    const events: BehaviorEvent[] = [
      { leadId: "lead-1", event: "lead_created", metadata: { email: "a@b.com" }, timestamp: new Date().toISOString() },
      { leadId: "lead-2", event: "vehicle_viewed_3x", metadata: {}, timestamp: new Date().toISOString() },
    ];

    const enrollments = await evaluateTriggers(events);
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0].leadId).toBe("lead-1");
    expect(enrollments[0].campaignId).toBe(campaign.id);
  });

  it("does not double-enroll same lead", async () => {
    await createCampaign({
      dealerId: "dealer-1",
      name: "Test",
      trigger: "lead_created",
      steps: [{ stepNumber: 1, subject: "Hi", bodyTemplate: "Hi", delayHours: 1 }],
    });

    const event: BehaviorEvent = {
      leadId: "lead-dup",
      event: "lead_created",
      metadata: {},
      timestamp: new Date().toISOString(),
    };

    await evaluateTriggers([event]);
    const second = await evaluateTriggers([event]);
    expect(second).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Enrollment                                                         */
/* ------------------------------------------------------------------ */

describe("enrollLead", () => {
  it("creates enrollment with scheduled next email", async () => {
    const campaign = await createCampaign({
      dealerId: "dealer-1",
      name: "Test",
      trigger: "lead_created",
      steps: [{ stepNumber: 1, subject: "Hi", bodyTemplate: "Hi", delayHours: 24 }],
    });

    const enrollment = await enrollLead(campaign.id, "lead-e1", "test@example.com");
    expect(enrollment.status).toBe("active");
    expect(enrollment.currentStep).toBe(0);
    expect(enrollment.nextEmailDueAt).toBeTruthy();
  });

  it("updates campaign enrolled stats", async () => {
    const campaign = await createCampaign({
      dealerId: "dealer-1",
      name: "Stats",
      trigger: "lead_created",
      steps: [{ stepNumber: 1, subject: "Hi", bodyTemplate: "Hi", delayHours: 1 }],
    });

    await enrollLead(campaign.id, "lead-s1", "a@b.com");
    await enrollLead(campaign.id, "lead-s2", "c@d.com");

    const updated = await getCampaign(campaign.id);
    expect((updated as any).stats.totalEnrolled).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Step advancement                                                   */
/* ------------------------------------------------------------------ */

describe("advanceEnrollments", () => {
  it("sends due emails and advances step", async () => {
    const campaign = await createCampaign({
      dealerId: "dealer-1",
      name: "Advance Test",
      trigger: "lead_created",
      steps: [
        { stepNumber: 1, subject: "Step 1", bodyTemplate: "Hello {{lead_id}}", delayHours: 0 },
        { stepNumber: 2, subject: "Step 2", bodyTemplate: "Follow up", delayHours: 24 },
      ],
    });

    await enrollLead(campaign.id, "lead-adv", "test@example.com");

    // Advance with "now" far in the future
    const future = new Date("2099-01-01");
    const emails = await advanceEnrollments(future);

    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe("Step 1");
    expect(emails[0].body).toContain("lead-adv");
    expect(emails[0].leadId).toBe("lead-adv");
  });

  it("marks enrollment as completed after all steps", async () => {
    const campaign = await createCampaign({
      dealerId: "dealer-1",
      name: "Complete Test",
      trigger: "lead_created",
      steps: [
        { stepNumber: 1, subject: "Only step", bodyTemplate: "Hi", delayHours: 0 },
      ],
    });

    await enrollLead(campaign.id, "lead-comp", "x@y.com");
    await advanceEnrollments(new Date("2099-01-01"));

    const status = await getEnrollmentStatus("lead-comp");
    expect(status[0].status).toBe("completed");
  });
});

/* ------------------------------------------------------------------ */
/*  Conversion & Unsubscribe                                           */
/* ------------------------------------------------------------------ */

describe("markConverted", () => {
  it("marks lead as converted", async () => {
    const campaign = await createCampaign({
      dealerId: "dealer-1",
      name: "Conv Test",
      trigger: "lead_created",
      steps: [{ stepNumber: 1, subject: "Hi", bodyTemplate: "Hi", delayHours: 1 }],
    });

    await enrollLead(campaign.id, "lead-conv", "a@b.com");
    const result = await markConverted("lead-conv", campaign.id);
    expect(result).not.toBeNull();
    expect((result as any).status).toBe("converted");
    expect((result as any).convertedAt).toBeTruthy();

    const updated = await getCampaign(campaign.id);
    expect((updated as any).stats.totalConverted).toBe(1);
    expect((updated as any).stats.conversionRate).toBeGreaterThan(0);
  });
});

describe("unsubscribe", () => {
  it("unsubscribes lead from campaign", async () => {
    const campaign = await createCampaign({
      dealerId: "dealer-1",
      name: "Unsub Test",
      trigger: "lead_created",
      steps: [{ stepNumber: 1, subject: "Hi", bodyTemplate: "Hi", delayHours: 1 }],
    });

    await enrollLead(campaign.id, "lead-unsub", "a@b.com");
    const result = await unsubscribe("lead-unsub", campaign.id);
    expect(result).not.toBeNull();
    expect((result as any).status).toBe("unsubscribed");
    expect((result as any).nextEmailDueAt).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Campaign management                                                */
/* ------------------------------------------------------------------ */

describe("listCampaigns", () => {
  it("lists campaigns for a dealer", async () => {
    await createCampaign({ dealerId: "d1", name: "A", trigger: "lead_created", steps: [] });
    await createCampaign({ dealerId: "d1", name: "B", trigger: "form_abandoned", steps: [] });
    await createCampaign({ dealerId: "d2", name: "C", trigger: "lead_created", steps: [] });

    expect(await listCampaigns("d1")).toHaveLength(2);
    expect(await listCampaigns("d2")).toHaveLength(1);
  });
});

describe("toggleCampaign", () => {
  it("toggles active state", async () => {
    const campaign = await createCampaign({
      dealerId: "d1",
      name: "Toggle",
      trigger: "lead_created",
      steps: [],
    });
    expect(campaign.active).toBe(true);

    const toggled = await toggleCampaign(campaign.id);
    expect((toggled as any).active).toBe(false);

    const toggled2 = await toggleCampaign(campaign.id);
    expect((toggled2 as any).active).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  File structure                                                     */
/* ------------------------------------------------------------------ */

describe("file structure", () => {
  const base = path.resolve(__dirname, "../../..");

  it("has API route", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/api/admin/drip-campaigns/route.ts")),
    ).toBe(true);
  });

  it("has admin page", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/admin/drip-campaigns/page.tsx")),
    ).toBe(true);
  });

  it("has sidebar link", () => {
    const sidebar = fs.readFileSync(
      path.join(base, "src/components/AdminSidebar.tsx"),
      "utf-8",
    );
    expect(sidebar).toContain("/admin/drip-campaigns");
  });
});
