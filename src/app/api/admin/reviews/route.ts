import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackReview } from "@/lib/analytics-hooks";
import { getDealerId } from "@/lib/get-dealer-id";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Review {
  id: string;
  platform: "google" | "yelp" | "facebook";
  reviewer_name: string;
  rating: number;
  text: string;
  date: string;
  responded: boolean;
  response_text: string | null;
  response_date: string | null;
  flagged: boolean;
}

/* -------------------------------------------------------------------------- */
/* Shadow / mock data                                                          */
/* -------------------------------------------------------------------------- */

const MOCK_REVIEWS: Review[] = [
  {
    id: "rev-001",
    platform: "google",
    reviewer_name: "Sarah J.",
    rating: 5,
    text: "Amazing experience buying my new Camry from Jake! He was patient, knowledgeable, and never pushy. The whole process from test drive to paperwork took only 3 hours. Highly recommend Wolfpack Auto to anyone looking for a great deal and honest service.",
    date: "2026-03-26",
    responded: true,
    response_text: "Thank you so much, Sarah! Jake truly enjoyed working with you. We hope you love your new Camry — don't hesitate to reach out if you ever need anything!",
    response_date: "2026-03-27",
    flagged: false,
  },
  {
    id: "rev-002",
    platform: "google",
    reviewer_name: "Michael C.",
    rating: 5,
    text: "Just picked up a brand new F-150 and couldn't be happier. Mike walked me through every option and helped me find exactly what I needed for towing. Finance was quick and painless too. This is my second purchase from Wolfpack and it won't be my last.",
    date: "2026-03-25",
    responded: false,
    response_text: null,
    response_date: null,
    flagged: false,
  },
  {
    id: "rev-003",
    platform: "yelp",
    reviewer_name: "Amanda T.",
    rating: 4,
    text: "Good overall experience. The salesperson was friendly and the inventory selection is great. Only giving 4 stars because I had to wait about 45 minutes in the finance office. Other than that, I'm very happy with my RAV4 purchase.",
    date: "2026-03-23",
    responded: true,
    response_text: "Hi Amanda, thank you for your feedback! We apologize for the wait in F&I — we're working on streamlining that process. Enjoy your RAV4!",
    response_date: "2026-03-24",
    flagged: false,
  },
  {
    id: "rev-004",
    platform: "facebook",
    reviewer_name: "David P.",
    rating: 5,
    text: "Tom Bradley is the best! No games, no pressure, just straightforward car buying the way it should be. Got a great price on a CR-V and they even detailed it before delivery. Will definitely send my friends here.",
    date: "2026-03-22",
    responded: false,
    response_text: null,
    response_date: null,
    flagged: false,
  },
  {
    id: "rev-005",
    platform: "google",
    reviewer_name: "Robert G.",
    rating: 3,
    text: "Decent dealership but the initial offer on my trade-in was way too low. After some negotiation we got to a fair number. The Equinox I bought is great but the sales process could be more transparent upfront. Not terrible, just not as smooth as it could be.",
    date: "2026-03-20",
    responded: false,
    response_text: null,
    response_date: null,
    flagged: false,
  },
  {
    id: "rev-006",
    platform: "yelp",
    reviewer_name: "Jennifer W.",
    rating: 5,
    text: "Came in for a test drive and ended up driving home in a beautiful Tucson! The staff was so welcoming and they made the entire process comfortable. Special thanks to Jake for going above and beyond. This is how car buying should be!",
    date: "2026-03-18",
    responded: true,
    response_text: "Jennifer, thank you for the wonderful review! Jake was thrilled to hear this. We hope you're loving the Tucson — see you at your first service visit!",
    response_date: "2026-03-19",
    flagged: false,
  },
  {
    id: "rev-007",
    platform: "facebook",
    reviewer_name: "Carlos M.",
    rating: 2,
    text: "Had an appointment to see a specific car that was listed online. When I arrived, they told me it had been sold the day before and tried to upsell me on something more expensive. Frustrating experience. They need better inventory tracking.",
    date: "2026-03-15",
    responded: false,
    response_text: null,
    response_date: null,
    flagged: true,
  },
  {
    id: "rev-008",
    platform: "google",
    reviewer_name: "Lisa B.",
    rating: 4,
    text: "Bought a Honda Accord and the car itself is perfect. Tom was great to work with. The only reason it's not 5 stars is the dealership was quite busy and it was hard to get attention when I first walked in. Once connected with Tom though, everything was smooth.",
    date: "2026-03-12",
    responded: false,
    response_text: null,
    response_date: null,
    flagged: false,
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/reviews                                                      */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");
  const rating = searchParams.get("rating");
  const responded = searchParams.get("responded");

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions = ["dealer_id = $1"];
      const params: unknown[] = [dealerId];
      let idx = 2;

      if (platform && ["google", "yelp", "facebook"].includes(platform)) {
        conditions.push(`platform = $${idx++}`);
        params.push(platform);
      }
      if (rating) {
        conditions.push(`rating = $${idx++}`);
        params.push(parseInt(rating));
      }
      if (responded === "true") {
        conditions.push(`responded = true`);
      } else if (responded === "false") {
        conditions.push(`responded = false`);
      }

      const result = await query(
        `SELECT * FROM reviews WHERE ${conditions.join(" AND ")} ORDER BY date DESC LIMIT 100`,
        params,
      );
      return NextResponse.json({ reviews: result.rows });
    } catch (err) {
      console.error("[api/admin/reviews] DB error:", err);
    }
  }

  // Shadow mode
  let filtered = [...MOCK_REVIEWS];
  if (platform) filtered = filtered.filter((r) => r.platform === platform);
  if (rating) filtered = filtered.filter((r) => r.rating === parseInt(rating));
  if (responded === "true") filtered = filtered.filter((r) => r.responded);
  if (responded === "false") filtered = filtered.filter((r) => !r.responded);

  return NextResponse.json({ reviews: filtered });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/reviews                                                     */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  let body: {
    platform: string;
    reviewer_name: string;
    rating: number;
    text: string;
    date?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.platform || !body.reviewer_name || !body.rating || !body.text) {
    return NextResponse.json(
      { error: "platform, reviewer_name, rating, and text are required" },
      { status: 400 },
    );
  }

  const newId = `rev-${Date.now()}`;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO reviews (id, dealer_id, platform, reviewer_name, rating, text, date, responded, flagged)
         VALUES ($1,$2,$3,$4,$5,$6,$7,false,false)`,
        [newId, dealerId, body.platform, body.reviewer_name, body.rating, body.text,
         body.date ?? new Date().toISOString().split("T")[0]],
      );
      try { trackReview("review.received", dealerId, { platform: body.platform, rating: body.rating }); } catch {}

      return NextResponse.json({ success: true, id: newId });
    } catch (err) {
      console.error("[api/admin/reviews] POST DB error:", err);
    }
  }

  try { trackReview("review.received", dealerId, { platform: body.platform, rating: body.rating }); } catch {}

  return NextResponse.json({ success: true, id: newId, mode: "shadow" });
}
