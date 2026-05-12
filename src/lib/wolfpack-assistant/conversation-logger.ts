/**
 * Conversation Logger — per-dealer, per-user assistant conversation log.
 *
 * Records every prompt, every assistant response, every proposed action,
 * every executed outcome. Powers the learning loop: which prompts confuse
 * the assistant, which actions get reverted, which conversations succeed.
 *
 * Fans out to Qdrant for semantic search ("find conversations similar to
 * this one") and Neo4j for the relationship graph (user → actions →
 * outcomes). Fan-out failures NEVER block the Postgres write.
 *
 * The conversation tables are dealer-scoped with strict RLS (migration
 * 077). The library accepts dealer_id explicitly — callers pull it from
 * the request session via lib/auth-guard.ts.
 */

import type {
  AppendMessageInput,
  AssistantConversation,
  AssistantConversationMessage,
  AssistantMessageDirection,
  AssistantRole,
  AssistantSatisfactionSignal,
  EndConversationInput,
  StartConversationInput,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Row mapping                                                         */
/* ------------------------------------------------------------------ */

function mapConversation(row: Record<string, unknown>): AssistantConversation {
  return {
    id: String(row.id),
    dealer_id: String(row.dealer_id),
    user_id: String(row.user_id),
    user_role: row.user_role as AssistantRole,
    conversation_started_at: String(row.conversation_started_at),
    conversation_ended_at: row.conversation_ended_at
      ? String(row.conversation_ended_at)
      : null,
    message_count: Number(row.message_count ?? 0),
    actions_proposed: Number(row.actions_proposed ?? 0),
    actions_executed: Number(row.actions_executed ?? 0),
    actions_rejected: Number(row.actions_rejected ?? 0),
    satisfaction_signal: (row.satisfaction_signal as AssistantSatisfactionSignal | null) ?? null,
  };
}

function mapMessage(row: Record<string, unknown>): AssistantConversationMessage {
  const params = row.proposed_parameters;
  const result = row.execution_result;
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    dealer_id: String(row.dealer_id),
    message_index: Number(row.message_index),
    direction: row.direction as AssistantMessageDirection,
    content: String(row.content),
    proposed_action_slug: row.proposed_action_slug
      ? String(row.proposed_action_slug)
      : null,
    proposed_parameters:
      typeof params === "string"
        ? safeJSON(params, null)
        : (params as Record<string, unknown> | null) ?? null,
    was_executed: row.was_executed === null || row.was_executed === undefined
      ? null
      : Boolean(row.was_executed),
    execution_result:
      typeof result === "string"
        ? safeJSON(result, null)
        : (result as Record<string, unknown> | null) ?? null,
    created_at: String(row.created_at ?? ""),
  };
}

function safeJSON<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/* ------------------------------------------------------------------ */
/*  Qdrant + Neo4j fan-out (non-blocking)                               */
/* ------------------------------------------------------------------ */

