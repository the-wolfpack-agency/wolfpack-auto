/**
 * Jest setup for jsdom-based tests.
 *
 * react-dom 18 server build requires `TextEncoder` / `TextDecoder` on
 * the global scope. Node provides them in `util` but they aren't on
 * `globalThis` in jsdom test environments by default. Polyfill them
 * up front so component tests that `import "react-dom/server"` (or
 * mount via `react-dom/client`) work without per-test plumbing.
 */

import { TextEncoder, TextDecoder } from "util";

// Cast via `unknown` to detach from node:util's typings — jsdom expects the
// browser-shaped TextEncoder/Decoder, and the structural match is good
// enough for test runtime even if the TS types disagree on the prototype.
const g = globalThis as unknown as Record<string, unknown>;
if (typeof g.TextEncoder === "undefined") {
  g.TextEncoder = TextEncoder;
}
if (typeof g.TextDecoder === "undefined") {
  g.TextDecoder = TextDecoder;
}
