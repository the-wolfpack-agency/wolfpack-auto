import { NextResponse } from "next/server";

/**
 * API version for the wolfpack-auto dealer platform.
 *
 * Increment according to semver:
 *   - MAJOR: breaking changes to request/response contracts
 *   - MINOR: new endpoints or optional fields added
 *   - PATCH: bug fixes with no contract changes
 *
 * Clients can read the X-API-Version response header to detect
 * breaking changes and show upgrade prompts.
 */
export const API_VERSION = "1.0.0";

export const API_VERSION_HEADER = "X-API-Version";

/**
 * Add the X-API-Version header to an existing NextResponse.
 * Use in individual API routes when you need to set it explicitly.
 */
export function withApiVersion(response: NextResponse): NextResponse {
  response.headers.set(API_VERSION_HEADER, API_VERSION);
  return response;
}
