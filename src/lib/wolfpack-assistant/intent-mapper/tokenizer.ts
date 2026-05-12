/**
 * Tokenizer — deterministic, dependency-free.
 *
 * Compared to the v0 capability-matcher tokenizer, this layer adds:
 *   - lemmatization of common verbs ("running" → "run", "updated" → "update")
 *   - retention of dealership-native short tokens that v0 dropped
 *     ("F&I" → ["fi"], "GP" → kept, "GM" → kept)
 *   - preservation of digits so the parameter extractor can pick them up
 *
 * NO external library. NO LLM. NO network call. Pure stdlib.
 */

/**
 * Stopwords list, tuned for dealership conversation. We KEEP some words
 * v0 dropped because they carry intent in this domain — "my", "show",
 * "set". Dropping them dropped recall on phrasings like "show my funnel"
 * and "set my attach target".
 */
const STOPWORDS = new Set([
  "a", "an", "the", "of", "and", "or", "but", "if", "then", "so",
  "is", "are", "be", "do", "does", "did", "was", "were", "been",
  "will", "would", "should", "could", "can", "shall", "may", "might",
  "have", "has", "had", "having",
  "in", "on", "at", "to", "from", "into", "with", "by", "as", "than",
  "this", "that", "these", "those",
  "it", "its",
  "i", "me", "you", "we", "us", "your", "our",
  // intentional omissions vs v0: kept "my", "show", "set", "for",
  // "show" because "show my funnel" is a real phrasing
  // "my" because "show my funnel" is a real phrasing
  // "set" because "set attach target" is a real phrasing
  // "for" because "route leads for maria" is a real phrasing
]);

/**
 * Dealership-native short tokens that should NEVER be dropped by the
 * length filter. Keep extending this as new phrasings emerge.
 */
const KEEP_SHORT = new Set([
  "fi", "gm", "gp", "vp", "ev", "ai", "ce",
  // intent markers — these short words carry meaning in dealer prompts
  "my", "me", "us",
  // imperative verbs that frequently start dealer prompts
  "set", "add", "see", "run", "get",
  // prepositions that scope intent
  "for",
  // state abbreviations occasionally surface
  "ny", "la", "tx", "ca",
]);

/**
 * Cheap verb lemmatizer — rule-based. Covers the 90% case in dealer
 * prompts without pulling in nlp-compromise or similar.
 *
 * NOTE: This is deliberately conservative. False-lemmatization (e.g.
 * "lead" → "lea") is worse than missed-lemmatization. We only collapse
 * unambiguous suffix endings.
 *
 * Returns an array of candidate lemmas (the token itself is NOT included
 * here — see lemmatize() for that aggregation).
 */
function lemmatizeVerbCandidates(token: string): string[] {
  if (token.length <= 3) return [];
  const out: string[] = [];

  // -ed → drop. "updated" → "update" / "updat". Emit BOTH:
  //   - drop "d" (handles -ed where stem ends in 'e': "updated" → "update")
  //   - drop "ed" (handles other -ed cases: "extracted" → "extract")
  if (token.endsWith("ed") && token.length > 4) {
    if (token.endsWith("ied")) {
      out.push(token.slice(0, -3) + "y"); // "modified" → "modify"
    } else {
      out.push(token.slice(0, -1)); // "updated" → "update"
      out.push(token.slice(0, -2)); // "extracted" → "extract"
    }
  }

  // -s → drop. "leads" → "lead", "deals" → "deal", "hours" → "hour"
  // Skip if it ends in "ss" (e.g. "business" stays).
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) {
    out.push(token.slice(0, -1));
  }

  return out;
}

/**
 * Returns the lemma AND the original token if they differ — so a prompt
 * containing "running" emits {"running", "run"} and matches both an
 * action description with "run" and one with "running".
 */
function lemmatize(token: string): string[] {
  const out = new Set<string>();
  out.add(token);

  // -ing form: emit "run" for "running" — but only when stem is 3+ chars.
  if (token.endsWith("ing") && token.length > 5) {
    const stem = token.slice(0, -3);
    if (stem.length >= 3) out.add(stem);
    // Double-letter stem ("running" → "run" not "runn")
    if (stem.length >= 4 && stem[stem.length - 1] === stem[stem.length - 2]) {
      out.add(stem.slice(0, -1));
    }
    // Also emit stem + "e" for verbs like "updating" → "update"
    if (stem.length >= 3) out.add(stem + "e");
  }

  for (const lemma of lemmatizeVerbCandidates(token)) {
    if (lemma !== token) out.add(lemma);
  }
  return Array.from(out);
}

/**
 * Tokenize a free-text prompt into a deterministic, deduplicated, lowercased
 * list of tokens — with verb lemmatization expanded inline.
 *
 * Examples:
 *   "Show me leads from this week"     → ["show", "me", "lead", "leads", "week"]
 *   "Update F&I attach target to 60%"  → ["update", "fi", "attach", "target", "60"]
 *   "Route the next 5 leads to maria"  → ["route", "next", "5", "lead", "leads", "maria"]
 */
export function tokenize(input: string): string[] {
  if (!input || typeof input !== "string") return [];

  const out = new Set<string>();
  // Pre-collapse "F&I" + "F & I" + "F/I" + "f i" (as separate tokens) → "fi".
  // Done before the split so we don't lose the joined-form token.
  const normalized = input
    .toLowerCase()
    .replace(/\bf\s*[&/]\s*i\b/g, "fi")
    .replace(/\bf\s+i\b/g, "fi")
    .replace(/[&]/g, " ");
  const raw = normalized.split(/[^a-z0-9]+/g);

  for (const tok of raw) {
    if (!tok) continue;
    if (STOPWORDS.has(tok)) continue;

    // Always keep digit-only tokens — params extractor uses them.
    if (/^[0-9]+$/.test(tok)) {
      out.add(tok);
      continue;
    }

    // Keep dealership-native short tokens.
    if (tok.length < 3 && !KEEP_SHORT.has(tok)) continue;

    for (const variant of lemmatize(tok)) {
      if (variant.length >= 2 || KEEP_SHORT.has(variant)) {
        out.add(variant);
      }
    }
  }

  return Array.from(out);
}

/**
 * Tokens that survive tokenization for an action's descriptive corpus
 * (slug + display_name + description). Cached per-action by the matcher.
 */
export function tokenizeAction(input: {
  slug: string;
  display_name: string;
  description: string;
}): Set<string> {
  const slugWords = input.slug.replace(/[._]/g, " ");
  return new Set(
    tokenize(`${slugWords} ${input.display_name} ${input.description}`),
  );
}

/**
 * Public list of stopwords + short-token whitelist, exported for tests.
 */
export const TOKENIZER_INTERNALS = {
  STOPWORDS,
  KEEP_SHORT,
} as const;
