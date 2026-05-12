/**
 * Plaid BYO income verification for a prequal session.
 *
 *   POST /api/admin/prequal/[id]/plaid-income
 *     -- with body { action: "link" }
 *         -> mint a Plaid Link token using the dealer's own credentials
 *     -- with body { action: "verify", public_token: string }
 *         -> exchange the public_token + pull income, persist + audit
 *
 * Stream B (migration 070) -- depends on Stream A's
 * `dealer_external_credentials` table (migration 069) for the dealer's Plaid
 * client_id + secret. Honest about missing SDK: returns a clearly-labeled
 * mock IncomeResult when the `plaid` npm package isn't present (current
 * state of this repo).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { auditLog } from "@/lib/audit-log";
import { trackPrequal } from "@/lib/analytics-hooks";
import {
  buildPlaidByoClient,
  runByoIncomeVerification,
} from "@/lib/prequal/plaid-byo-client";
import { recordIncome, getSession } from "@/lib/prequal/session-store";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);
  const { id: prequalId } = await ctx.params;

  if (!prequalId) {
    return NextResponse.json({ error: "Missing prequal id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? (body.action as string) : "";
  if (action !== "link" && action !== "verify") {
    return NextResponse.json(
      { error: "action must be 'link' or 'verify'" },
      { status: 400 },
    );
  }

  /* -------- link: mint a Link token -------- */
  if (action === "link") {
    const client = await buildPlaidByoClient(dealerId);
    if (!client.ok) {
      try {
        trackPrequal("prequal.plaid_byo_income_failed", dealerId, {
          prequal_id: prequalId,
          reason: client.error.kind,
          phase: "link",
        });
      } catch {
        /* analytics never blocks */
      }
      const status = client.error.kind === "missing_credentials" ? 422 : 500;
      return NextResponse.json(
        { error: client.error.message, hint: client.error.hint },
        { status },
      );
    }
    const link = await client.value.createLinkToken(prequalId);
    if (!link.ok) {
      return NextResponse.json(
        { error: link.error.message, hint: link.error.hint },
        { status: 500 },
      );
    }
    return NextResponse.json({
      link_token: link.value.linkToken,
      expires_at: link.value.expiresAt,
      is_mock: link.value.isMock,
    });
  }

  /* -------- verify: exchange + pull -------- */
  const publicToken =
    typeof body.public_token === "string" ? (body.public_token as string) : "";
  if (!publicToken.trim()) {
    return NextResponse.json(
      { error: "public_token is required for action=verify" },
      { status: 400 },
    );
  }

  // Confirm the prequal belongs to this dealer before doing anything else.
  if (process.env.DATABASE_URL) {
    try {
      const session = await getSession(prequalId);
      if (!session) {
        return NextResponse.json({ error: "Prequal not found" }, { status: 404 });
      }
      if (session.dealer_id !== dealerId) {
        return NextResponse.json({ error: "Prequal not found" }, { status: 404 });
      }
    } catch (err) {
      console.error("[plaid-income] session lookup failed:", err);
      return NextResponse.json({ error: "Failed to load prequal" }, { status: 500 });
    }
  }

  const verifyResult = await runByoIncomeVerification(
    dealerId,
    prequalId,
    publicToken,
  );

  if (!verifyResult.ok) {
    const status = verifyResult.error.kind === "missing_credentials" ? 422 : 500;
    return NextResponse.json(
      { error: verifyResult.error.message, hint: verifyResult.error.hint },
      { status },
    );
  }

  // Persist via existing session-store (encrypts access_token + writes plaid_links).
  if (process.env.DATABASE_URL) {
    try {
      await recordIncome(prequalId, dealerId, {
        incomeMonthlyCents: verifyResult.value.incomeMonthlyCents,
        confidence: verifyResult.value.confidence,
        itemId: verifyResult.value.itemId,
        accessToken: verifyResult.value.accessToken,
        isMock: verifyResult.value.isMock,
      });
    } catch (err) {
      console.error("[plaid-income] recordIncome failed:", err);
    }
  }

  void auditLog(
    "prequal.plaid_byo.income_pulled",
    {
      prequal_id: prequalId,
      is_mock: verifyResult.value.isMock,
      confidence: verifyResult.value.confidence,
    },
    authResult.user.id,
    dealerId,
  );

  return NextResponse.json({
    income_monthly_cents: verifyResult.value.incomeMonthlyCents,
    confidence: verifyResult.value.confidence,
    is_mock: verifyResult.value.isMock,
    item_id: verifyResult.value.itemId ?? null,
  });
}
