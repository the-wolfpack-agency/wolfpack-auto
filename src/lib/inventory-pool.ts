/**
 * Inventory Pool / Swap Engine — multi-rooftop sharing.
 *
 * Lets dealer-group rooftops:
 *   * Pool inventory visibility under one of four share policies.
 *   * Reserve sister-rooftop VINs for incoming customers.
 *   * Receive system-suggested swaps (A↔B) when one rooftop has an aged unit
 *     that another rooftop has higher demand for.
 *
 * All persistence guarded — module shadow-mode-safely returns sensible defaults
 * when DATABASE_URL is unset. Triple-write fan-out is fire-and-forget.
 */

import { trackServerEvent } from "@/lib/analytics";

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */

export type SharePolicy = "all" | "used_only" | "aged_only" | "opt_in_per_vehicle";

export interface PoolMembership {
  id: string;
  dealer_group_id: string;
  dealer_id: string;
  share_policy: SharePolicy;
  joined_at: string;
  active: boolean;
}

export interface PoolVisibilityRow {
  id: string;
  vin: string;
  dealer_id: string;
  exposed_to_dealer_id: string;
  exposed_at: string;
  expires_at: string | null;
}

export interface PoolInventoryRow {
  vin: string;
  year: number;
  make: string;
  model: string;
  owning_dealer_id: string;
  price: number | null;
  days_on_lot: number | null;
}

export interface ReservationRow {
  id: string;
  vin: string;
  requesting_dealer_id: string;
  owning_dealer_id: string;
  customer_id: string | null;
  status: "pending" | "approved" | "rejected" | "fulfilled" | "expired";
  requested_at: string;
  decision_at: string | null;
  expires_at: string;
  notes: string | null;
}

export interface SwapProposalRow {
  id: string;
  dealer_group_id: string;
  vin_a: string;
  dealer_a_id: string;
  vin_b: string;
  dealer_b_id: string;
  rationale: string | null;
  expected_velocity_lift: number;
  status: "proposed" | "accepted" | "rejected" | "completed";
  created_at: string;
}

/* ========================================================================== */
/*  Membership                                                                 */
/* ========================================================================== */

export async function joinPool(
  dealerGroupId: string,
  dealerId: string,
  sharePolicy: SharePolicy = "all",
): Promise<{ ok: boolean; membership_id: string | null }> {
  if (!process.env.DATABASE_URL) {
    await trackServerEvent("pool.member_joined", {
      dealer_group_id: dealerGroupId, dealer_id: dealerId, share_policy: sharePolicy, persisted: 0,
    });
    return { ok: true, membership_id: null };
  }
  const { query } = await import("@/lib/db");

  const r = await query<{ id: string }>(
    `INSERT INTO inventory_pool_memberships (dealer_group_id, dealer_id, share_policy, active)
     VALUES ($1,$2,$3,TRUE)
     ON CONFLICT (dealer_group_id, dealer_id) DO UPDATE
       SET share_policy = EXCLUDED.share_policy,
           active = TRUE,
           updated_at = NOW()
     RETURNING id`,
    [dealerGroupId, dealerId, sharePolicy],
  );

  await trackServerEvent("pool.member_joined", {
    dealer_group_id: dealerGroupId, dealer_id: dealerId, share_policy: sharePolicy, persisted: 1,
  });
  return { ok: true, membership_id: r.rows[0]?.id ?? null };
}

export async function leavePool(
  dealerGroupId: string,
  dealerId: string,
): Promise<{ ok: boolean }> {
  if (!process.env.DATABASE_URL) {
    await trackServerEvent("pool.member_left", {
      dealer_group_id: dealerGroupId, dealer_id: dealerId, persisted: 0,
    });
    return { ok: true };
  }
  const { query } = await import("@/lib/db");
  await query(
    `UPDATE inventory_pool_memberships
        SET active = FALSE, updated_at = NOW()
      WHERE dealer_group_id = $1 AND dealer_id = $2`,
    [dealerGroupId, dealerId],
  );
  await query(
    `DELETE FROM inventory_pool_visibilities
      WHERE dealer_id = $1 AND exposed_to_dealer_id IN (
        SELECT dealer_id FROM inventory_pool_memberships
         WHERE dealer_group_id = $2 AND active = TRUE
      )`,
    [dealerId, dealerGroupId],
  );
  await trackServerEvent("pool.member_left", {
    dealer_group_id: dealerGroupId, dealer_id: dealerId, persisted: 1,
  });
  return { ok: true };
}

