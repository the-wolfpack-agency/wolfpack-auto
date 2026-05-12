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

// ---------------------------------------------------------------------------
// Vertical filtering (migration 080)
// ---------------------------------------------------------------------------

describe("listActions — vertical filter", () => {
  test("appends (vertical = $N OR vertical = 'any') predicate when vertical supplied", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listActions({ vertical: "auto" });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/\(vertical = \$1 OR vertical = 'any'\)/);
    expect(params).toEqual(["auto"]);
  });

  test("combines role + vertical into a single WHERE clause", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listActions({ role: "fi_manager", vertical: "auto", active_only: true });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/active = TRUE AND \(\$1 = ANY\(allowed_roles\) OR 'any' = ANY\(allowed_roles\)\) AND \(vertical = \$2 OR vertical = 'any'\)/);
    expect(params).toEqual(["fi_manager", "auto"]);
  });

  test("omits vertical predicate when not supplied (Wolfpack staff curation mode)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listActions({ role: "admin" });
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).not.toMatch(/vertical = /);
  });

  test("SELECT includes vertical column", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listActions({});
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/SELECT[^F]*vertical/s);
  });
});

describe("createAction + upsertActionBySlug — vertical persistence", () => {
  test("createAction defaults vertical to 'any' when not provided", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // dupe check
      .mockResolvedValueOnce({
        rows: [
          {
            id: "id",
            slug: VALID_INPUT.slug,
            display_name: VALID_INPUT.display_name,
            description: VALID_INPUT.description,
            parameter_schema: VALID_INPUT.parameter_schema,
            allowed_roles: VALID_INPUT.allowed_roles,
            side_effect: VALID_INPUT.side_effect,
            dry_run_supported: true,
            category: null,
            vertical: "any",
            active: true,
            created_at: "",
            updated_at: "",
          },
        ],
      });
    await createAction(VALID_INPUT);
    const insertCall = mockQuery.mock.calls[1];
    // 10 columns now (vertical added at slot 9, 0-indexed 8)
    expect(insertCall[1]).toHaveLength(10);
    expect(insertCall[1][8]).toBe("any");
  });

  test("createAction persists explicit vertical='auto'", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "id",
            slug: VALID_INPUT.slug,
            display_name: VALID_INPUT.display_name,
            description: VALID_INPUT.description,
            parameter_schema: VALID_INPUT.parameter_schema,
            allowed_roles: VALID_INPUT.allowed_roles,
            side_effect: VALID_INPUT.side_effect,
            dry_run_supported: true,
            category: null,
            vertical: "auto",
            active: true,
            created_at: "",
            updated_at: "",
          },
        ],
      });
    const action = await createAction({ ...VALID_INPUT, vertical: "auto" });
    expect(action.vertical).toBe("auto");
    expect(mockQuery.mock.calls[1][1][8]).toBe("auto");
  });

  test("createAction rejects unknown vertical value", async () => {
    await expect(
      createAction({ ...VALID_INPUT, vertical: "spaceship" as any }),
    ).rejects.toBeInstanceOf(AssistantValidationError);
  });

  test("upsertActionBySlug carries vertical through ON CONFLICT update", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "id",
          slug: VALID_INPUT.slug,
          display_name: VALID_INPUT.display_name,
          description: VALID_INPUT.description,
          parameter_schema: VALID_INPUT.parameter_schema,
          allowed_roles: VALID_INPUT.allowed_roles,
          side_effect: VALID_INPUT.side_effect,
          dry_run_supported: true,
          category: null,
          vertical: "retail",
          active: true,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    await upsertActionBySlug({ ...VALID_INPUT, vertical: "retail" });
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/vertical = EXCLUDED\.vertical/);
    expect(mockQuery.mock.calls[0][1][8]).toBe("retail");
  });
});

describe("patchAction — vertical update", () => {
  test("includes vertical in UPDATE SET when provided", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "id",
          slug: VALID_INPUT.slug,
          display_name: VALID_INPUT.display_name,
          description: VALID_INPUT.description,
          parameter_schema: {},
          allowed_roles: VALID_INPUT.allowed_roles,
          side_effect: "mutating",
          dry_run_supported: true,
          category: "leads",
          vertical: "auto",
          active: true,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    await patchAction("id", { vertical: "auto" });
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/vertical = \$1/);
    expect(mockQuery.mock.calls[0][1][0]).toBe("auto");
  });

  test("rejects unknown vertical in patch", async () => {
    await expect(
      patchAction("id", { vertical: "spaceship" as any }),
    ).rejects.toBeInstanceOf(AssistantValidationError);
  });
});
