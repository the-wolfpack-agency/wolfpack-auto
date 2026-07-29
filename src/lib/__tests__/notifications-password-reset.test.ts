/**
 * @jest-environment node
 *
 * sendPasswordReset delivery guard.
 *
 * Regression cover for the client-reported "forgot password sends no email"
 * bug: the reset email used a fire-and-forget `void dispatchEmail(...)`, which
 * Vercel killed by freezing the serverless function right after the 200
 * response, so the message never actually went out. It must AWAIT the send.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export {}; // ES module scope

const mockSendViaGraph = jest.fn();

jest.mock("@/lib/mail/send-via-graph", () => ({
  isGraphMailConfigured: () => true,
  sendViaGraph: (...args: any[]) => mockSendViaGraph(...args),
}));

jest.mock("@/lib/analytics-hooks", () => ({
  trackSystem: jest.fn(),
  trackDeal: jest.fn(),
  trackLead: jest.fn(),
  trackService: jest.fn(),
}));

jest.spyOn(console, "error").mockImplementation(() => {});
jest.spyOn(console, "warn").mockImplementation(() => {});

import { sendPasswordReset } from "@/lib/notifications";

const PARAMS = {
  email: "owner@acme.example.com",
  name: "Acme Owner",
  resetToken: "reset-tok-123",
  dealerName: "Acme Motors",
};

beforeEach(() => {
  mockSendViaGraph.mockReset();
});

test("awaits the email send so Vercel cannot freeze the function before it goes out", async () => {
  let sendCompleted = false;
  mockSendViaGraph.mockImplementation(async () => {
    // Simulate the async round-trip to Microsoft Graph.
    await Promise.resolve();
    await Promise.resolve();
    sendCompleted = true;
    return { delivered: true };
  });

  await sendPasswordReset(PARAMS);

  // If the send were still fire-and-forget (`void dispatchEmail`), the function
  // would resolve before Graph completed and this would be false.
  expect(sendCompleted).toBe(true);
  expect(mockSendViaGraph).toHaveBeenCalledTimes(1);
});

test("sends to the requested address with the reset token in the link", async () => {
  mockSendViaGraph.mockResolvedValue({ delivered: true });

  await sendPasswordReset(PARAMS);

  const arg = mockSendViaGraph.mock.calls[0][0];
  expect(arg.to).toBe(PARAMS.email);
  expect(arg.html).toContain(PARAMS.resetToken);
  expect(arg.html).toContain("/admin/reset-password?token=");
});

test("stays enumeration-safe: a Graph failure never throws to the caller", async () => {
  mockSendViaGraph.mockRejectedValue(new Error("graph down"));
  await expect(sendPasswordReset(PARAMS)).resolves.toBeUndefined();
});
