/**
 * Guards the shared email header/footer branding:
 *  - the header monogram is derived from the DEALER name, never a hardcoded "W"
 *  - client-facing emails carry no em/en dashes (Nick's hard style rule)
 *
 * Regression: the invite email showed "W" (Wolfpack) to every dealer's
 * recipients regardless of brand.
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

describe("email header monogram is brand-derived", () => {
  it("uses the dealer's first initial, not a hardcoded W", () => {
    const html = invite("Porsche Downtown");
    // Badge renders the initial P for Porsche.
    expect(html).toMatch(/;color:#fff;">P<\/div>/);
    // The old hardcoded Wolfpack "W" badge must be gone.
    expect(html).not.toMatch(/;color:#fff;">W<\/div>/);
  });

  it("is brand-agnostic across different dealer names", () => {
    expect(invite("Zephyr Motors")).toMatch(/;color:#fff;">Z<\/div>/);
    expect(invite("acme auto")).toMatch(/;color:#fff;">A<\/div>/);
    // A dealer that genuinely starts with W still derives W from its NAME
    // (correct), which is different from the old hardcoded badge.
    expect(invite("Westside Cars")).toMatch(/;color:#fff;">W<\/div>/);
  });

  it("applies to other client-facing emails too", () => {
    const conf = genericCustomerConfirmationHTML({
      customerName: "Sam",
      dealerName: "Banfield Auto",
      type: "contact",
    } as Parameters<typeof genericCustomerConfirmationHTML>[0]);
    expect(conf).toMatch(/;color:#fff;">B<\/div>/);

    const reset = passwordResetHTML({
      name: "Sam",
      resetUrl: "https://example.com/reset?t=1",
      dealerName: "Ocean Motors",
    } as Parameters<typeof passwordResetHTML>[0]);
    expect(reset).toMatch(/;color:#fff;">O<\/div>/);
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
      expect(html).not.toContain("—"); // em dash
      expect(html).not.toContain("–"); // en dash
    }
  });
});
