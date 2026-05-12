/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for wolfpack-assistant/conversation-logger.ts.
 *
 * Covers the SQL shape on start / append / end, the rollup counter
 * bumps, and the read paths. Neo4j + Qdrant fan-outs are mocked.
 */

const mockQuery = jest.fn();
const mockExecuteNeo4j = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
  pool: { connect: jest.fn(), query: jest.fn(), end: jest.fn() },
}));
jest.mock("@/lib/neo4j-client", () => ({
  executeNeo4jQueries: (...a: any[]) => mockExecuteNeo4j(...a),
  neo4jHealthCheck: jest.fn(),
}));

import {
  startConversation,
  appendMessage,
  endConversation,
  listConversationsForDealer,
  getConversation,
  listMessages,
} from "../conversation-logger";

beforeEach(() => {
  mockQuery.mockReset();
  mockExecuteNeo4j.mockReset();
  mockExecuteNeo4j.mockResolvedValue({ executed: 1, failed: 0 });
  process.env.DATABASE_URL = "postgres://test";
  process.env.NEO4J_URI = "neo4j://test";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.NEO4J_URI;
  delete process.env.QDRANT_URL;
});

const ID = "11111111-1111-1111-1111-111111111111";
const DEALER = "22222222-2222-2222-2222-2222222222ab";
const USER = "33333333-3333-3333-3333-333333333333";

describe("startConversation", () => {
  test("inserts a row + fans out to Neo4j", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          dealer_id: DEALER,
          user_id: USER,
          user_role: "salesperson",
          conversation_started_at: "now",
          conversation_ended_at: null,
          message_count: 0,
          actions_proposed: 0,
          actions_executed: 0,
          actions_rejected: 0,
          satisfaction_signal: null,
        },
      ],
    });
    const conv = await startConversation({
      dealer_id: DEALER,
      user_id: USER,
      user_role: "salesperson",
    });
    expect(conv.id).toBe(ID);
    expect(mockQuery.mock.calls[0][0]).toMatch(/INSERT INTO assistant_conversations/);
    expect(mockExecuteNeo4j).toHaveBeenCalledTimes(1);
    expect(mockExecuteNeo4j.mock.calls[0][0][0].statement).toMatch(/AssistantConversation/);
  });
});

describe("appendMessage", () => {
  test("rejects empty content", async () => {
    await expect(
      appendMessage({
        conversation_id: ID,
        dealer_id: DEALER,
        direction: "user",
        content: "",
      }),
    ).rejects.toThrow(/content is required/);
  });

  test("rejects invalid direction", async () => {
    await expect(
      appendMessage({
        conversation_id: ID,
        dealer_id: DEALER,
        direction: "robot" as any,
        content: "hi",
      }),
    ).rejects.toThrow(/invalid direction/);
  });

  test("assigns monotonic message_index and bumps counters", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ next_index: 3 }] }) // MAX(index)+1
      .mockResolvedValueOnce({
        rows: [
          {
            id: "mid",
            conversation_id: ID,
            dealer_id: DEALER,
            message_index: 3,
            direction: "assistant",
            content: "hi",
            proposed_action_slug: "leads.update_routing_rule",
            proposed_parameters: null,
            was_executed: null,
            execution_result: null,
            created_at: "now",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE counters
    const msg = await appendMessage({
      conversation_id: ID,
      dealer_id: DEALER,
      direction: "assistant",
      content: "hi",
      proposed_action_slug: "leads.update_routing_rule",
    });
    expect(msg.message_index).toBe(3);
    const updateSql = mockQuery.mock.calls[2][0];
    expect(updateSql).toMatch(/UPDATE assistant_conversations/);
    expect(updateSql).toMatch(/actions_proposed = actions_proposed \+ \$1/);
    expect(mockQuery.mock.calls[2][1]).toEqual([1, 0, 0, ID]);
  });

  test("rejected execution bumps actions_rejected", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ next_index: 0 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "mid2",
            conversation_id: ID,
            dealer_id: DEALER,
            message_index: 0,
            direction: "user",
            content: "no",
            proposed_action_slug: null,
            proposed_parameters: null,
            was_executed: false,
            execution_result: null,
            created_at: "now",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    await appendMessage({
      conversation_id: ID,
      dealer_id: DEALER,
      direction: "user",
      content: "no",
      was_executed: false,
    });
    expect(mockQuery.mock.calls[2][1]).toEqual([0, 0, 1, ID]);
  });
});

describe("endConversation", () => {
  test("updates ended_at + satisfaction_signal", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          dealer_id: DEALER,
          user_id: USER,
          user_role: "salesperson",
          conversation_started_at: "then",
          conversation_ended_at: "now",
          message_count: 4,
          actions_proposed: 1,
          actions_executed: 1,
          actions_rejected: 0,
          satisfaction_signal: "positive",
        },
      ],
    });
    const out = await endConversation({
      conversation_id: ID,
      satisfaction_signal: "positive",
    });
    expect(out?.satisfaction_signal).toBe("positive");
    expect(mockQuery.mock.calls[0][0]).toMatch(/conversation_ended_at = NOW\(\)/);
  });

  test("returns null when no row matched", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const out = await endConversation({ conversation_id: ID });
    expect(out).toBeNull();
  });
});

describe("listConversationsForDealer", () => {
  test("returns [] when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    expect(await listConversationsForDealer(DEALER)).toEqual([]);
  });

  test("filters by user_id when supplied", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listConversationsForDealer(DEALER, { user_id: USER });
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/dealer_id = \$1 AND user_id = \$2/);
    expect(mockQuery.mock.calls[0][1]).toEqual([DEALER, USER]);
  });
});

describe("getConversation + listMessages", () => {
  test("getConversation scopes to dealer_id", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getConversation(ID, DEALER);
    expect(mockQuery.mock.calls[0][0]).toMatch(/id = \$1 AND dealer_id = \$2/);
    expect(mockQuery.mock.calls[0][1]).toEqual([ID, DEALER]);
  });

  test("listMessages scopes to dealer_id + ordered by message_index", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listMessages(ID, DEALER);
    expect(mockQuery.mock.calls[0][0]).toMatch(/ORDER BY message_index ASC/);
  });
});