async function fanOutConversationToNeo4j(
  conversation: AssistantConversation,
): Promise<void> {
  const neo4jUrl = process.env.NEO4J_URI || process.env.NEO4J_URL;
  if (!neo4jUrl) return;
  try {
    const { executeNeo4jQueries } = await import("@/lib/neo4j-client");
    await executeNeo4jQueries([
      {
        statement: `
          MERGE (c:AssistantConversation {id: $id})
          SET c.dealer_id = $dealerId,
              c.user_id = $userId,
              c.user_role = $userRole,
              c.started_at = datetime($startedAt)
          WITH c
          MERGE (u:DealerUser {id: $userId})
          MERGE (u)-[:STARTED]->(c)
        `,
        parameters: {
          id: conversation.id,
          dealerId: conversation.dealer_id,
          userId: conversation.user_id,
          userRole: conversation.user_role,
          startedAt: conversation.conversation_started_at,
        },
      },
    ]);
  } catch (err) {
    console.warn(
      "[wolfpack-assistant] Neo4j conversation fan-out failed (non-blocking):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function fanOutMessageToQdrant(
  message: AssistantConversationMessage,
): Promise<void> {
  if (!process.env.QDRANT_URL) return;
  try {
    // Lazy-import + ignore failures — semantic search is best-effort.
    const mod = await import("@/lib/qdrant-client");
    type QdrantUpsert = {
      upsertVector?: (collection: string, point: unknown) => Promise<unknown>;
    };
    const upsert = (mod as unknown as QdrantUpsert).upsertVector;
    if (typeof upsert !== "function") return;
    await upsert("assistant_conversation_messages", {
      id: message.id,
      payload: {
        conversation_id: message.conversation_id,
        dealer_id: message.dealer_id,
        message_index: message.message_index,
        direction: message.direction,
        proposed_action_slug: message.proposed_action_slug,
        content_preview: message.content.slice(0, 240),
      },
    });
  } catch (err) {
    console.warn(
      "[wolfpack-assistant] Qdrant message fan-out failed (non-blocking):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Writes                                                              */
/* ------------------------------------------------------------------ */

export async function startConversation(
  input: StartConversationInput,
): Promise<AssistantConversation> {
  if (!process.env.DATABASE_URL) {
    throw new Error("startConversation requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query<Record<string, unknown>>(
    `INSERT INTO assistant_conversations (dealer_id, user_id, user_role)
       VALUES ($1, $2, $3)
       RETURNING id, dealer_id, user_id, user_role, conversation_started_at,
                 conversation_ended_at, message_count, actions_proposed,
                 actions_executed, actions_rejected, satisfaction_signal`,
    [input.dealer_id, input.user_id, input.user_role],
  );
  const conversation = mapConversation(result.rows[0]);
  await fanOutConversationToNeo4j(conversation);
  return conversation;
}

export async function appendMessage(
  input: AppendMessageInput,
): Promise<AssistantConversationMessage> {
  if (!process.env.DATABASE_URL) {
    throw new Error("appendMessage requires DATABASE_URL");
  }
  if (!input.content || input.content.trim().length === 0) {
    throw new Error("appendMessage: content is required");
  }
  if (input.direction !== "user" && input.direction !== "assistant") {
    throw new Error(`appendMessage: invalid direction: ${input.direction}`);
  }

  const { query } = await import("@/lib/db");

  // Compute next index inside a transaction-safe SELECT-MAX pattern.
  // For v1 single-writer load this is sufficient; under contention we'd
  // move to an advisory lock or a SERIAL column.
  const max = await query<{ next_index: number }>(
    `SELECT COALESCE(MAX(message_index), -1) + 1 AS next_index
       FROM assistant_conversation_messages WHERE conversation_id = $1`,
    [input.conversation_id],
  );
  const nextIndex = max.rows[0]?.next_index ?? 0;

  const result = await query<Record<string, unknown>>(
    `INSERT INTO assistant_conversation_messages
       (conversation_id, dealer_id, message_index, direction, content,
        proposed_action_slug, proposed_parameters, was_executed, execution_result)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb)
     RETURNING id, conversation_id, dealer_id, message_index, direction, content,
               proposed_action_slug, proposed_parameters, was_executed,
               execution_result, created_at`,
    [
      input.conversation_id,
      input.dealer_id,
      nextIndex,
      input.direction,
      input.content,
      input.proposed_action_slug ?? null,
      input.proposed_parameters ? JSON.stringify(input.proposed_parameters) : null,
      input.was_executed ?? null,
      input.execution_result ? JSON.stringify(input.execution_result) : null,
    ],
  );
  const message = mapMessage(result.rows[0]);

  // Bump rollup counters on the parent conversation.
  const proposedDelta = input.proposed_action_slug ? 1 : 0;
  const executedDelta = input.was_executed === true ? 1 : 0;
  const rejectedDelta = input.was_executed === false ? 1 : 0;
  await query(
    `UPDATE assistant_conversations
        SET message_count = message_count + 1,
            actions_proposed = actions_proposed + $1,
            actions_executed = actions_executed + $2,
            actions_rejected = actions_rejected + $3
      WHERE id = $4`,
    [proposedDelta, executedDelta, rejectedDelta, input.conversation_id],
  );

  await fanOutMessageToQdrant(message);
  return message;
}

export async function endConversation(
  input: EndConversationInput,
): Promise<AssistantConversation | null> {
  if (!process.env.DATABASE_URL) {
    throw new Error("endConversation requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query<Record<string, unknown>>(
    `UPDATE assistant_conversations
        SET conversation_ended_at = NOW(),
            satisfaction_signal = COALESCE($2, satisfaction_signal)
      WHERE id = $1
      RETURNING id, dealer_id, user_id, user_role, conversation_started_at,
                conversation_ended_at, message_count, actions_proposed,
                actions_executed, actions_rejected, satisfaction_signal`,
    [input.conversation_id, input.satisfaction_signal ?? null],
  );
  return result.rows[0] ? mapConversation(result.rows[0]) : null;
}

/* ------------------------------------------------------------------ */
/*  Reads                                                               */
/* ------------------------------------------------------------------ */

export interface ListConversationsOptions {
  user_id?: string;
  limit?: number;
}

export async function listConversationsForDealer(
  dealerId: string,
  opts: ListConversationsOptions = {},
): Promise<AssistantConversation[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");

  const where: string[] = ["dealer_id = $1"];
  const params: unknown[] = [dealerId];
  if (opts.user_id) {
    params.push(opts.user_id);
    where.push(`user_id = $${params.length}`);
  }
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const result = await query<Record<string, unknown>>(
    `SELECT id, dealer_id, user_id, user_role, conversation_started_at,
            conversation_ended_at, message_count, actions_proposed,
            actions_executed, actions_rejected, satisfaction_signal
       FROM assistant_conversations
      WHERE ${where.join(" AND ")}
      ORDER BY conversation_started_at DESC
      LIMIT ${limit}`,
    params,
  );
  return result.rows.map(mapConversation);
}

export async function getConversation(
  id: string,
  dealerId: string,
): Promise<AssistantConversation | null> {
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<Record<string, unknown>>(
    `SELECT id, dealer_id, user_id, user_role, conversation_started_at,
            conversation_ended_at, message_count, actions_proposed,
            actions_executed, actions_rejected, satisfaction_signal
       FROM assistant_conversations
      WHERE id = $1 AND dealer_id = $2
      LIMIT 1`,
    [id, dealerId],
  );
  return result.rows[0] ? mapConversation(result.rows[0]) : null;
}

export async function listMessages(
  conversationId: string,
  dealerId: string,
): Promise<AssistantConversationMessage[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");
  const result = await query<Record<string, unknown>>(
    `SELECT id, conversation_id, dealer_id, message_index, direction, content,
            proposed_action_slug, proposed_parameters, was_executed,
            execution_result, created_at
       FROM assistant_conversation_messages
      WHERE conversation_id = $1 AND dealer_id = $2
      ORDER BY message_index ASC`,
    [conversationId, dealerId],
  );
  return result.rows.map(mapMessage);
}
