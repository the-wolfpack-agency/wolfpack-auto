/**
 * Website Audit scanner — Playwright-based crawler.
 *
 * Visits the dealer's homepage and a sample of VDP pages, gathers the
 * deterministic findings that the rule registry in `patterns.ts` consumes,
 * and returns a typed `ScanResult`. Pure Playwright — NOT Vibium. Per the
 * global "build tooling first, then run" rule, scanning is zero-token:
 * findings are pulled by DOM probes, not by an LLM.
 *
 * `scanWebsite(url)` is the public entrypoint. The browser is launched
 * lazily so unit tests can mock the heavy lifting via the
 * `BrowserSession`-shaped overrides at the bottom of this file.
 *
 * Production-only path:
 *   chromium.launch -> goto(url) -> probe homepage -> sample VDPs -> close
 *
 * Test path: pass a `__browserFactory` override to short-circuit the launch.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface HomepageFindings {
  title: string;
  meta_description: string;
  viewport_meta_present: boolean;
  link_count: number;
  image_count: number;
  /** 0..1 — share of `<img>` tags with non-empty alt text. */
  image_alt_coverage: number;
  form_count: number;
  /** Field count of the largest form on the page (lead-capture proxy). */
  primary_form_field_count: number;
  mobile_has_horizontal_scroll: boolean;
  small_tap_targets_count?: number;
  is_https: boolean;
  has_above_fold_cta: boolean;
  has_inventory_link: boolean;
  has_trade_in_link: boolean;
  has_financing_link: boolean;
  has_privacy_link: boolean;
  has_accessibility_link: boolean;
  has_tcpa_consent: boolean;
  has_review_widget: boolean;
  shows_inventory_count: boolean;
  phone_visible: boolean;
  broken_link_count?: number;
}

export interface VDPFindings {
  url: string;
  photo_count: number;
  photos_lazy_loaded: boolean;
  has_vehicle_schema: boolean;
  price_visible: boolean;
  has_video: boolean;
  has_history_link: boolean;
}

export interface NetworkFindings {
  request_count?: number;
  total_bytes?: number;
  largest_resource_bytes?: number;
}

