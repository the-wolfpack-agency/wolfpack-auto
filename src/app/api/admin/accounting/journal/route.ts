/**
 * GET  /api/admin/accounting/journal — List journal entries
 * POST /api/admin/accounting/journal — Create and post a journal entry
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackGL } from "@/lib/analytics-hooks";
import { validateJournalEntry, calculateEntryTotals, type JournalEntry } from "@/lib/general-ledger";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50") || 50, 200);
  const offset = parseInt(searchParams.get("offset") ?? "0") || 0;

  let entries: Record<string, unknown>[] = [];
  let total = 0;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const { rows: countRows } = await query(
        `SELECT COUNT(*) as total FROM journal_entries WHERE dealer_id = $1`,
        [dealerId],
      );
      total = Number(countRows[0]?.total) || 0;

      const { rows } = await query(
        `SELECT je.*, array_agg(json_build_object(
           'account_number', coa.account_number,
           'account_name', coa.name,
           'description', jel.description,
           'debit', jel.debit,
           'credit', jel.credit,
           'department', jel.department
         )) as lines
         FROM journal_entries je
         LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
         LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
         WHERE je.dealer_id = $1
         GROUP BY je.id
         ORDER BY je.entry_date DESC, je.created_at DESC
         LIMIT $2 OFFSET $3`,
        [dealerId, limit, offset],
      );
      entries = rows;
    } catch (err) {
      console.error("[api/accounting/journal] GET error:", err);
    }
  }

  return NextResponse.json({ entries, total, limit, offset });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let body: JournalEntry;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate the entry
  const validation = validateJournalEntry(body);
  if (!validation.valid) {
    return NextResponse.json({ error: "Validation failed", errors: validation.errors }, { status: 400 });
  }

  const totals = calculateEntryTotals(body.lines);

  // Save to DB
  let entryId: string | null = null;
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      // Insert journal entry
      const { rows } = await query(
        `INSERT INTO journal_entries
           (dealer_id, entry_date, description, memo, source_type, source_id,
            total_debits, total_credits, status, posted_by, posted_at)
         VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, $8, 'posted', $9::uuid, now())
         RETURNING id`,
        [
          dealerId, body.entry_date, body.description, body.memo ?? "",
          body.source_type, body.source_id ?? null,
          totals.total_debits, totals.total_credits,
          authResult.user.id,
        ],
      );
      entryId = rows[0]?.id;

      // Insert lines
      if (entryId) {
        for (const line of body.lines) {
          await query(
            `INSERT INTO journal_entry_lines
               (dealer_id, journal_entry_id, account_id, description, debit, credit, department)
             SELECT $1, $2::uuid, id, $4, $5, $6, $7
             FROM chart_of_accounts
             WHERE dealer_id = $1 AND account_number = $3
             LIMIT 1`,
            [dealerId, entryId, line.account_number, line.description, line.debit, line.credit, line.department ?? null],
          );
        }

        // Update running balances on affected accounts
        for (const line of body.lines) {
          const netAmount = line.debit - line.credit;
          await query(
            `UPDATE chart_of_accounts
             SET current_balance = current_balance + $1
             WHERE dealer_id = $2 AND account_number = $3`,
            [netAmount, dealerId, line.account_number],
          );
        }
      }
    } catch (err) {
      console.error("[api/accounting/journal] POST error:", err);
      return NextResponse.json({ error: "Failed to post journal entry" }, { status: 500 });
    }
  }

  trackGL("gl.journal_posted", dealerId, {
    entry_id: entryId ?? "",
    source_type: body.source_type,
    total_debits: totals.total_debits,
    total_credits: totals.total_credits,
    line_count: body.lines.length,
  });

  return NextResponse.json({
    id: entryId,
    status: "posted",
    total_debits: totals.total_debits,
    total_credits: totals.total_credits,
    is_balanced: totals.is_balanced,
    line_count: body.lines.length,
  });
}
