import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ResponseTemplate {
  id: string;
  name: string;
  category: "positive" | "neutral" | "recovery";
  text: string;
}

/* -------------------------------------------------------------------------- */
/* Shadow / mock data                                                          */
/* -------------------------------------------------------------------------- */

const MOCK_TEMPLATES: ResponseTemplate[] = [
  {
    id: "rtpl-001",
    name: "Positive — Thank You",
    category: "positive",
    text: "Thank you so much for the wonderful review, {reviewer_name}! We're thrilled you had a great experience with our team. Your kind words mean a lot to us and we look forward to seeing you again!",
  },
  {
    id: "rtpl-002",
    name: "Neutral — Acknowledge & Improve",
    category: "neutral",
    text: "Thank you for your feedback, {reviewer_name}. We appreciate you taking the time to share your experience. We're always looking for ways to improve and your comments help us do that. If there's anything we can do to make your next visit even better, please don't hesitate to reach out.",
  },
  {
    id: "rtpl-003",
    name: "Recovery — Address Concern",
    category: "recovery",
    text: "We're sorry to hear about your experience, {reviewer_name}. This doesn't reflect the level of service we strive to provide. We'd love the chance to make things right. Please contact our General Manager directly at (555) 100-2000 so we can address your concerns personally.",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/reviews/templates                                            */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT id, name, category, text FROM review_response_templates WHERE dealer_id = $1 ORDER BY name`,
        [dealerId],
      );
      return NextResponse.json({ templates: result.rows });
    } catch (err) {
      console.error("[api/admin/reviews/templates] DB error:", err);
    }
  }

  return NextResponse.json({ templates: MOCK_TEMPLATES });
}
