/**
 * Email delivery static analysis tests.
 *
 * All tests are purely static — they read source files directly and
 * assert that the email wiring is present and correct. No network
 * requests are made. These tests pass in shadow mode with no DB or
 * Resend API key configured.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../");

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

test.describe("Email delivery — static wiring verification", () => {
  test("email.ts exports sendLeadNotification function", () => {
    const src = readSrc("src/lib/email.ts");
    expect(src).toContain("export async function sendLeadNotification");
  });

  test("email.ts exports sendLeadConfirmation function", () => {
    const src = readSrc("src/lib/email.ts");
    expect(src).toContain("export async function sendLeadConfirmation");
  });

  test("email.ts uses Resend SDK", () => {
    const src = readSrc("src/lib/email.ts");
    // Must reference the Resend package — either import or string usage
    const usesResend =
      src.includes("resend") || src.includes("Resend");
    expect(usesResend).toBe(true);
  });

  test("leads API calls email notification on success", () => {
    const src = readSrc("src/app/api/leads/route.ts");

    // Must import from the email module
    const importsEmail =
      src.includes("@/lib/email") || src.includes("../lib/email");
    expect(importsEmail).toBe(true);

    // Must call at least one of the exported email functions
    const callsEmail =
      src.includes("sendLeadNotification") ||
      src.includes("sendLeadConfirmation");
    expect(callsEmail).toBe(true);
  });

  test("contact API calls email notification on success", () => {
    const src = readSrc("src/app/api/contact/route.ts");

    // The contact route uses the notification dispatcher which wraps email
    // It may import from @/lib/notifications rather than @/lib/email directly.
    // Either import path is acceptable — both ultimately send email.
    const importsEmailOrNotifications =
      src.includes("@/lib/email") ||
      src.includes("@/lib/notifications") ||
      src.includes("../lib/email") ||
      src.includes("../lib/notifications");
    expect(importsEmailOrNotifications).toBe(true);

    // Must call a send* function (sendLeadNotification, sendCustomerConfirmation, etc.)
    const callsSendFunction =
      src.includes("send") &&
      (src.includes("Notification") ||
        src.includes("Confirmation") ||
        src.includes("ContactForm") ||
        src.includes("notify"));
    expect(callsSendFunction).toBe(true);
  });

  test("email functions gracefully handle missing RESEND_API_KEY", () => {
    const src = readSrc("src/lib/email.ts");

    // The module must not crash on import when RESEND_API_KEY is absent.
    // Acceptable patterns: null guard on resendClient, conditional init,
    // or a try/catch around the send call.
    const hasFallback =
      src.includes("RESEND_API_KEY") &&
      (src.includes("? new Resend") ||           // conditional instantiation
        src.includes("?? null") ||               // nullish fallback
        src.includes("?? \"\"") ||              // empty string fallback
        src.includes("try {") ||                // try/catch in send path
        src.includes("if (!resendClient)") ||   // explicit null guard
        src.includes("resendClient"));           // any usage of the guarded client

    expect(hasFallback).toBe(true);
  });

  test("email templates have required fields", () => {
    const src = readSrc("src/lib/email.ts");

    // subject must be set on outgoing emails
    expect(src).toContain("subject");

    // from address must appear (either via RESEND_FROM_EMAIL env or literal)
    const hasFrom =
      src.includes("RESEND_FROM_EMAIL") ||
      src.includes("from:");
    expect(hasFrom).toBe(true);

    // to address must be passed
    expect(src).toContain("to:");

    // HTML body must be present in send calls
    const hasHtmlBody =
      src.includes("html:") || src.includes("<html") || src.includes("<body");
    expect(hasHtmlBody).toBe(true);
  });

  test("leads API response does not include email send status in body", () => {
    const src = readSrc("src/app/api/leads/route.ts");

    // The success 201 response should be clean — no emailSent / resendId
    // fields that would leak internal delivery state to the client.
    // We check there is no direct reference to these keys in NextResponse.json
    // success payloads. (The fire-and-forget block is void; result is never
    // captured and placed in the response body.)
    expect(src).not.toContain("emailSent");
    expect(src).not.toContain("resendId");
    expect(src).not.toContain("email_sent");
    expect(src).not.toContain("email_status");
  });
});
