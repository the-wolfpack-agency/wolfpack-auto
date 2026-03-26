import { NextRequest, NextResponse } from "next/server";
import {
  searchVehiclesByQuery,
  type VehicleSearchResult,
} from "@/lib/vehicle-search";
import type { PlaceholderVehicle } from "@/lib/placeholder-data";
import {
  queryInsights,
  ingestEvents,
  type AnalyticsEvent,
} from "@/lib/analytics-engine";

/* ------------------------------------------------------------------ */
/*  HYBRID chat responder for Wolfpack Motors                          */
/*  Rule-based intents + vector/keyword vehicle search                 */
/*  + behavioral insights from analytics brain                        */
/*  No AI calls — all pattern matching + vector similarity             */
/* ------------------------------------------------------------------ */

interface ChatRequest {
  message: string;
  history?: { role: string; content: string }[];
}

interface ChatResponse {
  response: string;
  suggested_actions?: string[];
  vehicles?: VehicleCard[];
  search_source?: "vector" | "keyword" | "placeholder";
}

interface VehicleCard {
  vin: string;
  title: string;
  price: number;
  mileage: number;
  condition: string;
  bodyStyle: string;
  thumbnail: string;
  link: string;
}

/* ---------- Dealer knowledge base ---------- */

const DEALER = {
  name: "Wolfpack Motors",
  phone: "(303) 555-1234",
  email: "hello@wolfpackmotors.com",
  address: "1234 Auto Drive, Denver, CO 80202",
  hours: {
    sales: "Mon-Sat: 9AM-8PM | Sun: 10AM-6PM",
    service: "Mon-Fri: 7AM-6PM | Sat: 8AM-4PM",
  },
  website: "https://wolfpackmotors.com",
  financing: {
    tiers: [
      { credit: "Excellent (750+)", apr: "2.9% - 4.9%", term: "up to 72 months" },
      { credit: "Good (700-749)", apr: "4.9% - 6.9%", term: "up to 72 months" },
      { credit: "Fair (650-699)", apr: "6.9% - 9.9%", term: "up to 60 months" },
      { credit: "Rebuilding (<650)", apr: "from 9.9%", term: "up to 48 months" },
    ],
    note: "We work with 20+ lenders to find the best rate for your situation. Everyone is approved!",
  },
  bodyStyles: ["SUV", "Truck", "Sedan", "Coupe", "Convertible", "Van", "Wagon", "Electric"],
} as const;