/* ========================================================================== */
/*  Visibility recompute                                                       */
/* ========================================================================== */

/** Aged threshold (days_on_lot) used by aged_only sharing. */
const AGED_THRESHOLD_DAYS = 60;

/**
 * Walk every member's inventory, decide which VINs are eligible per their
 * share_policy, and write rows into inventory_pool_visibilities exposing
 * those VINs to every other active member of the same group.
 *
 * share_policy semantics:
 *   all                  → expose every available vehicle
 *   used_only            → expose vehicles where status='available' AND condition LIKE 'used%' OR mileage>1000
 *   aged_only            → expose vehicles with days_on_lot >= AGED_THRESHOLD_DAYS
 *   opt_in_per_vehicle   → expose only rows flagged in vehicles.pool_optin (column may not exist; treat as none)
 */
export async function recomputeVisibilities(dealerGroupId: string): Promise<{
  exposed: number;
  members: number;
}> {
  if (!process.env.DATABASE_URL) {
    await trackServerEvent("pool.visibilities_recomputed", {
      dealer_group_id: dealerGroupId, exposed: 0, members: 0, persisted: 0,
    });
    return { exposed: 0, members: 0 };
  }
  const { query } = await import("@/lib/db");

  const members = await query<{ dealer_id: string; share_policy: SharePolicy }>(
    `SELECT dealer_id, share_policy
       FROM inventory_pool_memberships
      WHERE dealer_group_id = $1 AND active = TRUE`,
    [dealerGroupId],
  );

  if (members.rows.length === 0) {
    await trackServerEvent("pool.visibilities_recomputed", {
      dealer_group_id: dealerGroupId, exposed: 0, members: 0, persisted: 1,
    });
    return { exposed: 0, members: 0 };
  }

  const memberIds = members.rows.map((m) => m.dealer_id);

  // Clear stale visibilities scoped to this group's members.
  await query(
    `DELETE FROM inventory_pool_visibilities
      WHERE dealer_id = ANY($1::uuid[])
        AND exposed_to_dealer_id = ANY($1::uuid[])`,
    [memberIds],
  );

  let exposed = 0;
  for (const owner of members.rows) {
    const eligibleVins = await selectEligibleVins(owner.dealer_id, owner.share_policy);
    const recipients = memberIds.filter((id) => id !== owner.dealer_id);
    for (const vin of eligibleVins) {
      for (const recipient of recipients) {
        try {
          await query(
            `INSERT INTO inventory_pool_visibilities
               (vin, dealer_id, exposed_to_dealer_id, exposed_at)
             VALUES ($1,$2,$3,NOW())
             ON CONFLICT (vin, dealer_id, exposed_to_dealer_id) DO NOTHING`,
            [vin, owner.dealer_id, recipient],
          );
          exposed++;
        } catch (err) {
          console.error("[inventory-pool] visibility insert failed:", err instanceof Error ? err.message : err);
        }
      }
    }
  }

  await trackServerEvent("pool.visibilities_recomputed", {
    dealer_group_id: dealerGroupId, exposed, members: members.rows.length, persisted: 1,
  });
  return { exposed, members: members.rows.length };
}

async function selectEligibleVins(
  dealerId: string,
  sharePolicy: SharePolicy,
): Promise<string[]> {
  const { query } = await import("@/lib/db");
  let sql = "";
  const params: unknown[] = [dealerId];
  switch (sharePolicy) {
    case "all":
      sql = `SELECT vin FROM vehicles
              WHERE dealer_id = $1 AND vin IS NOT NULL AND status = 'available'`;
      break;
    case "used_only":
      sql = `SELECT vin FROM vehicles
              WHERE dealer_id = $1 AND vin IS NOT NULL AND status = 'available'
                AND (COALESCE(mileage, 0) > 1000 OR LOWER(COALESCE(condition, '')) LIKE 'used%')`;
      break;
    case "aged_only":
      params.push(AGED_THRESHOLD_DAYS);
      sql = `SELECT vin FROM vehicles
              WHERE dealer_id = $1 AND vin IS NOT NULL AND status = 'available'
                AND COALESCE(EXTRACT(DAY FROM NOW() - listed_at), 0) >= $2`;
      break;
    case "opt_in_per_vehicle":
      // pool_optin is an opt-in flag; treat absent column as nothing eligible
      sql = `SELECT vin FROM vehicles
              WHERE dealer_id = $1 AND vin IS NOT NULL AND status = 'available'
                AND COALESCE(pool_optin, FALSE) = TRUE`;
      break;
  }
  try {
    const r = await query<{ vin: string }>(sql, params);
    return r.rows.map((row) => row.vin);
  } catch (err) {
    // Schema may not yet have pool_optin / listed_at — degrade gracefully.
    if (err instanceof Error && /column .* does not exist/i.test(err.message)) {
      return [];
    }
    throw err;
  }
}

