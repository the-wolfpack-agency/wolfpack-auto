/**
 * Tests for GET /api/security-posture (Wolfpack Auto)
 *
 * Asserts:
 *   - Returns 200 with markdown content
 *   - Response contains "quantum" and "crypto-agile"
 *   - Emits system.security_posture_viewed analytics event
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockTrackSecurityPostureViewed = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/analytics", () => ({
  trackSecurityPostureViewed: (...args: any[]) => mockTrackSecurityPostureViewed(...args),
  trackServerEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("fs", () => ({
  readFileSync: jest.fn().mockReturnValue(
    "# Wolfpack Auto Security Posture\n\nThis platform is crypto-agile and quantum-ready.\n\nHybrid TLS and post-quantum migration roadmap.\n\nAll data is protected by AES-256-GCM."
  ),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/security-posture/route";

describe("GET /api/security-posture", () => {
  beforeEach(() => {
    mockTrackSecurityPostureViewed.mockClear();
  });

  it("returns 200 with markdown content", async () => {
    const req = new NextRequest("https://wolfpackauto.com/api/security-posture", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.content).toBeDefined();
    expect(json.format).toBe("markdown");
  });

  it("content contains 'quantum'", async () => {
    const req = new NextRequest("https://wolfpackauto.com/api/security-posture", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const res = await GET(req);
    const json = await res.json();
    expect(json.content.toLowerCase()).toContain("quantum");
  });

  it("content contains 'crypto-agile'", async () => {
    const req = new NextRequest("https://wolfpackauto.com/api/security-posture", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const res = await GET(req);
    const json = await res.json();
    expect(json.content.toLowerCase()).toContain("crypto-agile");
  });

  it("emits system.security_posture_viewed analytics event", async () => {
    const req = new NextRequest("https://wolfpackauto.com/api/security-posture", {
      method: "GET",
      headers: { accept: "application/json", "user-agent": "TestBot/2.0" },
    });
    await GET(req);
    expect(mockTrackSecurityPostureViewed).toHaveBeenCalledWith(
      expect.objectContaining({ user_agent_hash: expect.any(String) }),
    );
  });
});
