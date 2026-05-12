/**
 * @jest-environment jsdom
 *
 * WebsiteAuditRequestForm tests — SSR markup smoke check.
 */

import { renderToStaticMarkup } from "react-dom/server";
import WebsiteAuditRequestForm from "../WebsiteAuditRequestForm";

describe("WebsiteAuditRequestForm — SSR markup", () => {
  const html = renderToStaticMarkup(<WebsiteAuditRequestForm />);

  test("renders the form container", () => {
    expect(html).toContain('data-testid="website-audit-form"');
  });

  test("contains dealership_name input", () => {
    expect(html).toMatch(/name="dealership_name"/);
  });

  test("contains website_url URL input", () => {
    expect(html).toMatch(/name="website_url"/);
    expect(html).toMatch(/type="url"/);
  });

  test("contains contact_email email input", () => {
    expect(html).toMatch(/name="contact_email"/);
    expect(html).toMatch(/type="email"/);
  });

  test("submit button reads 'Get my audit'", () => {
    expect(html).toContain("Get my audit");
  });

  test("role select includes the documented options", () => {
    expect(html).toContain('value="gm"');
    expect(html).toContain('value="gsm"');
    expect(html).toContain('value="marketing_director"');
    expect(html).toContain('value="owner"');
    expect(html).toContain('value="other"');
  });

  test("OEM select is present", () => {
    expect(html).toMatch(/name="oem_affiliation"/);
    expect(html).toContain('value="porsche"');
    expect(html).toContain('value="audi"');
    expect(html).toContain('value="toyota"');
    expect(html).toContain('value="kia"');
  });

  test("trust copy is present", () => {
    expect(html).toContain("public pages");
  });
});
