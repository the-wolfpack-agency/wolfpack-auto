import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackAccounting } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Mock transactions for shadow mode                                          */
/* -------------------------------------------------------------------------- */

const MOCK_TRANSACTIONS = [
  { date: "2026-03-25", account: "4000", description: "Vehicle Sale — 2024 Toyota Camry SE", debit: 0, credit: 28500, reference: "SALE-1042" },
  { date: "2026-03-25", account: "5000", description: "COGS — 2024 Toyota Camry SE", debit: 22800, credit: 0, reference: "SALE-1042" },
  { date: "2026-03-25", account: "1000", description: "Cash receipt — Toyota Camry sale", debit: 28500, credit: 0, reference: "SALE-1042" },
  { date: "2026-03-24", account: "4100", description: "F&I — GAP Insurance", debit: 0, credit: 895, reference: "FI-0387" },
  { date: "2026-03-24", account: "4100", description: "F&I — Extended Warranty", debit: 0, credit: 1450, reference: "FI-0388" },
  { date: "2026-03-24", account: "4000", description: "Vehicle Sale — 2023 Honda CR-V EX-L", debit: 0, credit: 32900, reference: "SALE-1041" },
  { date: "2026-03-24", account: "5000", description: "COGS — 2023 Honda CR-V EX-L", debit: 26800, credit: 0, reference: "SALE-1041" },
  { date: "2026-03-23", account: "4200", description: "Service — Oil change + tire rotation", debit: 0, credit: 189.95, reference: "RO-5621" },
  { date: "2026-03-23", account: "4300", description: "Parts — Brake pads (front)", debit: 0, credit: 124.50, reference: "PO-2847" },
  { date: "2026-03-23", account: "5100", description: "Floor Plan Interest — March batch", debit: 247.83, credit: 0, reference: "FP-INT-0326" },
  { date: "2026-03-22", account: "6000", description: "Sales Commission — J. Rodriguez", debit: 1425, credit: 0, reference: "COMM-0422" },
  { date: "2026-03-22", account: "6100", description: "Google Ads — March week 4", debit: 2150, credit: 0, reference: "MKT-0312" },
  { date: "2026-03-22", account: "4000", description: "Vehicle Sale — 2024 Ford F-150 XLT", debit: 0, credit: 42800, reference: "SALE-1040" },
  { date: "2026-03-22", account: "5000", description: "COGS — 2024 Ford F-150 XLT", debit: 36200, credit: 0, reference: "SALE-1040" },
  { date: "2026-03-21", account: "6200", description: "Rent — March 2026", debit: 8500, credit: 0, reference: "RENT-0326" },
  { date: "2026-03-21", account: "6300", description: "Utilities — March 2026", debit: 1875, credit: 0, reference: "UTIL-0326" },
];

/* -------------------------------------------------------------------------- */
/* Export formatters                                                           */
/* -------------------------------------------------------------------------- */

function toCSV(transactions: typeof MOCK_TRANSACTIONS): string {
  const header = "Date,Account,Description,Debit,Credit,Reference";
  const rows = transactions.map((t) =>
    `${t.date},${t.account},"${t.description}",${t.debit.toFixed(2)},${t.credit.toFixed(2)},${t.reference}`,
  );
  return [header, ...rows].join("\n");
}

function toIIF(transactions: typeof MOCK_TRANSACTIONS): string {
  // QuickBooks IIF format
  const lines: string[] = [];

  // Header
  lines.push("!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO");
  lines.push("!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO");
  lines.push("!ENDTRNS");

  // Group transactions by reference (each reference = one journal entry)
  const groups = new Map<string, typeof MOCK_TRANSACTIONS>();
  for (const t of transactions) {
    const existing = groups.get(t.reference) ?? [];
    existing.push(t);
    groups.set(t.reference, existing);
  }

  for (const [ref, txns] of groups) {
    const first = txns[0];
    const iifDate = first.date.replace(/-/g, "/");

    // First line is TRNS (the "header" side of the entry)
    const primaryAmount = first.debit > 0 ? -first.debit : first.credit;
    lines.push(`TRNS\tGENERAL JOURNAL\t${iifDate}\t${first.account}\t\t${primaryAmount.toFixed(2)}\t${first.description}`);

    // Remaining lines are SPL (splits)
    for (let i = 1; i < txns.length; i++) {
      const t = txns[i];
      const amount = t.debit > 0 ? -t.debit : t.credit;
      lines.push(`SPL\tGENERAL JOURNAL\t${iifDate}\t${t.account}\t\t${amount.toFixed(2)}\t${t.description}`);
    }

    // If only one transaction in the group, add a balancing split to the cash account
    if (txns.length === 1) {
      const balanceAmount = first.debit > 0 ? first.debit : -first.credit;
      lines.push(`SPL\tGENERAL JOURNAL\t${iifDate}\t1000\t\t${balanceAmount.toFixed(2)}\tBalancing entry — ${ref}`);
    }

    lines.push("ENDTRNS");
  }

  return lines.join("\n");
}

function toSage(transactions: typeof MOCK_TRANSACTIONS): string {
  // Sage 50 CSV import format
  const header = "Reference,Date,Account Ref,Details,Net Amount,Tax Code,Tax Amount";
  const rows = transactions.map((t) => {
    const net = t.debit > 0 ? -t.debit : t.credit;
    return `${t.reference},${t.date},${t.account},"${t.description}",${net.toFixed(2)},T1,0.00`;
  });
  return [header, ...rows].join("\n");
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/accounting/export                                          */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: { format?: string; date_from?: string; date_to?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const format = body.format ?? "csv";
  if (!["quickbooks", "sage", "csv", "iif"].includes(format)) {
    return NextResponse.json({ error: "format must be quickbooks, sage, csv, or iif" }, { status: 422 });
  }
  if (!body.date_from || !body.date_to) {
    return NextResponse.json({ error: "date_from and date_to are required" }, { status: 422 });
  }

  // Analytics (fire-and-forget)
  try {
    trackAccounting("accounting.exported", authResult.user.dealer_id, {
      format,
      date_from: body.date_from,
      date_to: body.date_to,
    });
  } catch { /* swallow */ }

  // Get transactions — DB or mock
  let transactions = MOCK_TRANSACTIONS;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT date::text, account, description, debit, credit, reference
         FROM gl_transactions
         WHERE dealer_id = $1 AND date >= $2 AND date <= $3
         ORDER BY date DESC, reference`,
        [authResult.user.dealer_id, body.date_from, body.date_to],
      );
      if ((result.rows as any[]).length > 0) {
        transactions = result.rows as typeof MOCK_TRANSACTIONS;
      }
    } catch (err) {
      console.error("[api/admin/accounting/export] DB error:", err);
      // Fall through to mock data
    }
  }

  // Filter mock data by date range
  const filtered = transactions.filter(
    (t) => t.date >= body.date_from! && t.date <= body.date_to!,
  );

  // Generate export
  let content: string;
  let contentType: string;
  let filename: string;

  const effectiveFormat = format === "quickbooks" ? "iif" : format;

  switch (effectiveFormat) {
    case "iif":
      content = toIIF(filtered);
      contentType = "text/plain";
      filename = `export-${body.date_from}-${body.date_to}.iif`;
      break;
    case "sage":
      content = toSage(filtered);
      contentType = "text/csv";
      filename = `export-${body.date_from}-${body.date_to}-sage.csv`;
      break;
    default:
      content = toCSV(filtered);
      contentType = "text/csv";
      filename = `export-${body.date_from}-${body.date_to}.csv`;
      break;
  }

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
