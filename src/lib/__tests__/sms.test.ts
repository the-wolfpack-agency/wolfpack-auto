/**
 * Unit tests for src/lib/sms.ts
 *
 * Tests message formatting, conversation history, Twilio config check,
 * and inbound parsing.
 *
 * Run with: npx jest src/lib/__tests__/sms.test.ts
 */

import {
  getTwilioConfig,
  processInboundSMS,
  getConversationHistory,
  formatLeadAlertSMS,
  validateTwilioSignature,
  getDemoConversations,
  getDemoMessages,
  type SMSMessage,
} from "../sms";

/* -------------------------------------------------------------------------- */
/*  Twilio Config                                                              */
/* -------------------------------------------------------------------------- */

describe("getTwilioConfig", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns not configured when env vars missing", () => {
    process.env = { ...originalEnv };
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;
    const config = getTwilioConfig();
    expect(config.configured).toBe(false);
    expect(config.phone_number).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  Message Formatting                                                         */
/* -------------------------------------------------------------------------- */

describe("formatLeadAlertSMS", () => {
  it("formats a lead alert with name, vehicle, and source", () => {
    const result = formatLeadAlertSMS({
      first_name: "John",
      last_name: "Doe",
      vehicle_interest: "2024 Toyota Camry",
      source: "autotrader",
    });
    expect(result).toContain("John Doe");
    expect(result).toContain("2024 Toyota Camry");
    expect(result).toContain("autotrader");
  });
});

/* -------------------------------------------------------------------------- */
/*  Inbound SMS Processing                                                     */
/* -------------------------------------------------------------------------- */

describe("processInboundSMS", () => {
  const existingLeads = [
    { id: "lead-1", phone: "+15551234567" },
    { id: "lead-2", phone: "+15559876543" },
  ];

  it("matches inbound SMS to existing lead by phone", () => {
    const result = processInboundSMS("+15551234567", "Hello!", "dealer-1", existingLeads);
    expect(result.matched_lead_id).toBe("lead-1");
    expect(result.message.direction).toBe("inbound");
    expect(result.message.body).toBe("Hello!");
  });

  it("returns null matched_lead_id for unknown numbers", () => {
    const result = processInboundSMS("+15550000000", "Hello!", "dealer-1", existingLeads);
    expect(result.matched_lead_id).toBeNull();
  });

  it("handles empty existing leads", () => {
    const result = processInboundSMS("+15551234567", "Hello!", "dealer-1", []);
    expect(result.matched_lead_id).toBeNull();
    expect(result.message.status).toBe("received");
  });
});

/* -------------------------------------------------------------------------- */
/*  Conversation History                                                       */
/* -------------------------------------------------------------------------- */

describe("getConversationHistory", () => {
  const messages: SMSMessage[] = [
    { id: "sms-1", lead_id: "lead-1", dealer_id: "d1", direction: "inbound", from: "+1", to: "+2", body: "Hi", status: "received", twilio_sid: null, created_at: "2026-04-01T12:00:00Z" },
    { id: "sms-2", lead_id: "lead-1", dealer_id: "d1", direction: "outbound", from: "+2", to: "+1", body: "Hello", status: "sent", twilio_sid: "SM1", created_at: "2026-04-01T12:05:00Z" },
    { id: "sms-3", lead_id: "lead-2", dealer_id: "d1", direction: "inbound", from: "+3", to: "+2", body: "Other", status: "received", twilio_sid: null, created_at: "2026-04-01T12:10:00Z" },
  ];

  it("filters messages by lead_id", () => {
    const history = getConversationHistory(messages, "lead-1");
    expect(history).toHaveLength(2);
    expect(history[0].body).toBe("Hi");
    expect(history[1].body).toBe("Hello");
  });

  it("returns empty for unknown lead", () => {
    const history = getConversationHistory(messages, "lead-999");
    expect(history).toHaveLength(0);
  });

  it("sorts by created_at ascending", () => {
    const history = getConversationHistory(messages, "lead-1");
    const times = history.map((m) => new Date(m.created_at).getTime());
    expect(times[0]).toBeLessThan(times[1]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Signature Validation                                                       */
/* -------------------------------------------------------------------------- */

describe("validateTwilioSignature", () => {
  it("returns false when auth token not set", () => {
    const orig = process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_AUTH_TOKEN;
    expect(validateTwilioSignature("sig", "http://test.com", {})).toBe(false);
    if (orig) process.env.TWILIO_AUTH_TOKEN = orig;
  });
});

/* -------------------------------------------------------------------------- */
/*  Demo Data                                                                  */
/* -------------------------------------------------------------------------- */

describe("Demo data", () => {
  it("getDemoConversations returns valid conversations", () => {
    const convos = getDemoConversations();
    expect(convos.length).toBeGreaterThan(0);
    expect(convos[0].lead_id).toBeDefined();
    expect(convos[0].lead_name).toBeDefined();
  });

  it("getDemoMessages returns messages for a lead", () => {
    const msgs = getDemoMessages("lead-1");
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0].lead_id).toBe("lead-1");
  });
});
