/**
 * Tests for POST /api/csp-report (Wolfpack Auto)
 *
 * Asserts:
 *   - Valid report writes analytics event and returns 204
 *   - Malformed payload returns 400
 *   - Non-JSON body returns 400
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockTrackCspViolation = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/analytics", () => ({
  trackCspViolation: (...args: any[]) => mockTrackCspViolation(...args),
  trackServerEvent: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/csp-report/route";

describe("POST /api/csp-report", () => {
  beforeEach(() => {
    mockTrackCspViolation.mockClear();
  });

  it("accepts a valid CSP report and returns 204", async () => {
    const body = {
      "csp-report": {
        "blocked-uri": "https://evil.example.com/tracker.js",
        "violated-directive": "script-src 'self'",
        "source-file": "https://wolfpackauto.com/inventory",
        "line-number": 17,
      },
    };
    const req = new NextRequest("https://wolfpackauto.com/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(mockTrackCspViolation).toHaveBeenCalledWith(
      expect.objectContaining({
        blocked_uri: "https://evil.example.com/tracker.js",
        violated_directive: "script-src 'self'",
        source_file: "https://wolfpackauto.com/inventory",
        line_number: 17,
      }),
    );
  });

  it("returns 400 when csp-report key is missing", async () => {
    const req = new NextRequest("https://wolfpackauto.com/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ not: "a-csp-report" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it("returns 400 for non-JSON body", async () => {
    const req = new NextRequest("https://wolfpackauto.com/api/csp-report", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "this is not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when csp-report is null", async () => {
    const req = new NextRequest("https://wolfpackauto.com/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ "csp-report": null }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
