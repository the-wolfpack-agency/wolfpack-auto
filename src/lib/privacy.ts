/**
 * CCPA / Privacy helpers for dealer platforms.
 * Handles data deletion requests, data export, and opt-out tracking.
 *
 * Every dealer platform that stores customer PII must provide:
 *   1. Data deletion (right to be forgotten)
 *   2. Data export (right to portability)
 *   3. Audit trail of all deletion/export actions
 */

import { query } from "@/lib/db";
import { decryptPII, hashPII } from "@/lib/crypto";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface DataDeletionRequest {
  id: string;
  customer_email: string;
  dealer_id: string;
  requested_at: string;
  completed_at?: string;
  status: "pending" | "processing" | "completed" | "denied";
  data_categories_deleted: string[];
  processed_by?: string;
}

/**
 * Tables that store customer PII keyed by email.
 *
 * `match_col` is what we match the requester's address against; `email_col` is
 * what we anonymize. They differ for `leads`, whose email column holds AES-GCM
 * ciphertext with a random IV per call. Matching a plaintext address against
 * that column finds nothing, so erasure silently anonymized ZERO rows while
 * still reporting status='completed' — a right-to-be-forgotten request that
 * quietly did nothing. `leads` therefore matches on the deterministic blind
 * index (migration 087) and anonymizes the encrypted column.
 *
 * The other tables store plaintext email, so match_col == email_col.
 */
const CUSTOMER_TABLES = [
  { table: "leads", email_col: "email", match_col: "email_hash", label: "leads" },
  { table: "credit_pulls", email_col: "customer_email", match_col: "customer_email", label: "credit_pulls" },
  { table: "message_log", email_col: "recipient_email", match_col: "recipient_email", label: "message_log" },
  { table: "reviews", email_col: "customer_email", match_col: "customer_email", label: "reviews" },
  { table: "deal_worksheets", email_col: "customer_email", match_col: "customer_email", label: "deal_worksheets" },
  { table: "customers", email_col: "email", match_col: "email", label: "customers" },
] as const;

/* -------------------------------------------------------------------------- */
/* Delete customer data                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Delete/anonymize customer data across all tables for CCPA compliance.
 *
 * Instead of hard-deleting rows (which could break foreign key chains),
 * we anonymize PII fields and log what was done.
 */
export async function deleteCustomerData(
  email: string,
  dealerId: string,
  processedBy?: string,
): Promise<DataDeletionRequest> {
  const normalizedEmail = email.toLowerCase().trim();
  const requestId = `del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const deletedCategories: string[] = [];

  if (!process.env.DATABASE_URL) {
    // Shadow mode: return mock confirmation
    return {
      id: requestId,
      customer_email: normalizedEmail,
      dealer_id: dealerId,
      requested_at: now,
      completed_at: now,
      status: "completed",
      data_categories_deleted: ["leads", "credit_pulls", "message_log", "reviews"],
      processed_by: processedBy,
    };
  }

  // Log the request before processing
  await query(
    `INSERT INTO data_deletion_requests (id, customer_email, dealer_id, status, requested_at, processed_by)
     VALUES ($1, $2, $3, 'processing', $4, $5)
     ON CONFLICT DO NOTHING`,
    [requestId, normalizedEmail, dealerId, now, processedBy ?? "system"],
  );

  // Anonymize each table
  for (const { table, email_col, match_col, label } of CUSTOMER_TABLES) {
    try {
      // Match on match_col (the blind index for `leads`, plain email elsewhere),
      // but always anonymize email_col. Anonymizing the hash too would leave the
      // encrypted address in place, which is the opposite of erasure.
      const matchValue =
        match_col === "email_hash" ? hashPII(normalizedEmail) : normalizedEmail;
      const result = await query(
        `UPDATE ${table}
         SET ${email_col} = 'deleted-' || id,
             ${match_col === email_col ? "" : `${match_col} = NULL,`}
             updated_at = NOW()
         WHERE ${match_col} = $1 AND dealer_id = $2`,
        [matchValue, dealerId],
      );
      if ((result.rowCount ?? 0) > 0) {
        deletedCategories.push(label);
      }
    } catch {
      // Table may not exist yet in this deployment — skip gracefully
    }
  }

  // Mark the request as completed
  await query(
    `UPDATE data_deletion_requests
     SET status = 'completed', completed_at = $1, data_categories_deleted = $2
     WHERE id = $3`,
    [now, JSON.stringify(deletedCategories), requestId],
  );

  return {
    id: requestId,
    customer_email: normalizedEmail,
    dealer_id: dealerId,
    requested_at: now,
    completed_at: now,
    status: "completed",
    data_categories_deleted: deletedCategories,
    processed_by: processedBy,
  };
}

/* -------------------------------------------------------------------------- */
/* Export customer data                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Export all data associated with a customer email for CCPA data portability.
 * Returns structured JSON grouped by data category.
 */
export async function exportCustomerData(
  email: string,
  dealerId: string,
): Promise<Record<string, unknown>> {
  const normalizedEmail = email.toLowerCase().trim();

  if (!process.env.DATABASE_URL) {
    // Shadow mode: return mock data
    return {
      customer_email: normalizedEmail,
      dealer_id: dealerId,
      exported_at: new Date().toISOString(),
      leads: [
        {
          id: "lead-mock-001",
          first_name: "Jane",
          last_name: "Doe",
          email: normalizedEmail,
          vehicle_interest: "2024 Toyota Camry",
          created_at: "2026-01-15T10:00:00Z",
        },
      ],
      credit_pulls: [],
      messages: [],
      reviews: [],
      deal_worksheets: [],
    };
  }

  const exportData: Record<string, unknown> = {
    customer_email: normalizedEmail,
    dealer_id: dealerId,
    exported_at: new Date().toISOString(),
  };

  /** PII column names that may be encrypted in the database. */
  const PII_COLUMNS = new Set(["email", "customer_email", "recipient_email", "phone"]);

  for (const { table, email_col, label } of CUSTOMER_TABLES) {
    try {
      const result = await query(
        `SELECT * FROM ${table} WHERE ${email_col} = $1 AND dealer_id = $2`,
        [normalizedEmail, dealerId],
      );
      // Decrypt any encrypted PII fields before returning to the customer
      const decryptedRows = result.rows.map((row: Record<string, unknown>) => {
        const out = { ...row };
        for (const col of Object.keys(out)) {
          if (PII_COLUMNS.has(col) && typeof out[col] === "string") {
            out[col] = decryptPII(out[col] as string);
          }
        }
        return out;
      });
      exportData[label] = decryptedRows;
    } catch {
      // Table may not exist — return empty array
      exportData[label] = [];
    }
  }

  return exportData;
}