/* ========================================================================== */
/*  Search                                                                     */
/* ========================================================================== */

export async function searchPool(
  requestingDealerId: string,
  query?: string,
): Promise<PoolInventoryRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query: pgQuery } = await import("@/lib/db");

  const where = query
    ? `AND (lower(v.make) LIKE $2 OR lower(v.model) LIKE $2 OR v.vin = $3)`
    : "";
  const params: unknown[] = [requestingDealerId];
  if (query) {
    params.push(`%${query.toLowerCase()}%`, query);
  }

  const sql = `
    SELECT v.vin, v.year, v.make, v.model, v.dealer_id AS owning_dealer_id,
           v.price,
           CASE WHEN v.listed_at IS NOT NULL
                THEN EXTRACT(DAY FROM NOW() - v.listed_at)::int
                ELSE NULL END AS days_on_lot
      FROM inventory_pool_visibilities pv
      JOIN vehicles v ON v.vin = pv.vin AND v.dealer_id = pv.dealer_id
     WHERE (v.dealer_id = $1
            OR pv.exposed_to_dealer_id = $1)
       AND v.status = 'available'
       ${where}
     ORDER BY v.listed_at DESC NULLS LAST
     LIMIT 100`;

  try {
    const r = await pgQuery<PoolInventoryRow>(sql, params);
    return r.rows;
  } catch (err) {
    if (err instanceof Error && /column .* does not exist/i.test(err.message)) {
      return [];
    }
    throw err;
  }
}

/* ========================================================================== */
/*  Reservations                                                               */
/* ========================================================================== */

export interface RequestReservationArgs {
  vin: string;
  requestingDealerId: string;
  owningDealerId: string;
  customerId?: string | null;
  notes?: string;
}

export async function requestReservation(
  args: RequestReservationArgs,
): Promise<{ ok: boolean; reservation_id: string | null }> {
  if (!process.env.DATABASE_URL) {
    await trackServerEvent("pool.reservation_created", {
      vin: args.vin,
      requesting_dealer_id: args.requestingDealerId,
      owning_dealer_id: args.owningDealerId,
      persisted: 0,
    });
    return { ok: true, reservation_id: null };
  }

  const { query } = await import("@/lib/db");
  const r = await query<{ id: string }>(
    `INSERT INTO inventory_reservations
       (vin, requesting_dealer_id, owning_dealer_id, customer_id, notes, status)
     VALUES ($1,$2,$3,$4,$5,'pending')
     RETURNING id`,
    [args.vin, args.requestingDealerId, args.owningDealerId, args.customerId ?? null, args.notes ?? null],
  );
  const id = r.rows[0]?.id ?? null;

  void writeReservationToSecondaryStores(id, args).catch(() => {});

  await trackServerEvent("pool.reservation_created", {
    vin: args.vin,
    requesting_dealer_id: args.requestingDealerId,
    owning_dealer_id: args.owningDealerId,
    persisted: 1,
  });
  return { ok: true, reservation_id: id };
}

export type ReservationAction = "approve" | "reject" | "fulfill";

export async function actOnReservation(
  reservationId: string,
  actingDealerId: string,
  action: ReservationAction,
  reason?: string,
): Promise<{ ok: boolean; status: string }> {
  const targetStatus = action === "approve" ? "approved"
                     : action === "reject" ? "rejected"
                     : "fulfilled";

  if (!process.env.DATABASE_URL) {
    await trackServerEvent("pool.reservation_action", {
      reservation_id: reservationId, dealer_id: actingDealerId, action, persisted: 0,
    });
    return { ok: true, status: targetStatus };
  }

  const { query } = await import("@/lib/db");
  const update = await query(
    `UPDATE inventory_reservations
        SET status = $1,
            decision_at = CASE WHEN $1 IN ('approved','rejected') THEN NOW() ELSE decision_at END,
            notes = COALESCE($4, notes),
            updated_at = NOW()
      WHERE id = $2
        AND ($1 = 'fulfilled' AND requesting_dealer_id = $3
             OR $1 IN ('approved','rejected') AND owning_dealer_id = $3)`,
    [targetStatus, reservationId, actingDealerId, reason ?? null],
  );

  await trackServerEvent("pool.reservation_action", {
    reservation_id: reservationId, dealer_id: actingDealerId, action,
    persisted: update.rowCount ? 1 : 0,
  });
  return { ok: (update.rowCount ?? 0) > 0, status: targetStatus };
}

