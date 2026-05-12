/**
 * POST /api/operator/auth/login
 *
 * Thin contract route that documents the operator-login entry point.
 * The actual credential check is performed by NextAuth's
 * /api/auth/callback/wolfpack-staff handler (mounted by the
 * "wolfpack-staff" CredentialsProvider in src/lib/auth.ts).
 *
 * Clients call signIn("wolfpack-staff", ...) from the UI; this route
 * exists so external callers (tests, scripts) can hit a stable URL.
 *
 * We DO NOT mint a session here — we forward to the NextAuth callback.
 * That keeps cookie issuance in one place and avoids drift between two
 * signing paths.
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: "email and password are required" },
      { status: 400 },
    );
  }

  // Server-side signin: post into the NextAuth callback URL and pass
  // the Set-Cookie header through. This lets external test runners use
  // a stable URL instead of going through the NextAuth client library.
  //
  // SSRF hardening: the base URL must come from a trusted env var. We do
  // NOT fall back to request.url's origin (Host-header controllable). If
  // neither NEXTAUTH_URL nor VERCEL_URL is set, refuse the request.
  let baseUrl: string;
  if (process.env.NEXTAUTH_URL) {
    baseUrl = process.env.NEXTAUTH_URL;
  } else if (process.env.VERCEL_URL) {
    baseUrl = `https://${process.env.VERCEL_URL}`;
  } else {
    return NextResponse.json(
      { error: "Server misconfigured: NEXTAUTH_URL not set" },
      { status: 500 },
    );
  }
  // Validate scheme + restrict to https / localhost http only.
  try {
    const u = new URL(baseUrl);
    if (!(u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")))) {
      throw new Error("disallowed scheme");
    }
  } catch {
    return NextResponse.json({ error: "Server misconfigured: invalid NEXTAUTH_URL" }, { status: 500 });
  }

  // Fetch CSRF token so the callback accepts the credentials post.
  const csrfResp = await fetch(`${baseUrl}/api/auth/csrf`, {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });
  const csrfJson = (await csrfResp.json().catch(() => ({}))) as { csrfToken?: string };
  const csrfToken = csrfJson.csrfToken ?? "";
  const csrfCookies = csrfResp.headers.get("set-cookie") ?? "";

  const callbackResp = await fetch(
    `${baseUrl}/api/auth/callback/wolfpack-staff?json=true`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: csrfCookies,
      },
      body: new URLSearchParams({
        csrfToken,
        email: body.email,
        password: body.password,
        json: "true",
        callbackUrl: `${baseUrl}/operator`,
      }).toString(),
      redirect: "manual",
    },
  );

  const ok = callbackResp.status < 400;
  const response = NextResponse.json(
    ok
      ? { ok: true }
      : { ok: false, error: "Invalid credentials" },
    { status: ok ? 200 : 401 },
  );

  // Pass NextAuth Set-Cookie headers through to the client.
  for (const value of callbackResp.headers.getSetCookie?.() ?? []) {
    response.headers.append("set-cookie", value);
  }

  return response;
}
