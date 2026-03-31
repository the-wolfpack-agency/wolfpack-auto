import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { getABTestResults, createABTest, type ABTest } from "@/lib/ab-testing";
import { trackSystem } from "@/lib/analytics-hooks";

/**
 * GET /api/admin/analytics/ab-tests
 *
 * List all active A/B tests with variant distribution and conversion rates.
 * Requires authentication.
 */
export async function GET() {
  const auth = await requireAuth();
  if (!isAuthenticated(auth)) return auth;

  const dealerId = getDealerId(auth);

  try {
    const results = await getABTestResults(dealerId);

    trackSystem("system.analytics_queried", dealerId, {
      query_type: "ab_tests",
      result_count: results.length,
    });

    return NextResponse.json({
      tests: results,
      count: results.length,
    });
  } catch (err) {
    console.error("[ab-tests] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to retrieve A/B test results" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/analytics/ab-tests
 *
 * Create a new A/B test.
 * Body: { name: string, variants: string[], target_metric: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!isAuthenticated(auth)) return auth;

  const dealerId = getDealerId(auth);

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'name' field" },
        { status: 400 },
      );
    }
    if (
      !Array.isArray(body.variants) ||
      body.variants.length < 2 ||
      !body.variants.every((v: unknown) => typeof v === "string")
    ) {
      return NextResponse.json(
        { error: "'variants' must be an array of at least 2 strings" },
        { status: 400 },
      );
    }
    if (!body.target_metric || typeof body.target_metric !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'target_metric' field" },
        { status: 400 },
      );
    }

    const test: ABTest = {
      name: body.name,
      variants: body.variants,
      target_metric: body.target_metric,
      created_at: new Date().toISOString(),
      status: "active",
    };

    const result = await createABTest(dealerId, test);

    trackSystem("system.change_recorded", dealerId, {
      change_type: "ab_test_created",
      test_name: test.name,
      variant_count: test.variants.length,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[ab-tests] POST failed:", err);
    return NextResponse.json(
      { error: "Failed to create A/B test" },
      { status: 500 },
    );
  }
}