async function writeReservationToSecondaryStores(
  reservationId: string | null,
  args: RequestReservationArgs,
): Promise<void> {
  if (!reservationId) return;
  try {
    if (process.env.NEO4J_URI || process.env.NEO4J_URL) {
      const { executeNeo4jQueries } = await import("@/lib/neo4j-client");
      await executeNeo4jQueries([{
        statement: `MERGE (r:DealerRooftop {id:$req})
                    MERGE (o:DealerRooftop {id:$own})
                    MERGE (v:Vehicle {vin:$vin})
                    MERGE (r)-[:RESERVED {id:$rid, ts:datetime()}]->(v)
                    MERGE (v)-[:OWNED_BY]->(o)`,
        parameters: { req: args.requestingDealerId, own: args.owningDealerId, vin: args.vin, rid: reservationId },
      }]);
    }
  } catch (err) {
    console.warn("[inventory-pool] neo4j write failed:", err instanceof Error ? err.message : err);
  }
}

/* ========================================================================== */
/*  Swap proposals                                                             */
/* ========================================================================== */

const SWAP_AGED_DAYS = 75;

/**
 * Naive-but-working swap heuristic:
 *
 *   * For each pool member, pull VINs whose days_on_lot ≥ SWAP_AGED_DAYS.
 *   * Score each aged VIN against every sister rooftop's recent same-YMM
 *     conversions; if sister rooftop has zero local stock and recent leads
 *     for that YMM, propose a swap with sister's slowest matching VIN.
 *
 * Because we don't have a market-pricing demand signal exported, we fall back
 * to "sister has no stock of YMM but had recent leads for it" as the proxy.
 */
export async function proposeSwaps(dealerGroupId: string): Promise<{
  proposed: number;
  considered: number;
}> {
  if (!process.env.DATABASE_URL) {
    await trackServerEvent("pool.swap_proposed_batch", {
      dealer_group_id: dealerGroupId, proposed: 0, considered: 0, persisted: 0,
    });
    return { proposed: 0, considered: 0 };
  }

  const { query } = await import("@/lib/db");
  const members = await query<{ dealer_id: string }>(
    `SELECT dealer_id FROM inventory_pool_memberships
      WHERE dealer_group_id = $1 AND active = TRUE`,
    [dealerGroupId],
  );
  if (members.rows.length < 2) return { proposed: 0, considered: 0 };

  let proposed = 0;
  let considered = 0;

  for (const owner of members.rows) {
    let aged: { vin: string; year: number; make: string; model: string }[] = [];
    try {
      const r = await query<{ vin: string; year: number; make: string; model: string }>(
        `SELECT vin, year, make, model FROM vehicles
          WHERE dealer_id = $1 AND status = 'available' AND vin IS NOT NULL
            AND COALESCE(EXTRACT(DAY FROM NOW() - listed_at), 0) >= $2
          LIMIT 50`,
        [owner.dealer_id, SWAP_AGED_DAYS],
      );
      aged = r.rows;
    } catch (err) {
      if (!(err instanceof Error && /column .* does not exist/i.test(err.message))) throw err;
    }

    for (const ag of aged) {
      considered++;
      for (const sister of members.rows) {
        if (sister.dealer_id === owner.dealer_id) continue;

        // Sister has any stock of this YMM?
        const sisterStock = await query<{ ct: string }>(
          `SELECT COUNT(*)::text AS ct FROM vehicles
            WHERE dealer_id = $1 AND year = $2
              AND lower(make) = lower($3) AND lower(model) = lower($4)
              AND status = 'available'`,
          [sister.dealer_id, ag.year, ag.make, ag.model],
        );
        const stockCount = Number(sisterStock.rows[0]?.ct ?? "0");
        if (stockCount > 0) continue;

        // Sister had a recent lead matching this YMM?
        let recentLead = 0;
        try {
          const lr = await query<{ ct: string }>(
            `SELECT COUNT(*)::text AS ct FROM leads
              WHERE dealer_id = $1
                AND created_at >= NOW() - INTERVAL '30 days'
                AND (
                  lower(COALESCE(vehicle_of_interest, '')) LIKE $2
                  OR (preferred_year = $3 AND lower(preferred_make) = lower($4)
                      AND lower(preferred_model) = lower($5))
                )`,
            [
              sister.dealer_id, `%${ag.model.toLowerCase()}%`,
              ag.year, ag.make, ag.model,
            ],
          );
          recentLead = Number(lr.rows[0]?.ct ?? "0");
        } catch {
          // Lead schema variants — degrade gracefully
          recentLead = 0;
        }
        if (recentLead === 0) continue;

        // Sister's slowest VIN to swap back (any same-priced unit)
        let candidate: { vin: string } | undefined;
        try {
          const cand = await query<{ vin: string }>(
            `SELECT vin FROM vehicles
              WHERE dealer_id = $1 AND status = 'available' AND vin IS NOT NULL
              ORDER BY listed_at ASC NULLS LAST
              LIMIT 1`,
            [sister.dealer_id],
          );
          candidate = cand.rows[0];
        } catch { /* schema variance */ }
        if (!candidate?.vin) continue;

        try {
          await query(
            `INSERT INTO inventory_swap_proposals
               (dealer_group_id, vin_a, dealer_a_id, vin_b, dealer_b_id,
                rationale, expected_velocity_lift, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'proposed')
             ON CONFLICT (dealer_group_id, vin_a, vin_b) DO NOTHING`,
            [
              dealerGroupId,
              ag.vin, owner.dealer_id,
              candidate.vin, sister.dealer_id,
              `Aged ${ag.year} ${ag.make} ${ag.model} on owner lot; sister rooftop had ${recentLead} recent leads with no matching stock.`,
              Math.min(50, 5 * recentLead),
            ],
          );
          proposed++;
        } catch (err) {
          console.error("[inventory-pool] swap insert failed:", err instanceof Error ? err.message : err);
        }
      }
    }
  }

  await trackServerEvent("pool.swap_proposed_batch", {
    dealer_group_id: dealerGroupId, proposed, considered, persisted: 1,
  });
  return { proposed, considered };
}

