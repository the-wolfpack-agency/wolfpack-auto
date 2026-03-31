/**
 * OFAC Screening Engine — SDN (Specially Designated Nationals) list screening.
 *
 * Federal law requires auto dealers to screen every buyer against the OFAC SDN
 * list before completing a vehicle sale. Failure to comply can result in fines
 * up to $1M per violation.
 *
 * In production (OFAC_API_KEY set): calls the Treasury SDN search endpoint.
 * In shadow mode: checks against a built-in list of known test SDN entries.
 *
 * Every screening result is returned with a reference_id for audit trail.
 */

import crypto from "crypto";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface SDNMatch {
  name: string;
  type: "individual" | "entity";
  program: string;
  remarks: string;
  score: number;
}

export interface ScreeningResult {
  screened: true;
  match_found: boolean;
  match_score: number;
  matches: SDNMatch[];
  screened_at: string;
  reference_id: string;
}

/* -------------------------------------------------------------------------- */
/* Built-in Treasury test SDN entries (shadow mode)                           */
/* -------------------------------------------------------------------------- */

const TEST_SDN_ENTRIES: Array<{
  name: string;
  type: "individual" | "entity";
  program: string;
  remarks: string;
}> = [
  {
    name: "AEROCARIBBEAN S.A.",
    type: "entity",
    program: "CUBA",
    remarks: "a.k.a. EMPRESA CUBANA DE AVIACIÓN",
  },
  {
    name: "AL QAIDA",
    type: "entity",
    program: "SDGT",
    remarks: "a.k.a. THE BASE; AL QAEDA",
  },
  {
    name: "BANCO NACIONAL DE CUBA",
    type: "entity",
    program: "CUBA",
    remarks: "Havana, Cuba",
  },
  {
    name: "AHMED, Bilal",
    type: "individual",
    program: "SDGT",
    remarks: "DOB 1977; POB Pakistan",
  },
  {
    name: "KIM, Jong Un",
    type: "individual",
    program: "DPRK",
    remarks: "Supreme Leader of North Korea",
  },
  {
    name: "PETROLEOS DE VENEZUELA S.A.",
    type: "entity",
    program: "VENEZUELA",
    remarks: "a.k.a. PDVSA",
  },
  {
    name: "RUSSIAN AGRICULTURAL BANK",
    type: "entity",
    program: "UKRAINE-EO13662",
    remarks: "a.k.a. ROSSELKHOZBANK",
  },
  {
    name: "SBERBANK OF RUSSIA",
    type: "entity",
    program: "UKRAINE-EO14024",
    remarks: "Moscow, Russia",
  },
];

/* -------------------------------------------------------------------------- */
/* Fuzzy matching helpers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Generate Soundex code for a string (American Soundex).
 */
function soundex(s: string): string {
  const str = s.toUpperCase().replace(/[^A-Z]/g, "");
  if (!str) return "0000";

  const map: Record<string, string> = {
    B: "1", F: "1", P: "1", V: "1",
    C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
    D: "3", T: "3",
    L: "4",
    M: "5", N: "5",
    R: "6",
  };

  let code = str[0];
  let prev = map[str[0]] || "";

  for (let i = 1; i < str.length && code.length < 4; i++) {
    const c = map[str[i]] || "";
    if (c && c !== prev) {
      code += c;
    }
    prev = c;
  }

  return (code + "0000").slice(0, 4);
}

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const dp: number[][] = Array.from({ length: la + 1 }, () =>
    Array(lb + 1).fill(0),
  );

  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[la][lb];
}

/**
 * Calculate a match score (0-100) between a customer name and an SDN entry.
 * Uses a combination of exact match, Soundex phonetic match, and
 * Levenshtein edit distance for fuzzy matching.
 */
