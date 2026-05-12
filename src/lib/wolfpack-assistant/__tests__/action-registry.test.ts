/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for wolfpack-assistant/action-registry.ts.
 *
 * Validates the validation surface + the upsert SQL shape + the param
 * encoding (allowed_roles is a Postgres TEXT[]; parameter_schema is
 * JSON-encoded into a JSONB column). DB writes go through a mocked
 * `query`, so we exercise SQL shape + parameter ordering without a real
 * Postgres.
 */

const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
  pool: { connect: jest.fn(), query: jest.fn(), end: jest.fn() },
}));

import {
  AssistantValidationError,
  createAction,
  upsertActionBySlug,
  patchAction,
  deleteAction,
  listActions,
  getActionBySlug,
} from "../action-registry";

beforeEach(() => {
  mockQuery.mockReset();
  process.env.DATABASE_URL = "postgres://test";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

const VALID_INPUT = {
  slug: "leads.update_routing_rule",
  display_name: "Update lead routing",
  description: "Change which sales rep gets new leads.",
  parameter_schema: { type: "object", properties: {} },
  allowed_roles: ["gm" as const, "admin" as const],
  side_effect: "mutating" as const,
};

describe("createAction validation", () => {
  test("rejects empty slug", async () => {
    await expect(
      createAction({ ...VALID_INPUT, slug: "" }),
    ).rejects.toBeInstanceOf(AssistantValidationError);
  });

  test("rejects uppercase slug", async () => {
    await expect(
      createAction({ ...VALID_INPUT, slug: "Leads.X" }),
    ).rejects.toBeInstanceOf(AssistantValidationError);
  });

  test("rejects slug with spaces", async () => {
    await expect(
      createAction({ ...VALID_INPUT, slug: "leads update" }),
    ).rejects.toBeInstanceOf(AssistantValidationError);
  });

  test("rejects empty description", async () => {
    await expect(
      createAction({ ...VALID_INPUT, description: "" }),
    ).rejects.toBeInstanceOf(AssistantValidationError);
  });

  test("rejects missing parameter_schema", async () => {
    await expect(
      createAction({ ...VALID_INPUT, parameter_schema: null as any }),
    ).rejects.toBeInstanceOf(AssistantValidationError);
  });

  test("rejects empty allowed_roles", async () => {
    await expect(
      createAction({ ...VALID_INPUT, allowed_roles: [] }),
    ).rejects.toBeInstanceOf(AssistantValidationError);
  });

  test("rejects unknown role", async () => {
    await expect(
      createAction({ ...VALID_INPUT, allowed_roles: ["wizard" as any] }),
    ).rejects.toBeInstanceOf(AssistantValidationError);
  });

  test("rejects unknown side_effect", async () => {
    await expect(
      createAction({ ...VALID_INPUT, side_effect: "explode" as any }),
    ).rejects.toBeInstanceOf(AssistantValidationError);
  });

  test("rejects duplicate slug", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    await expect(createAction(VALID_INPUT)).rejects.toBeInstanceOf(
      AssistantValidationError,
    );
  });
});

describe("createAction happy path", () => {
  test("inserts a row with the expected parameters", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // dupe check
      .mockResolvedValueOnce({
        rows: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            slug: VALID_INPUT.slug,
            display_name: VALID_INPUT.display_name,
            description: VALID_INPUT.description,
            parameter_schema: VALID_INPUT.parameter_schema,
            allowed_roles: VALID_INPUT.allowed_roles,
            side_effect: VALID_INPUT.side_effect,
            dry_run_supported: true,
            category: null,
            active: true,
            created_at: "now",
            updated_at: "now",
          },
        ],
      });
    const action = await createAction(VALID_INPUT);
    expect(action.slug).toBe(VALID_INPUT.slug);
    expect(action.allowed_roles).toEqual(VALID_INPUT.allowed_roles);
    expect(action.side_effect).toBe("mutating");
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO assistant_actions/);
    // parameter_schema is JSON-encoded into the jsonb parameter slot.
    expect(JSON.parse(insertCall[1][3])).toEqual(VALID_INPUT.parameter_schema);
  });
});

describe("upsertActionBySlug", () => {
  test("uses ON CONFLICT (slug) DO UPDATE", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          slug: VALID_INPUT.slug,
          display_name: VALID_INPUT.display_name,
          description: VALID_INPUT.description,
          parameter_schema: VALID_INPUT.parameter_schema,
          allowed_roles: VALID_INPUT.allowed_roles,
          side_effect: VALID_INPUT.side_effect,
          dry_run_supported: true,
          category: null,
          active: true,
          created_at: "now",
          updated_at: "now",
        },
      ],
    });
    await upsertActionBySlug(VALID_INPUT);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/ON CONFLICT \(slug\) DO UPDATE/);
  });
});

describe("listActions", () => {
  test("returns [] when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const out = await listActions();
    expect(out).toEqual([]);
  });

  test("filters by category + side_effect + active_only + role", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listActions({
      category: "leads",
      side_effect: "mutating",
      active_only: true,
      role: "salesperson",
    });
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/WHERE category = \$1 AND side_effect = \$2 AND active = TRUE AND/);
    expect(sql).toMatch(/ANY\(allowed_roles\)/);
    expect(mockQuery.mock.calls[0][1]).toEqual(["leads", "mutating", "salesperson"]);
  });
});

describe("patchAction", () => {
  test("rejects blank display_name", async () => {
    await expect(
      patchAction("id", { display_name: "" }),
    ).rejects.toBeInstanceOf(AssistantValidationError);
  });

  test("builds UPDATE SET clause from supplied fields", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          slug: VALID_INPUT.slug,
          display_name: "New",
          description: VALID_INPUT.description,
          parameter_schema: {},
          allowed_roles: VALID_INPUT.allowed_roles,
          side_effect: "mutating",
          dry_run_supported: true,
          category: "leads",
          active: true,
          created_at: "now",
          updated_at: "now",
        },
      ],
    });
    await patchAction("11111111-1111-1111-1111-111111111111", {
      display_name: "New",
      category: "leads",
    });
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/UPDATE assistant_actions/);
    expect(sql).toMatch(/display_name = \$1/);
    expect(sql).toMatch(/category = \$2/);
  });
});

describe("deleteAction", () => {
  test("returns true when a row was deleted", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "x" }] });
    const ok = await deleteAction("id");
    expect(ok).toBe(true);
  });
  test("returns false when nothing matched", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await deleteAction("id")).toBe(false);
  });
});

describe("getActionBySlug", () => {
  test("returns null when no row", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await getActionBySlug("nope")).toBeNull();
  });
});