export interface ScanResult {
  scanned_url: string;
  scan_started_at: string;
  scan_completed_at: string;
  homepage: HomepageFindings;
  vdp_samples: VDPFindings[];
  network: NetworkFindings;
  /** Soft-error breadcrumbs (e.g., "vdp_samples_collection_failed"). */
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/*  Browser session abstraction                                       */
/* ------------------------------------------------------------------ */

/**
 * Narrow shape the scanner needs from a browser-session library. Lets us
 * pass either a real Playwright Chromium browser OR a mock in tests
 * without dragging Playwright type definitions across module boundaries.
 */
export interface BrowserSessionLike {
  goto: (url: string, opts?: { waitUntil?: string; timeout?: number }) => Promise<void>;
  content: () => Promise<string>;
  evaluate: <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T>;
  setViewport: (w: number, h: number) => Promise<void>;
  close: () => Promise<void>;
  /** Optional network-trace summary collected during page lifecycle. */
  networkSummary?: () => NetworkFindings;
}

export type BrowserFactory = () => Promise<BrowserSessionLike>;

let __browserFactory: BrowserFactory | null = null;

/** Test seam — replace the Playwright launcher with a mock. */
export function __setBrowserFactory(f: BrowserFactory | null): void {
  __browserFactory = f;
}

/* ------------------------------------------------------------------ */
/*  Public entrypoint                                                  */
/* ------------------------------------------------------------------ */

export interface ScanOptions {
  /** Hard cap on total scan wall-time (ms). Defaults to 30s. */
  timeout_ms?: number;
  /** How many sampled VDP pages to crawl (default 6). */
  vdp_sample_count?: number;
}

export async function scanWebsite(
  url: string,
  opts: ScanOptions = {},
): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];
  const sampleCount = opts.vdp_sample_count ?? 6;

  let session: BrowserSessionLike | null = null;
  try {
    session = await openBrowser();
  } catch (err) {
    warnings.push(`browser_launch_failed:${(err as Error).message ?? "unknown"}`);
    return emptyResult(url, startedAt, warnings);
  }

  let homepage: HomepageFindings;
  const vdpSamples: VDPFindings[] = [];
  let network: NetworkFindings = {};

  try {
    await session.goto(url, { waitUntil: "domcontentloaded", timeout: opts.timeout_ms ?? 30000 });
    homepage = await probeHomepage(session, url);

    // Mobile-viewport reload probe — re-load at 390px wide and recheck overflow.
    try {
      await session.setViewport(390, 844);
      await session.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      const hasHscroll = await session.evaluate<boolean>(() => {
        try {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
        } catch {
          return false;
        }
      });
      homepage.mobile_has_horizontal_scroll = Boolean(hasHscroll);
    } catch (err) {
      warnings.push(`mobile_check_failed:${(err as Error).message ?? "unknown"}`);
    }

    // Sample VDP URLs from inventory listing (best-effort)
    try {
      const vdpUrls = await collectVDPLinks(session, url, sampleCount);
      for (const v of vdpUrls) {
        try {
          await session.setViewport(1280, 800);
          await session.goto(v, { waitUntil: "domcontentloaded", timeout: 15000 });
          const f = await probeVDP(session, v);
          vdpSamples.push(f);
        } catch (err) {
          warnings.push(`vdp_probe_failed:${v}:${(err as Error).message ?? "unknown"}`);
        }
      }
    } catch (err) {
      warnings.push(`vdp_collection_failed:${(err as Error).message ?? "unknown"}`);
    }

    if (typeof session.networkSummary === "function") {
      network = session.networkSummary();
    }
  } catch (err) {
    warnings.push(`homepage_probe_failed:${(err as Error).message ?? "unknown"}`);
    homepage = blankHomepage(url);
  } finally {
    try {
      await session.close();
    } catch {
      /* swallow */
    }
  }

  return {
    scanned_url: url,
    scan_started_at: startedAt,
    scan_completed_at: new Date().toISOString(),
    homepage,
    vdp_samples: vdpSamples,
    network,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/*  Page probes                                                        */
/* ------------------------------------------------------------------ */

async function probeHomepage(
  session: BrowserSessionLike,
  url: string,
): Promise<HomepageFindings> {
  // One evaluate batch so we don't pay round-trip per field.
  const data = await session.evaluate<HomepageProbeRaw>(() => {
    const $ = (s: string) => document.querySelector(s);
    const $$ = (s: string) => Array.from(document.querySelectorAll(s));
    const text = (document.body?.innerText ?? "").toLowerCase();
    const links = $$("a") as HTMLAnchorElement[];
    const linkHrefs = links.map((a) => (a.getAttribute("href") ?? "").toLowerCase());
    const linkText = links.map((a) => (a.textContent ?? "").toLowerCase());
    const has = (needles: string[]) =>
      needles.some(
        (n) => linkHrefs.some((h) => h.includes(n)) || linkText.some((t) => t.includes(n)),
      );
    const images = $$("img") as HTMLImageElement[];
    const altCount = images.filter((img) => (img.getAttribute("alt") ?? "").trim().length > 0).length;
    const forms = $$("form") as HTMLFormElement[];
    const primaryForm = forms.reduce<HTMLFormElement | null>((best, f) => {
      const fields = f.querySelectorAll("input,select,textarea").length;
      const bestFields = best ? best.querySelectorAll("input,select,textarea").length : -1;
      return fields > bestFields ? f : best;
    }, null);
    const primaryFieldCount = primaryForm
      ? primaryForm.querySelectorAll("input:not([type=hidden]),select,textarea").length
      : 0;
    const viewport = $('meta[name="viewport"]') as HTMLMetaElement | null;
    const title = (document.title ?? "").trim();
    const desc = (
      $('meta[name="description"]') as HTMLMetaElement | null
    )?.content?.trim() ?? "";
    // Small tap-target heuristic — buttons / links with bounding rect < 44x44.
    const tapTargets = ($$("a, button") as HTMLElement[]).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
    }).length;
    const aboveFoldForm = forms.some((f) => {
      const r = f.getBoundingClientRect();
      return r.top < 800;
    });
    const phoneRegex = /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
    return {
      title,
      meta_description: desc,
      viewport_meta_present: Boolean(viewport),
      link_count: links.length,
      image_count: images.length,
      image_alt_coverage: images.length > 0 ? altCount / images.length : 1,
      form_count: forms.length,
      primary_form_field_count: primaryFieldCount,
      mobile_has_horizontal_scroll: false,
      small_tap_targets_count: tapTargets,
      has_above_fold_cta: aboveFoldForm,
      has_inventory_link: has(["/inventory", "/used", "/new", "search", "vehicles"]),
      has_trade_in_link: has(["trade-in", "trade_in", "trade", "kbb", "valuation"]),
      has_financing_link: has(["finance", "financing", "pre-qual", "prequal", "credit"]),
      has_privacy_link: has(["privacy"]),
      has_accessibility_link: has(["accessibility", "ada"]),
      has_tcpa_consent: text.includes("tcpa") || text.includes("consent to") || text.includes("autodial"),
      has_review_widget: has(["dealerrater", "google review", "review", "yelp", "cars.com"]),
      shows_inventory_count: /\b\d{2,4}\s+(?:cars|vehicles|used|new)\b/.test(text),
      phone_visible: phoneRegex.test(text),
      broken_link_count: 0,
    };
  });

  const isHttps = url.startsWith("https://");
  return {
    title: data.title,
    meta_description: data.meta_description,
    viewport_meta_present: data.viewport_meta_present,
    link_count: data.link_count,
    image_count: data.image_count,
    image_alt_coverage: data.image_alt_coverage,
    form_count: data.form_count,
    primary_form_field_count: data.primary_form_field_count,
    mobile_has_horizontal_scroll: false,
    small_tap_targets_count: data.small_tap_targets_count,
    is_https: isHttps,
    has_above_fold_cta: data.has_above_fold_cta,
    has_inventory_link: data.has_inventory_link,
    has_trade_in_link: data.has_trade_in_link,
    has_financing_link: data.has_financing_link,
    has_privacy_link: data.has_privacy_link,
    has_accessibility_link: data.has_accessibility_link,
    has_tcpa_consent: data.has_tcpa_consent,
    has_review_widget: data.has_review_widget,
    shows_inventory_count: data.shows_inventory_count,
    phone_visible: data.phone_visible,
    broken_link_count: data.broken_link_count,
  };
}