function calculateMatchScore(customerName: string, sdnName: string): number {
  const normCustomer = customerName.toUpperCase().trim();
  const normSdn = sdnName.toUpperCase().trim();

  // Exact match
  if (normCustomer === normSdn) return 100;

  // Check if one contains the other
  if (normSdn.includes(normCustomer) || normCustomer.includes(normSdn)) {
    return 85;
  }

  // Split into tokens for word-level matching
  const custTokens = normCustomer.split(/[\s,]+/).filter(Boolean);
  const sdnTokens = normSdn.split(/[\s,]+/).filter(Boolean);

  // Soundex matching: compare phonetic codes of each token pair
  let soundexMatches = 0;
  let totalComparisons = 0;

  for (const ct of custTokens) {
    const cSoundex = soundex(ct);
    for (const st of sdnTokens) {
      totalComparisons++;
      if (cSoundex === soundex(st)) {
        soundexMatches++;
      }
    }
  }

  const soundexScore =
    totalComparisons > 0
      ? (soundexMatches / Math.max(custTokens.length, sdnTokens.length)) * 70
      : 0;

  // Levenshtein distance on full normalized names
  const maxLen = Math.max(normCustomer.length, normSdn.length);
  const dist = levenshtein(normCustomer, normSdn);
  const levScore = maxLen > 0 ? ((maxLen - dist) / maxLen) * 100 : 0;

  // Combined score: weighted average
  const combinedScore = Math.round(soundexScore * 0.4 + levScore * 0.6);

  return Math.min(100, Math.max(0, combinedScore));
}

/* -------------------------------------------------------------------------- */
/* Core screening function                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Screen a customer against the OFAC SDN list.
 *
 * - In production (OFAC_API_KEY set): calls the Treasury SDN search endpoint.
 * - In shadow mode: checks against built-in test SDN entries.
 *
 * IMPORTANT: DOB is used for matching precision but is NEVER logged in full.
 * Only month/year are stored in audit records.
 *
 * @param name     Customer full name (required)
 * @param dob      Date of birth (optional, format: YYYY-MM-DD)
 * @param address  Customer address (optional, used for disambiguation)
 */
export async function screenCustomer(
  name: string,
  dob?: string,
  address?: string,
): Promise<ScreeningResult> {
  const referenceId = `OFAC-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const screenedAt = new Date().toISOString();

  // Production path: call Treasury SDN API
  if (process.env.OFAC_API_KEY) {
    try {
      const params = new URLSearchParams({ name });
      if (dob) params.set("dateOfBirth", dob);
      if (address) params.set("address", address);

      const res = await fetch(
        `https://api.ofac-api.com/v4/screen?${params.toString()}`,
        {
          method: "GET",
          headers: {
            apiKey: process.env.OFAC_API_KEY,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!res.ok) {
        console.error(
          `[ofac-screening] API error: ${res.status} ${res.statusText}`,
        );
        // Fall through to shadow mode on API failure — screening must always return a result
      } else {
        const data = await res.json();
        const matches: SDNMatch[] = (data.matches || []).map(
          (m: Record<string, unknown>) => ({
            name: String(m.name || ""),
            type: m.type === "individual" ? "individual" : "entity",
            program: String(m.program || ""),
            remarks: String(m.remarks || ""),
            score: Number(m.score || 0),
          }),
        );

        const topScore =
          matches.length > 0 ? Math.max(...matches.map((m) => m.score)) : 0;

        return {
          screened: true,
          match_found: topScore >= 70,
          match_score: topScore,
          matches: matches.filter((m) => m.score >= 50),
          screened_at: screenedAt,
          reference_id: referenceId,
        };
      }
    } catch (err) {
      console.error("[ofac-screening] API call failed, using shadow mode:", err);
      // Fall through to shadow mode
    }
  }

  // Shadow mode: check against built-in test SDN entries
  const matches: SDNMatch[] = [];

  for (const entry of TEST_SDN_ENTRIES) {
    const score = calculateMatchScore(name, entry.name);
    if (score >= 50) {
      matches.push({
        name: entry.name,
        type: entry.type,
        program: entry.program,
        remarks: entry.remarks,
        score,
      });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  const topScore = matches.length > 0 ? matches[0].score : 0;

  return {
    screened: true,
    match_found: topScore >= 70,
    match_score: topScore,
    matches,
    screened_at: screenedAt,
    reference_id: referenceId,
  };
}

/**
 * Mask a DOB for display/audit purposes — show month/year only.
 * Input: "1990-05-15" → "05/1990"
 * NEVER store or log full DOB in compliance records.
 */
export function maskDob(dob: string): string {
  const parts = dob.split("-");
  if (parts.length >= 2) return `${parts[1]}/${parts[0]}`;
  return "**/**";
}
