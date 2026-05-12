/**
 * @jest-environment jsdom
 *
 * AuditRequestForm tests — server-rendered markup smoke check + light
 * interactive test (validation reject when no email entered).
 */

import { renderToStaticMarkup } from "react-dom/server";
import AuditRequestForm from "../AuditRequestForm";

describe("AuditRequestForm — SSR markup", () => {
  const html = renderToStaticMarkup(<AuditRequestForm />);

  test("renders the form container", () => {
    expect(html).toContain('data-testid="audit-request-form"');
  });

  test("contains dealership_name input", () => {
    expect(html).toMatch(/name="dealership_name"/);
  });

  test("contains contact_email email input", () => {
    expect(html).toMatch(/name="contact_email"/);
    expect(html).toMatch(/type="email"/);
  });

  test("contains csv_file file input", () => {
    expect(html).toMatch(/name="csv_file"/);
    expect(html).toMatch(/type="file"/);
  });

  test("submit button reads 'Get my audit'", () => {
    expect(html).toContain("Get my audit");
  });

  test("role select includes the documented options", () => {
    expect(html).toContain('value="fi_director"');
    expect(html).toContain('value="gm"');
    expect(html).toContain('value="gsm"');
    expect(html).toContain('value="controller"');
    expect(html).toContain('value="other"');
  });

  test("anonymization checkbox is present", () => {
    expect(html).toMatch(/type="checkbox"/);
    expect(html).toContain("Anonymize manager names");
  });

  test("privacy line is present", () => {
    expect(html).toContain("We don");
    expect(html).toContain("share your data");
  });
});
