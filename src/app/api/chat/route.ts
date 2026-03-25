import { NextRequest, NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  ZERO-TOKEN rule-based chat responder for Wolfpack Motors           */
/*  No AI calls — all pattern matching against dealer knowledge base   */
/* ------------------------------------------------------------------ */

interface ChatRequest {
  message: string;
  history?: { role: string; content: string }[];
}

interface ChatResponse {
  response: string;
  suggested_actions?: string[];
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

/* ---------- Pattern matching engine ---------- */

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

  // --- Inventory: body style ---
  {
    patterns: [
      /\b(suv|suvs|crossover|crossovers)\b/i,
      /\b(truck|trucks|pickup|pickups)\b/i,
      /\b(sedan|sedans|car|cars)\b/i,
      /\b(coupe|coupes|convertible|convertibles)\b/i,
      /\b(van|vans|minivan|minivans)\b/i,
      /\b(electric|ev|hybrid|plug.?in)\b/i,
      /\b(inventory|vehicles|what\s*(do\s*)?you\s*have|show\s*me|looking\s*for|browse)\b/i,
    ],
    respond: (msg) => {
      const lower = msg.toLowerCase();
      let bodyStyle: string | null = null;
      let label = "vehicles";

      if (/suv|crossover/i.test(lower)) {
        bodyStyle = "SUV";
        label = "SUVs and crossovers";
      } else if (/truck|pickup/i.test(lower)) {
        bodyStyle = "Truck";
        label = "trucks and pickups";
      } else if (/sedan|car(?!e)/i.test(lower)) {
        bodyStyle = "Sedan";
        label = "sedans";
      } else if (/coupe/i.test(lower)) {
        bodyStyle = "Coupe";
        label = "coupes";
      } else if (/convertible/i.test(lower)) {
        bodyStyle = "Convertible";
        label = "convertibles";
      } else if (/van|minivan/i.test(lower)) {
        bodyStyle = "Van";
        label = "vans and minivans";
      } else if (/electric|ev\b|hybrid|plug.?in/i.test(lower)) {
        bodyStyle = "Electric";
        label = "electric and hybrid vehicles";
      }

      const link = bodyStyle
        ? `[Browse ${label}](/inventory?body_style=${encodeURIComponent(bodyStyle)})`
        : "[Browse all inventory](/inventory)";

      return {
        response: bodyStyle
          ? `We have a great selection of ${label}! ${link} to see current availability with photos and pricing.`
          : `We carry SUVs, trucks, sedans, coupes, and electric vehicles. ${link} to explore our full selection, or tell me what type of vehicle you're looking for!`,
        suggested_actions: bodyStyle
          ? ["View all inventory", "Financing options", "Schedule test drive"]
          : ["SUVs", "Trucks", "Sedans", "Electric vehicles"],
      };
    },
  },

  // --- Pricing ---
  {
    patterns: [
      /\b(price|pricing|how\s*much|cost|afford|budget|cheap|expensive|deal|range)\b/i,
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
      /\b(test\s*drive|schedule|appointment|come\s*(in|by)|visit|see\s*(the|a)\s*(car|vehicle|truck))\b/i,
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

function matchIntent(message: string): ChatResponse {
  const clean = sanitize(message);

  for (const intent of INTENTS) {
    for (const pattern of intent.patterns) {
      if (pattern.test(clean)) {
        return intent.respond(clean);
      }
    }
  }

  // Fallback
  return {
    response: `I'd be happy to help! For detailed questions, you can reach our team at ${DEALER.phone} or visit our [contact page](/contact). I can also help with inventory, financing, hours, or scheduling a test drive.`,
    suggested_actions: [
      "Browse inventory",
      "Financing options",
      "Business hours",
      "Schedule test drive",
    ],
  };
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

    const result = matchIntent(body.message);

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
