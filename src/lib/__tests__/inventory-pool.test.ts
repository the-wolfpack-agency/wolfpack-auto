/**
 * Inventory Pool / Swap Engine — unit tests.
 *
 * Shadow-mode focused (no DATABASE_URL) — we exercise the analytics + control
 * flow without standing up Postgres. Real-PG E2E lives in tests/e2e.
 */

jest.mock("@/lib/analytics", () => ({
  trackServerEvent: jest.fn().mockResolvedValue(undefined),
}));

import {
  joinPool,
  leavePool,
  recomputeVisibilities,
  searchPool,
  requestReservation,
  actOnReservation,
  proposeSwaps,
  actOnSwap,
  listIncomingReservations,
  listOutgoingReservations,
  listSwapProposals,
} from "@/lib/inventory-pool";
import { trackServerEvent } from "@/lib/analytics";

const mockedTrack = trackServerEvent as unknown as jest.Mock;

beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.NEO4J_URI;
  delete process.env.NEO4J_URL;
  mockedTrack.mockClear();
});

describe("joinPool / leavePool (shadow mode)", () => {
  test("joinPool returns ok and emits pool.member_joined", async () => {
    const r = await joinPool("group-1", "dealer-1", "all");
    expect(r.ok).toBe(true);
    expect(r.membership_id).toBeNull();
    const events = mockedTrack.mock.calls.map((c) => c[0]);
    expect(events).toContain("pool.member_joined");
    const meta = mockedTrack.mock.calls.find((c) => c[0] === "pool.member_joined")?.[1];
    expect(meta).toMatchObject({ dealer_group_id: "group-1", dealer_id: "dealer-1", share_policy: "all" });
  });

  test("joinPool defaults to share_policy=all when arg omitted", async () => {
    const r = await joinPool("group-1", "dealer-2");
    expect(r.ok).toBe(true);
  });

  test("leavePool emits pool.member_left", async () => {
    await leavePool("group-1", "dealer-1");
    const events = mockedTrack.mock.calls.map((c) => c[0]);
    expect(events).toContain("pool.member_left");
  });
});

describe("recomputeVisibilities (shadow mode)", () => {
  test("returns zero exposed/members when no DB", async () => {
    const r = await recomputeVisibilities("group-1");
    expect(r).toEqual({ exposed: 0, members: 0 });
    const events = mockedTrack.mock.calls.map((c) => c[0]);
    expect(events).toContain("pool.visibilities_recomputed");
  });
});

describe("searchPool (shadow mode)", () => {
  test("returns empty array when no DB", async () => {
    expect(await searchPool("dealer-1")).toEqual([]);
    expect(await searchPool("dealer-1", "honda")).toEqual([]);
  });
});

describe("requestReservation / actOnReservation (shadow mode)", () => {
  test("requestReservation returns ok + emits pool.reservation_created", async () => {
    const r = await requestReservation({
      vin: "1HGCV1F34LA000001",
      requestingDealerId: "dealer-A",
      owningDealerId: "dealer-B",
      customerId: "cust-1",
      notes: "VIP customer waiting",
    });
    expect(r.ok).toBe(true);
    expect(r.reservation_id).toBeNull();
    const events = mockedTrack.mock.calls.map((c) => c[0]);
    expect(events).toContain("pool.reservation_created");
  });

  test("approve / reject / fulfill all return correct target status", async () => {
    const a = await actOnReservation("res-1", "dealer-B", "approve");
    const b = await actOnReservation("res-1", "dealer-B", "reject");
    const c = await actOnReservation("res-1", "dealer-A", "fulfill");
    expect(a.status).toBe("approved");
    expect(b.status).toBe("rejected");
    expect(c.status).toBe("fulfilled");
    const events = mockedTrack.mock.calls.map((c) => c[0]);
    expect(events.filter((e) => e === "pool.reservation_action").length).toBe(3);
  });
});

describe("proposeSwaps (shadow mode)", () => {
  test("returns zero proposed/considered when no DB", async () => {
    const r = await proposeSwaps("group-1");
    expect(r).toEqual({ proposed: 0, considered: 0 });
  });
});

describe("actOnSwap (shadow mode)", () => {
  test.each([
    ["accept", "accepted"],
    ["reject", "rejected"],
    ["complete", "completed"],
  ] as const)("returns %s -> %s", async (action, status) => {
    const r = await actOnSwap("swap-1", "dealer-A", action);
    expect(r.status).toBe(status);
    expect(r.ok).toBe(true);
  });
  test("emits pool.swap_action", async () => {
    await actOnSwap("swap-1", "d", "accept");
    const events = mockedTrack.mock.calls.map((c) => c[0]);
    expect(events).toContain("pool.swap_action");
  });
});

describe("List endpoints (shadow mode)", () => {
  test("listIncomingReservations returns []", async () => {
    expect(await listIncomingReservations("d")).toEqual([]);
  });
  test("listOutgoingReservations returns []", async () => {
    expect(await listOutgoingReservations("d")).toEqual([]);
  });
  test("listSwapProposals returns []", async () => {
    expect(await listSwapProposals("g")).toEqual([]);
  });
});

describe("Triple-write degradation", () => {
  test("requestReservation does not throw when neo4j unset", async () => {
    process.env.NEO4J_URI = "";
    await expect(
      requestReservation({
        vin: "1HGCV1F34LA000001",
        requestingDealerId: "a",
        owningDealerId: "b",
      }),
    ).resolves.toEqual({ ok: true, reservation_id: null });
  });
});

describe("Share policy union", () => {
  test("all four share policies are accepted", async () => {
    for (const p of ["all", "used_only", "aged_only", "opt_in_per_vehicle"] as const) {
      const r = await joinPool("g", "d", p);
      expect(r.ok).toBe(true);
    }
  });
});
