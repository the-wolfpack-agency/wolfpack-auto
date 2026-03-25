import { NextRequest, NextResponse } from "next/server";
import { getTestResults } from "@/lib/ab-testing";

/**
 * GET /api/ab/results?test=hero-cta
 *
 * Returns aggregated A/B test results with statistical confidence.
 * Intended for admin dashboard consumption.
 */
export async function GET(request: NextRequest) {
  const testName = request.nextUrl.searchParams.get("test");

  if (!testName) {
    return NextResponse.json(
      { error: "Missing required query parameter: test" },
      { status: 400 },
    );
  }

  const results = await getTestResults(testName);

  return NextResponse.json(results, { status: 200 });
}
