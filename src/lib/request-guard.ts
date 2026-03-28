/**
 * Request body parsing with size limits.
 *
 * Prevents denial-of-service via oversized request bodies.
 * Default limit: 1 MB.
 */

import { NextRequest } from "next/server";

export class PayloadTooLargeError extends Error {
  constructor(maxBytes: number = 1_048_576) {
    super(`Request body exceeds maximum allowed size of ${maxBytes} bytes`);
    this.name = "PayloadTooLargeError";
  }
}

/**
 * Parse the request body as JSON, enforcing a maximum byte size.
 *
 * @param request   — The incoming NextRequest
 * @param maxBytes  — Maximum allowed body size in bytes (default 1 MB)
 * @returns         — Parsed JSON body
 * @throws PayloadTooLargeError if Content-Length exceeds maxBytes
 */
export async function parseBody<T = Record<string, unknown>>(
  request: NextRequest,
  maxBytes: number = 1_048_576,
): Promise<T> {
  const contentLength = parseInt(
    request.headers.get("content-length") ?? "0",
    10,
  );

  if (contentLength > maxBytes) {
    throw new PayloadTooLargeError(maxBytes);
  }

  return request.json() as Promise<T>;
}