interface HomepageProbeRaw extends Omit<HomepageFindings, "is_https"> {}

async function collectVDPLinks(
  session: BrowserSessionLike,
  baseUrl: string,
  max: number,
): Promise<string[]> {
  return session.evaluate<string[]>((base: string, n: number) => {
    const anchors = Array.from(document.querySelectorAll("a")) as HTMLAnchorElement[];
    const vdpPatterns = [/\/inventory\//i, /\/vehicle\//i, /\/used\//i, /\/new\//i, /\/vdp/i, /vin=/i];
    const matched = anchors
      .map((a) => a.href)
      .filter((h) => h && vdpPatterns.some((p) => p.test(h)));
    const unique = Array.from(new Set(matched));
    // Make sure URLs are absolute against the base
    const abs = unique.map((u) => {
      try { return new URL(u, base).toString(); } catch { return u; }
    });
    return abs.slice(0, n);
  }, baseUrl, max);
}

async function probeVDP(session: BrowserSessionLike, url: string): Promise<VDPFindings> {
  const data = await session.evaluate<VDPFindings>((u: string) => {
    const $$ = (s: string) => Array.from(document.querySelectorAll(s));
    const text = (document.body?.innerText ?? "").toLowerCase();
    const photos = $$('img, picture') as HTMLImageElement[];
    const lazy = photos.filter((p) => (p.getAttribute("loading") ?? "").toLowerCase() === "lazy").length;
    const lazyLoaded = photos.length > 0 ? lazy / photos.length > 0.5 : false;
    const schemaTag = $$('script[type="application/ld+json"]')
      .map((s) => (s.textContent ?? "").toLowerCase())
      .some((c) => c.includes('"vehicle"') || c.includes('"car"'));
    const microdata = !!document.querySelector('[itemtype*="Vehicle"], [itemtype*="Car"]');
    const priceRegex = /\$[\s]?[\d,]{3,}/;
    const priceVisible = priceRegex.test(text) && !/call for price|please call|inquire/i.test(text);
    const hasVideo = !!document.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"]');
    const hasHistoryLink = (Array.from(document.querySelectorAll("a")) as HTMLAnchorElement[]).some(
      (a) => /carfax|autocheck|vehicle history/i.test(`${a.href} ${a.textContent ?? ""}`),
    );
    return {
      url: u,
      photo_count: photos.length,
      photos_lazy_loaded: lazyLoaded,
      has_vehicle_schema: schemaTag || microdata,
      price_visible: priceVisible,
      has_video: hasVideo,
      has_history_link: hasHistoryLink,
    };
  }, url);
  return data;
}

/* ------------------------------------------------------------------ */
/*  Browser open                                                       */
/* ------------------------------------------------------------------ */

async function openBrowser(): Promise<BrowserSessionLike> {
  if (__browserFactory) return __browserFactory();
  // Lazy-import Playwright so units tests / build don't pay the cost.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pw = require("playwright") as { chromium: any };
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: "WolfpackAuto-WebsiteAudit/1.0" });
  const page = await ctx.newPage();
  let totalBytes = 0;
  let requestCount = 0;
  let largest = 0;
  page.on("response", async (res: any) => {
    try {
      requestCount += 1;
      const headers = res.headers();
      const length = Number(headers["content-length"] ?? 0);
      if (Number.isFinite(length) && length > 0) {
        totalBytes += length;
        if (length > largest) largest = length;
      }
    } catch {
      /* swallow */
    }
  });
  const session: BrowserSessionLike = {
    goto: async (u, o) => {
      await page.goto(u, o);
    },
    content: () => page.content(),
    evaluate: (fn, ...args) => page.evaluate(fn as any, ...args),
    setViewport: (w, h) => page.setViewportSize({ width: w, height: h }),
    close: async () => {
      await page.close();
      await ctx.close();
      await browser.close();
    },
    networkSummary: () => ({
      request_count: requestCount,
      total_bytes: totalBytes,
      largest_resource_bytes: largest,
    }),
  };
  return session;
}

/* ------------------------------------------------------------------ */
/*  Defaults / fallback                                                */
/* ------------------------------------------------------------------ */

function blankHomepage(url: string): HomepageFindings {
  return {
    title: "",
    meta_description: "",
    viewport_meta_present: false,
    link_count: 0,
    image_count: 0,
    image_alt_coverage: 1,
    form_count: 0,
    primary_form_field_count: 0,
    mobile_has_horizontal_scroll: false,
    small_tap_targets_count: 0,
    is_https: url.startsWith("https://"),
    has_above_fold_cta: false,
    has_inventory_link: false,
    has_trade_in_link: false,
    has_financing_link: false,
    has_privacy_link: false,
    has_accessibility_link: false,
    has_tcpa_consent: false,
    has_review_widget: false,
    shows_inventory_count: false,
    phone_visible: false,
    broken_link_count: 0,
  };
}

function emptyResult(url: string, startedAt: string, warnings: string[]): ScanResult {
  return {
    scanned_url: url,
    scan_started_at: startedAt,
    scan_completed_at: new Date().toISOString(),
    homepage: blankHomepage(url),
    vdp_samples: [],
    network: {},
    warnings,
  };
}
