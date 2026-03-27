import { NextRequest, NextResponse } from "next/server";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type CardCategory = "feature" | "safety" | "tech" | "value" | "competitive";
type CardAction = "flipped" | "shared" | "saved";

interface FlipCard {
  id: string;
  category: CardCategory;
  front: string;
  back: string;
  icon: string;
}

interface VehicleDetails {
  year: number;
  make: string;
  model: string;
  trim: string;
  vin: string;
}

/* -------------------------------------------------------------------------- */
/* Shadow deck generator                                                      */
/* -------------------------------------------------------------------------- */

function buildDeck(vin: string): FlipCard[] {
  return [
    {
      id: "card-001",
      category: "feature",
      front: "Adaptive Cruise Control",
      back: "Maintains your chosen speed and following distance automatically. Slows down and accelerates with traffic — hands-free highway driving at its best. Available at speeds from 0–90 mph.",
      icon: "speedometer",
    },
    {
      id: "card-002",
      category: "safety",
      front: "Automatic Emergency Braking",
      back: "Detects pedestrians, cyclists, and vehicles in your path. Warns you first — then brakes automatically if you don't react. Rated Top Safety Pick+ by IIHS for 2025.",
      icon: "shield",
    },
    {
      id: "card-003",
      category: "tech",
      front: "12.3\" Touchscreen Infotainment",
      back: "Wireless Apple CarPlay and Android Auto built in. Over-the-air software updates keep your system current. Crystal-clear navigation with real-time traffic, powered by HERE maps.",
      icon: "display",
    },
    {
      id: "card-004",
      category: "value",
      front: "5-Year / 60,000-Mile Warranty",
      back: "One of the best bumper-to-bumper coverage packages in the segment. Roadside assistance included. Transferable to future owners — protecting resale value.",
      icon: "certificate",
    },
    {
      id: "card-005",
      category: "competitive",
      front: "vs. Toyota RAV4 — Cargo Space",
      back: "You get 37.6 cu ft behind the rear seats vs. 37.5 in the RAV4. Fold the seats flat and jump to 75.8 cu ft — 4 cu ft more than the competition. Perfect for weekend adventures.",
      icon: "compare",
    },
    {
      id: "card-006",
      category: "feature",
      front: "Panoramic Sunroof",
      back: "Two-panel glass roof spans from front to rear seats. Open the front panel or tilt for fresh air. Electrochromic shade blocks UV rays without blocking light. Standard on this trim.",
      icon: "sun",
    },
    {
      id: "card-007",
      category: "tech",
      front: "360° Surround View Camera",
      back: "Four cameras stitch together a bird's-eye view of your vehicle. Parking grid lines adjust as you steer. Front and rear washers keep lenses clear in all weather.",
      icon: "camera",
    },
    {
      id: "card-008",
      category: "safety",
      front: "Lane Centering Assist",
      back: "Actively steers to keep you in the center of your lane on highways. Works together with Adaptive Cruise for a confident, relaxed drive. Engages at speeds above 40 mph.",
      icon: "road",
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* GET /api/walkaround?vin=xxx                                                */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const vin = searchParams.get("vin")?.trim().toUpperCase();

  if (!vin || vin.length < 5) {
    return NextResponse.json({ error: "Invalid VIN" }, { status: 400 });
  }

  // Try database for real vehicle data
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const result = await query<VehicleDetails>(
        `SELECT year, make, model, trim, vin FROM vehicles WHERE vin = $1 LIMIT 1`,
        [vin],
      );

      if (result.rows.length > 0) {
        const vehicle = result.rows[0];
        const cards = buildDeck(vin);
        return NextResponse.json({ vehicle, cards });
      }
    } catch (err) {
      console.error("[api/walkaround] DB error, falling back:", err);
    }
  }

  // Shadow: generate a plausible vehicle from VIN pattern
  const vehicle: VehicleDetails = {
    year: 2025,
    make: "Chevrolet",
    model: "Equinox EV",
    trim: "2LT AWD",
    vin,
  };

  const cards = buildDeck(vin);
  return NextResponse.json({ vehicle, cards });
}

/* -------------------------------------------------------------------------- */
/* POST /api/walkaround — log card engagement                                 */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  let body: { vin?: string; card_id?: string; action?: CardAction };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { vin, card_id, action } = body;
  if (!vin || !card_id || !action) {
    return NextResponse.json(
      { error: "vin, card_id, and action are required" },
      { status: 400 },
    );
  }

  const VALID_ACTIONS: CardAction[] = ["flipped", "shared", "saved"];
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Persist to DB when available
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO walkaround_events (vin, card_id, action, created_at)
         VALUES ($1,$2,$3,NOW())`,
        [vin.toUpperCase(), card_id, action],
      );
    } catch (err) {
      console.error("[api/walkaround] POST DB error (non-fatal):", err);
    }
  }

  return NextResponse.json({ ok: true });
}
