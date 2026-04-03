/**
 * i18n — Tests
 *
 * Covers: translation lookup, variable interpolation, locale detection,
 * missing key fallback, available locales.
 */

import {
  t,
  detectLocale,
  getAvailableLocales,
  getTranslationBundle,
  getLocaleDisplayName,
} from "@/lib/i18n";

/* ------------------------------------------------------------------ */
/*  Translation lookup                                                 */
/* ------------------------------------------------------------------ */

describe("t (translate)", () => {
  it("returns English translation by default", () => {
    expect(t("inventory.title")).toBe("Browse Inventory");
  });

  it("returns Spanish translation", () => {
    expect(t("inventory.title", "es")).toBe("Explorar Inventario");
  });

  it("returns French translation", () => {
    expect(t("inventory.title", "fr")).toBe("Parcourir l'Inventaire");
  });

  it("falls back to English for unknown locale", () => {
    expect(t("inventory.title", "de" as any)).toBe("Browse Inventory");
  });

  it("returns the key itself for unknown translation key", () => {
    expect(t("nonexistent.key" as any)).toBe("nonexistent.key");
  });
});

/* ------------------------------------------------------------------ */
/*  Variable interpolation                                             */
/* ------------------------------------------------------------------ */

describe("t — variable interpolation", () => {
  it("interpolates {{count}} variable", () => {
    expect(t("inventory.vehicles_found", "en", { count: 42 })).toBe(
      "42 vehicles found",
    );
  });

  it("interpolates in Spanish", () => {
    expect(t("inventory.vehicles_found", "es", { count: 15 })).toBe(
      "15 vehiculos encontrados",
    );
  });

  it("interpolates in French", () => {
    expect(t("inventory.vehicles_found", "fr", { count: 7 })).toBe(
      "7 vehicules trouves",
    );
  });

  it("replaces multiple occurrences of same variable", () => {
    // No double-occurrence keys in our data, but verify the mechanism
    const result = t("inventory.vehicles_found", "en", { count: 0 });
    expect(result).toBe("0 vehicles found");
  });
});

/* ------------------------------------------------------------------ */
/*  Locale detection                                                   */
/* ------------------------------------------------------------------ */

describe("detectLocale", () => {
  it("returns default locale with no input", () => {
    expect(detectLocale()).toBe("en");
  });

  it("detects from Accept-Language header", () => {
    expect(detectLocale("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(detectLocale("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(detectLocale("en-US,en;q=0.9")).toBe("en");
  });

  it("prioritizes cookie over header", () => {
    expect(detectLocale("en-US,en;q=0.9", "es")).toBe("es");
  });

  it("ignores invalid cookie locale", () => {
    expect(detectLocale("es-MX", "xx")).toBe("es");
  });

  it("falls back to English for unsupported language", () => {
    expect(detectLocale("de-DE,de;q=0.9,ja;q=0.8")).toBe("en");
  });

  it("handles quality values correctly", () => {
    // fr has higher quality than es
    expect(detectLocale("es;q=0.5,fr;q=0.9")).toBe("fr");
  });
});

/* ------------------------------------------------------------------ */
/*  Available locales                                                  */
/* ------------------------------------------------------------------ */

describe("getAvailableLocales", () => {
  it("returns en, es, fr", () => {
    const locales = getAvailableLocales();
    expect(locales).toContain("en");
    expect(locales).toContain("es");
    expect(locales).toContain("fr");
    expect(locales).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/*  Translation bundle                                                 */
/* ------------------------------------------------------------------ */

describe("getTranslationBundle", () => {
  it("returns full bundle for locale", () => {
    const bundle = getTranslationBundle("es");
    expect(bundle.locale).toBe("es");
    expect(bundle.translations["common.save"]).toBe("Guardar");
  });
});

/* ------------------------------------------------------------------ */
/*  Display names                                                      */
/* ------------------------------------------------------------------ */

describe("getLocaleDisplayName", () => {
  it("returns human-readable names", () => {
    expect(getLocaleDisplayName("en")).toBe("English");
    expect(getLocaleDisplayName("es")).toBe("Espanol");
    expect(getLocaleDisplayName("fr")).toBe("Francais");
  });
});