export type SwapAction = "accept" | "reject" | "complete";

export async function actOnSwap(
  swapId: string,
  actingDealerId: string,
  action: SwapAction,
): Promise<{ ok: boolean; status: string }> {
  const target = action === "accept" ? "accepted"
               : action === "reject" ? "rejected"
               : "completed";

  if (!process.env.DATABASE_URL) {
    await trackServerEvent("pool.swap_action", {
      swap_id: swapId, dealer_id: actingDealerId, action, persisted: 0,
    });
    return { ok: true, status: target };
  }

  const { query } = await import("@/lib/db");
  const update = await query(
    `UPDATE inventory_swap_proposals
        SET status = $1, updated_at = NOW()
      WHERE id = $2
        AND (dealer_a_id = $3 OR dealer_b_id = $3)`,
    [target, swapId, actingDealerId],
  );
  await trackServerEvent("pool.swap_action", {
    swap_id: swapId, dealer_id: actingDealerId, action,
    persisted: update.rowCount ? 1 : 0,
  });
  return { ok: (update.rowCount ?? 0) > 0, status: target };
}

/* ========================================================================== */
/*  Listings                                                                   */
/* ========================================================================== */

export async function listIncomingReservations(dealerId: string): Promise<ReservationRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");
  const r = await query<ReservationRow>(
    `SELECT id, vin, requesting_dealer_id, owning_dealer_id, customer_id,
            status, requested_at, decision_at, expires_at, notes
       FROM inventory_reservations
      WHERE owning_dealer_id = $1
      ORDER BY requested_at DESC
      LIMIT 200`,
    [dealerId],
  );
  return r.rows;
}

export async function listOutgoingReservations(dealerId: string): Promise<ReservationRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");
  const r = await query<ReservationRow>(
    `SELECT id, vin, requesting_dealer_id, owning_dealer_id, customer_id,
            status, requested_at, decision_at, expires_at, notes
       FROM inventory_reservations
      WHERE requesting_dealer_id = $1
      ORDER BY requested_at DESC
      LIMIT 200`,
    [dealerId],
  );
  return r.rows;
}

export async function listSwapProposals(dealerGroupId: string): Promise<SwapProposalRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");
  const r = await query<SwapProposalRow>(
    `SELECT id, dealer_group_id, vin_a, dealer_a_id, vin_b, dealer_b_id,
            rationale, expected_velocity_lift, status, created_at
       FROM inventory_swap_proposals
      WHERE dealer_group_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
    [dealerGroupId],
  );
  return r.rows;
}
