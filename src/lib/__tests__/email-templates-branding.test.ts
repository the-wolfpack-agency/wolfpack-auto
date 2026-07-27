/**
 * Guards the shared email header/footer branding:
 *  - the header shows the DEALER's full name (or logo), never a hardcoded
 *    "Wolfpack" and never a bare single letter
 *  - client-facing emails carry no em/en dashes (Nick's hard style rule)
 *
 * Regression: the invite email showed "W", then a lone initial, instead of
 * the dealership name recipients expect.
 */
import {
  teamInviteHTML,
  genericCustomerConfirmationHTML,
  passwordResetHTML,
} from "@/lib/email-templates";

const invite = (dealerName: string) =>
  teamInviteHTML({
    inviteeName: "Jane Smith",
    dealerName,
    role: "admin",
    inviterName: "Bob Owner",
    acceptUrl: "https://example.com/admin/accept-invite?token=abc",
  });

// The header wordmark div carries this distinctive style fragment.
const wordmark = (name: string) =>
  new RegExp(`margin:0 0 6px;">${name}</div>`);

describe("email header shows the full dealer name", () => {
  it("renders the dealer name as a wordmark, not an initial or 'W'", () => {
    const html = invite("Porsche Downtown");
    expect(html).toMatch(wordmark("Porsche Downtown"));
    // No lone-initial badge, and no hardcoded Wolfpack letter.
    expect(html).not.toMatch(/;color:#fff;">[A-Z]<\/div>/);
    expect(html).not.toMatch(/border-radius:50%[^>]*">W<\/div>/);
  });

  it("is brand-agnostic across dealer names", () => {
    expect(invite("Zephyr Motors")).toMatch(wordmark("Zephyr Motors"));
    expect(invite("OGIAM auto")).toMatch(wordmark("OGIAM auto"));
    expect(invite("Westside Cars")).toMatch(wordmark("Westside Cars"));
  });

  it("applies to other client-facing emails too", () => {
    const conf = genericCustomerConfirmationHTML({
      customerName: "Sam",
      dealerName: "Banfield Auto",
      type: "contact",
    } as Parameters<typeof genericCustomerConfirmationHTML>[0]);
    expect(conf).toMatch(wordmark("Banfield Auto"));

    const reset = passwordResetHTML({
      name: "Sam",
      resetUrl: "https://example.com/reset?t=1",
      dealerName: "Ocean Motors",
    } as Parameters<typeof passwordResetHTML>[0]);
    expect(reset).toMatch(wordmark("Ocean Motors"));
  });
});

describe("client-facing emails have no em/en dashes", () => {
  it("invite, confirmation, and reset are dash-free", () => {
    const htmls = [
      invite("Porsche Downtown"),
      genericCustomerConfirmationHTML({
        customerName: "Sam",
        dealerName: "Banfield Auto",
        type: "contact",
      } as Parameters<typeof genericCustomerConfirmationHTML>[0]),
      passwordResetHTML({
        name: "Sam",
        resetUrl: "https://example.com/reset?t=1",
        dealerName: "Ocean Motors",
      } as Parameters<typeof passwordResetHTML>[0]),
    ];
    for (const html of htmls) {
      expect(html).not.toContain("\u2014"); // em dash (0x2014)
      expect(html).not.toContain("\u2013"); // en dash (0x2013)
    }
  });
});