/* ---------- Rate limiter (in-memory, per-process) ---------- */

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(sessionId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(sessionId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;

  entry.count++;
  return true;
}

/* ---------- Input sanitization ---------- */

function sanitize(input: string): string {
  return input
    .replace(/[<>]/g, "") // Strip angle brackets (HTML)
    .replace(/&/g, "&amp;")
    .trim()
    .slice(0, 500);
}

/* ---------- Vehicle card formatting ---------- */

function vehicleToCard(v: PlaceholderVehicle): VehicleCard {
  return {
    vin: v.vin,
    title: `${v.year} ${v.make} ${v.model} ${v.trim}`,
    price: v.price,
    mileage: v.mileage,
    condition: v.condition,
    bodyStyle: v.bodyStyle,
    thumbnail: v.thumbnail,
    link: `/inventory/${v.vin}`,
  };
}

function formatVehicleCards(vehicles: PlaceholderVehicle[]): string {
  return vehicles
    .map((v) => {
      const price = v.price.toLocaleString("en-US");
      const miles = v.mileage.toLocaleString("en-US");
      return `- **[${v.year} ${v.make} ${v.model} ${v.trim}](/inventory/${v.vin})** — $${price} | ${miles} miles | ${v.condition}`;
    })
    .join("\n");
}

/* ---------- Vehicle search intent detection ---------- */

/** Make names we can detect in queries. */
const KNOWN_MAKES = [
  "honda", "toyota", "ford", "chevrolet", "chevy", "bmw", "tesla", "mazda",
  "hyundai", "kia", "nissan", "subaru", "volkswagen", "vw", "audi", "mercedes",
  "lexus", "acura", "jeep", "ram", "dodge", "gmc", "cadillac", "lincoln",
  "volvo", "porsche", "rivian", "lucid", "genesis",
];

const BODY_STYLE_WORDS = [
  "suv", "suvs", "truck", "trucks", "pickup", "sedan", "sedans",
  "coupe", "coupes", "convertible", "van", "minivan", "wagon", "hatchback",
  "crossover",
];

const SEARCH_TRIGGERS = [
  /\b(show\s*me|do\s*you\s*have|looking\s*for|find|search|any|got\s*any)\b/i,
  /\b(what|which)\s+(cars?|vehicles?|trucks?|suvs?)\b/i,
  /\b(cheapest|most\s*affordable|lowest\s*price|best\s*deal)\b/i,
  /\b(under|below|less\s*than|up\s*to)\s*\$?\d/i,
  /\b(over|above|more\s*than)\s*\$?\d/i,
];

const COMPARE_PATTERN =
  /\b(compare|versus|vs\.?|or|between)\b/i;

function isVehicleSearchIntent(message: string): boolean {
  const lower = message.toLowerCase();

  // Contains a known make
  for (const make of KNOWN_MAKES) {
    if (new RegExp(`\\b${make}\\b`, "i").test(lower)) return true;
  }

  // Contains a body style word
  for (const style of BODY_STYLE_WORDS) {
    if (new RegExp(`\\b${style}\\b`, "i").test(lower)) return true;
  }

  // Matches search trigger patterns
  for (const pattern of SEARCH_TRIGGERS) {
    if (pattern.test(lower)) return true;
  }

  return false;
}

function isComparisonIntent(message: string): boolean {
  return COMPARE_PATTERN.test(message) && isVehicleSearchIntent(message);
}

/* ---------- Pattern matching engine (rule-based intents) ---------- */

type IntentMatcher = {
  patterns: RegExp[];
  respond: (message: string) => ChatResponse;
};

const INTENTS: IntentMatcher[] = [
  // --- Greetings ---
  {
    patterns: [/^(hi|hello|hey|howdy|good\s*(morning|afternoon|evening)|what'?s?\s*up|yo)\b/i],
    respond: () => ({
      response:
        "Hello! Welcome to Wolfpack Motors. I can help you browse our inventory, answer financing questions, or schedule a test drive. What are you looking for today?",
      suggested_actions: [
        "Browse inventory",
        "Financing options",
        "Schedule test drive",
        "Business hours",
      ],
    }),
  },

  // --- Pricing (generic — vehicle-specific price queries handled by search) ---
  {
    patterns: [
      /\b(how\s*much\s*(?:is|are|does|do)\s+(?:your|the)\s+(?:financing|loans?|payments?))\b/i,
    ],
    respond: () => ({
      response:
        "Our inventory ranges from the low $20,000s to $80,000+ depending on make, model, and year. You can filter by price range on our [inventory page](/inventory). We also offer competitive financing to fit any budget!",
      suggested_actions: [
        "Browse under $30K",
        "Financing options",
        "Schedule test drive",
      ],
    }),
  },

  // --- Financing ---
  {
    patterns: [
      /\b(financ|loan|monthly\s*payment|apr|interest\s*rate|credit|pre.?approv|payment\s*plan|lease)\b/i,
    ],
    respond: () => {
      const tiers = DEALER.financing.tiers
        .map((t) => `- ${t.credit}: ${t.apr} (${t.term})`)
        .join("\n");

      return {
        response: `Great question! Here are our current financing tiers:\n\n${tiers}\n\n${DEALER.financing.note} Visit our [financing page](/financing) to get pre-approved in minutes, or give us a call at ${DEALER.phone}.`,
        suggested_actions: [
          "Get pre-approved",
          "Browse inventory",
          "Schedule test drive",
        ],
      };
    },
  },

  // --- Hours ---
  {
    patterns: [
      /\b(hours|open|close|when\s*(are|do)\s*(you|they)|schedule|time|business\s*hours)\b/i,
    ],
    respond: () => ({
      response: `Our hours are:\n\n**Sales:** ${DEALER.hours.sales}\n**Service:** ${DEALER.hours.service}\n\nWe're located at ${DEALER.address}. Stop by anytime or give us a call at ${DEALER.phone}!`,
      suggested_actions: ["Get directions", "Browse inventory", "Schedule test drive"],
    }),
  },

  // --- Location / Directions ---
  {
    patterns: [
      /\b(where|address|direction|location|map|find\s*you|get\s*there|located|gps)\b/i,
    ],
    respond: () => ({
      response: `We're located at **${DEALER.address}**. We're right off I-25, easy to find! Our sales hours are ${DEALER.hours.sales}. Come see us anytime!`,
      suggested_actions: ["Business hours", "Browse inventory", "Contact us"],
    }),
  },

  // --- Test Drive ---
  {
    patterns: [
      /\b(test\s*drive|appointment|come\s*(in|by)|visit|see\s*(the|a)\s*(car|vehicle|truck))\b/i,
    ],
    respond: () => ({
      response: `We'd love to get you behind the wheel! You can schedule a test drive by:\n\n- Visiting our [contact page](/contact) and filling out the form\n- Calling us at ${DEALER.phone}\n- Just stop by during sales hours (${DEALER.hours.sales})\n\nNo appointment needed — but scheduling ahead guarantees the vehicle is ready for you!`,
      suggested_actions: ["Browse inventory", "Business hours", "Financing options"],
    }),
  },

  // --- Trade-in ---
  {
    patterns: [
      /\b(trade.?in|trade\s*my|sell\s*my|my\s*(car|vehicle|truck)|what.?s\s*my\s*(car|vehicle)\s*worth|value\s*my)\b/i,
    ],
    respond: () => ({
      response:
        "We accept trade-ins and offer competitive valuations! Bring your vehicle in for a free appraisal, or start by browsing our [inventory](/inventory) to see what you'd like to upgrade to. Our team will work the numbers to get you the best deal.\n\nCall us at " +
        DEALER.phone +
        " or stop by to get your trade-in value.",
      suggested_actions: ["Browse inventory", "Financing options", "Contact us"],
    }),
  },

  // --- Contact ---
  {
    patterns: [
      /\b(contact|phone|call|email|reach|talk\s*to|speak|representative|salesperson|agent)\b/i,
    ],
    respond: () => ({
      response: `You can reach our team at:\n\n- **Phone:** ${DEALER.phone}\n- **Email:** ${DEALER.email}\n- **In person:** ${DEALER.address}\n- **Online:** [Contact form](/contact)\n\nOur sales team is available ${DEALER.hours.sales}.`,
      suggested_actions: ["Business hours", "Browse inventory", "Financing options"],
    }),
  },

  // --- Service / Maintenance ---
  {
    patterns: [
      /\b(service|maintenance|oil\s*change|repair|mechanic|tire|brake|inspect|recall|warranty)\b/i,
    ],
    respond: () => ({
      response: `Our service center is open **${DEALER.hours.service}**. We handle everything from oil changes to major repairs. Give us a call at ${DEALER.phone} to schedule your appointment.\n\nAll certified pre-owned vehicles come with warranty coverage!`,
      suggested_actions: ["Business hours", "Certified pre-owned", "Contact us"],
    }),
  },

  // --- Thank you ---
  {
    patterns: [/\b(thank|thanks|thx|ty|appreciate|helpful)\b/i],
    respond: () => ({
      response:
        "You're welcome! If you have any other questions, I'm here to help. You can also reach our team at " +
        DEALER.phone +
        " anytime during business hours.",
      suggested_actions: ["Browse inventory", "Business hours"],
    }),
  },
];

/* ---------- Rule-based intent matching ---------- */

function matchRuleIntent(message: string): ChatResponse | null {
  const clean = sanitize(message);

  for (const intent of INTENTS) {
    for (const pattern of intent.patterns) {
      if (pattern.test(clean)) {
        return intent.respond(clean);
      }
    }
  }

  return null;
}

/* ---------- Vehicle search response builders ---------- */

async function handleVehicleSearch(message: string): Promise<ChatResponse> {
  const result: VehicleSearchResult = await searchVehiclesByQuery(message, 3);
  const cards = result.vehicles.map(vehicleToCard);
  const formatted = formatVehicleCards(result.vehicles);

  return {
    response: `Here are some vehicles that match what you're looking for:\n\n${formatted}\n\n[Browse our full inventory](/inventory) to see all available vehicles, or tell me more about what you need!`,
    suggested_actions: [
      "Financing options",
      "Schedule test drive",
      "See more vehicles",
    ],
    vehicles: cards,
    search_source: result.source,
  };
}

async function handleComparison(message: string): Promise<ChatResponse> {
  // Try to extract the two items being compared
  const parts = message.split(/\b(?:compare|versus|vs\.?|or|between|and)\b/i);
  const queries = parts
    .map((p) => p.trim())
    .filter((p) => p.length > 2);

  if (queries.length < 2) {
    // Fall back to a general search
    return handleVehicleSearch(message);
  }

  const [resultA, resultB] = await Promise.all([
    searchVehiclesByQuery(queries[0], 1),
    searchVehiclesByQuery(queries[1], 1),
  ]);

  const vehiclesA = resultA.vehicles;
  const vehiclesB = resultB.vehicles;

  if (vehiclesA.length === 0 && vehiclesB.length === 0) {
    return {
      response: `I couldn't find exact matches for those vehicles, but you can [browse our full inventory](/inventory) to compare options side by side!`,
      suggested_actions: ["Browse inventory", "Financing options"],
    };
  }

  const allVehicles = [...vehiclesA.slice(0, 1), ...vehiclesB.slice(0, 1)];
  const cards = allVehicles.map(vehicleToCard);

  let comparison = "Here's a side-by-side look:\n\n";
  for (const v of allVehicles) {
    const price = v.price.toLocaleString("en-US");
    const miles = v.mileage.toLocaleString("en-US");
    comparison += `**[${v.year} ${v.make} ${v.model} ${v.trim}](/inventory/${v.vin})**\n`;
    comparison += `- Price: $${price}\n`;
    comparison += `- Mileage: ${miles} miles\n`;
    comparison += `- Fuel: ${v.fuel}\n`;
    comparison += `- Drivetrain: ${v.drivetrain}\n`;
    comparison += `- Condition: ${v.condition}\n\n`;
  }

  comparison +=
    "Want to see either of these in person? [Schedule a test drive](/contact)!";

  return {
    response: comparison,
    suggested_actions: [
      "Schedule test drive",
      "Financing options",
      "Browse more vehicles",
    ],
    vehicles: cards,
    search_source: resultA.source,
  };
}

/* ---------- Behavioral insights from analytics brain ---------- */

/**
 * Query the analytics brain for insights relevant to the user's message.
 * Enriches responses with data-driven context when available.
 */
async function getBehavioralContext(message: string): Promise<string | null> {
  try {
    const insights = await queryInsights(message, 3);
    if (insights.length === 0) return null;

    // Pick the most relevant high-confidence insight
    const relevant = insights.find((i) => i.confidence > 0.3);
    if (!relevant) return null;

    return relevant.insight;
  } catch {
    return null;
  }
}

/**
 * Track a chat interaction as an analytics event.
 */
function trackChatEvent(
  role: "user" | "assistant",
  content: string,
  sessionId: string,
  metadata: Record<string, unknown> = {},
): void {
  const event: AnalyticsEvent = {
    event_type: "chat_message",
    action: `chat_${role}`,
    page: "/chat",
    session_id: sessionId,
    user_fingerprint: sessionId, // best we have server-side
    timestamp: new Date().toISOString(),
    metadata: { role, content: content.slice(0, 200), ...metadata },
  };

  // Fire-and-forget — never block the response
  ingestEvents([event]);
}

/* ---------- Main intent dispatcher ---------- */

async function matchIntent(
  message: string,
  sessionId: string,
): Promise<ChatResponse> {
  const clean = sanitize(message);

  // Track the user's message
  trackChatEvent("user", clean, sessionId);

  // 1. Check rule-based intents FIRST for non-vehicle queries
  //    (greetings, hours, financing, contact, etc.)
  //    But skip inventory-related rule intents — let the vehicle search handle them
  const ruleResult = matchRuleIntent(clean);

  // 2. If the message is about vehicles, use the hybrid search
  if (isComparisonIntent(clean)) {
    const response = await handleComparison(clean);
    trackChatEvent("assistant", response.response, sessionId, {
      intent: "comparison",
    });
    return response;
  }

  if (isVehicleSearchIntent(clean)) {
    const response = await handleVehicleSearch(clean);
    trackChatEvent("assistant", response.response, sessionId, {
      intent: "vehicle_search",
      search_source: response.search_source,
    });
    return response;
  }

  // 3. Return rule-based result if it matched
  if (ruleResult) {
    trackChatEvent("assistant", ruleResult.response, sessionId, {
      intent: "rule_based",
    });
    return ruleResult;
  }

  // 4. Check behavioral insights for data-driven response
  const insight = await getBehavioralContext(clean);
  if (insight) {
    const response: ChatResponse = {
      response: `Based on what our customers are looking for: ${insight}\n\nI can also help with browsing inventory, financing, or scheduling a test drive. What would you like to know more about?`,
      suggested_actions: [
        "Browse inventory",
        "Financing options",
        "Schedule test drive",
      ],
    };
    trackChatEvent("assistant", response.response, sessionId, {
      intent: "behavioral_insight",
    });
    return response;
  }

  // 5. Final fallback
  const fallback: ChatResponse = {
    response: `I'd be happy to help! For detailed questions, you can reach our team at ${DEALER.phone} or visit our [contact page](/contact). I can also help with inventory, financing, hours, or scheduling a test drive.`,
    suggested_actions: [
      "Browse inventory",
      "Financing options",
      "Business hours",
      "Schedule test drive",
    ],
  };
  trackChatEvent("assistant", fallback.response, sessionId, {
    intent: "fallback",
  });
  return fallback;
}

/* ---------- Route handler ---------- */

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP or forwarded header
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "anonymous";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        {
          response:
            "You've sent a lot of messages! Please wait a bit, or call us at " +
            DEALER.phone +
            " for immediate help.",
        },
        { status: 429 },
      );
    }

    const body = (await request.json()) as ChatRequest;

    // Validate
    if (!body.message || typeof body.message !== "string") {
      return NextResponse.json(
        { response: "Please type a message and try again." },
        { status: 400 },
      );
    }

    if (body.message.length > 500) {
      return NextResponse.json(
        {
          response:
            "That message is a bit long! Please keep it under 500 characters, or call us at " +
            DEALER.phone +
            ".",
        },
        { status: 400 },
      );
    }

    // Use IP as a server-side session identifier for analytics
    const sessionId =
      request.headers.get("x-session-id") ?? `server_${ip}`;

    const result = await matchIntent(body.message, sessionId);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        response:
          "Something went wrong on our end. Please try again, or call us at " +
          DEALER.phone +
          ".",
      },
      { status: 500 },
    );
  }
}
