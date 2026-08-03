/**
 * The logo a new dealer is created with.
 *
 * The new-dealer form's "Click to upload logo" was a bare <div> with
 * cursor-pointer styling and no <input type="file"> anywhere. It looked like a
 * control and did nothing, so no dealer could ever be given a logo.
 *
 * It is a real file input now. The file is chosen before the dealer row exists,
 * so there is nothing to attach an upload to yet; the browser reads it into a
 * base64 data URL and it is written to dealers.logo_url on insert. That is the
 * same representation /api/admin/settings/logo already stores, so there is one
 * convention rather than two.
 *
 * The value therefore arrives from a browser and is untrusted. These pin the
 * server-side check, which is the one that counts.
 */
import { validateLogoDataUrl } from "../create-dealer";

const b64 = (bytes: number) => Buffer.alloc(bytes, 0).toString("base64");

describe("accepts a real logo", () => {
  it.each([["image/png"], ["image/jpeg"], ["image/svg+xml"]])("takes %s", (type) => {
    const url = `data:${type};base64,${b64(64)}`;
    expect(validateLogoDataUrl(url)).toBe(url);
  });

  it("is case-insensitive about the mime type", () => {
    const url = `data:IMAGE/PNG;base64,${b64(16)}`;
    expect(validateLogoDataUrl(url)).toBe(url);
  });
});

describe("refuses anything else, without stopping the dealer being created", () => {
  it("returns null rather than throwing, so a bad logo never blocks onboarding", () => {
    // The whole point of this page is adding a client. A malformed logo must
    // degrade to "no logo", never to "no dealer".
    expect(validateLogoDataUrl("not-a-data-url")).toBeNull();
    expect(validateLogoDataUrl(undefined)).toBeNull();
    expect(validateLogoDataUrl(null)).toBeNull();
    expect(validateLogoDataUrl("")).toBeNull();
    expect(validateLogoDataUrl(12345)).toBeNull();
    expect(validateLogoDataUrl({})).toBeNull();
  });

  it("rejects a disallowed type even when the shape is right", () => {
    expect(validateLogoDataUrl(`data:text/html;base64,${b64(16)}`)).toBeNull();
    expect(validateLogoDataUrl(`data:image/gif;base64,${b64(16)}`)).toBeNull();
    expect(validateLogoDataUrl(`data:application/pdf;base64,${b64(16)}`)).toBeNull();
  });

  it("rejects a payload over 2 MB", () => {
    // Client-side size checks are a convenience; a crafted request skips them.
    expect(validateLogoDataUrl(`data:image/png;base64,${b64(2 * 1024 * 1024 + 1024)}`)).toBeNull();
  });

  it("accepts one just under the limit", () => {
    const url = `data:image/png;base64,${b64(2 * 1024 * 1024 - 1024)}`;
    expect(validateLogoDataUrl(url)).toBe(url);
  });

  it("rejects a body that is not base64", () => {
    expect(validateLogoDataUrl("data:image/png;base64,<script>alert(1)</script>")).toBeNull();
    expect(validateLogoDataUrl("data:image/png;base64,héllo")).toBeNull();
  });

  it("rejects a plain URL, which would make the column a fetch target", () => {
    expect(validateLogoDataUrl("https://example.com/logo.png")).toBeNull();
    expect(validateLogoDataUrl("javascript:alert(1)")).toBeNull();
  });
});
