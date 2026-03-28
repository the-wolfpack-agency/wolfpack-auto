import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/* -------------------------------------------------------------------------- */
/* POST /api/admin/vehicles/generate-listing                                  */
/* -------------------------------------------------------------------------- */

interface ListingInput {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  body_style?: string;
  mileage?: number;
  condition?: string;
  features?: string[];
  photos?: unknown[];
  price?: number;
  engine?: string;
  transmission?: string;
  drivetrain?: string;
  fuel_type?: string;
  exterior_color?: string;
}

interface ListingOutput {
  description: string;
  features: string[];
  highlights: string[];
}

/* -------------------------------------------------------------------------- */
/* Template-based fallback (no API key needed)                               */
/* -------------------------------------------------------------------------- */

function generateFromTemplate(input: ListingInput): ListingOutput {
  const {
    year = "",
    make = "",
    model = "",
    trim = "",
    body_style = "",
    mileage = 0,
    condition = "used",
    features = [],
    price = 0,
    engine = "",
    transmission = "",
    drivetrain = "",
    fuel_type = "",
    exterior_color = "",
  } = input;

  const conditionLabel = condition === "certified" ? "Certified Pre-Owned" : condition;
  const vehicleName = [year, make, model, trim].filter(Boolean).join(" ");
  const priceStr = price > 0 ? `$${price.toLocaleString("en-US")}` : "";

  // Build description paragraphs
  const paragraphs: string[] = [];

  // Opening
  if (mileage > 0) {
    paragraphs.push(
      `This ${conditionLabel} ${vehicleName} comes ready for the road with only ${mileage.toLocaleString("en-US")} miles.${
        exterior_color ? ` Finished in ${exterior_color}, this` : " This"
      } ${body_style || "vehicle"} offers excellent value${priceStr ? ` at ${priceStr}` : ""}.`,
    );
  } else {
    paragraphs.push(
      `Introducing the ${conditionLabel} ${vehicleName}.${
        exterior_color ? ` Beautifully finished in ${exterior_color}, this` : " This"
      } ${body_style || "vehicle"} is ready for its new owner${priceStr ? ` at ${priceStr}` : ""}.`,
    );
  }

  // Specs paragraph
  const specParts: string[] = [];
  if (engine) specParts.push(`a ${engine}`);
  if (transmission) specParts.push(`${transmission} transmission`);
  if (drivetrain) specParts.push(`${drivetrain.toUpperCase()} drivetrain`);
  if (fuel_type && fuel_type !== "gasoline") specParts.push(`${fuel_type} efficiency`);

  if (specParts.length > 0) {
    paragraphs.push(
      `Under the hood, you will find ${specParts.join(", ")}, delivering a confident and composed driving experience.`,
    );
  }

  // Features paragraph
  if (features.length > 0) {
    const featureList =
      features.length <= 3
        ? features.join(" and ")
        : `${features.slice(0, -1).join(", ")}, and ${features[features.length - 1]}`;

    paragraphs.push(`Key features include ${featureList}.`);
  }

  // Closing
  paragraphs.push(
    "Contact us today to schedule a test drive or request more information. Financing options are available.",
  );

  // Auto-suggest features if none provided
  const suggestedFeatures =
    features.length > 0
      ? features
      : inferFeatures(input);

  // Generate highlights
  const highlights: string[] = [];
  if (condition === "certified") highlights.push("Certified Pre-Owned with extended warranty");
  if (mileage > 0 && mileage < 30000) highlights.push("Low mileage");
  if (mileage > 0 && mileage < 15000) highlights.push("Like new condition");
  if (drivetrain === "awd" || drivetrain === "4wd") highlights.push(`${drivetrain.toUpperCase()} capability`);
  if (fuel_type === "electric") highlights.push("Zero emissions");
  if (fuel_type === "hybrid" || fuel_type === "plug_in_hybrid") highlights.push("Fuel-efficient hybrid");
  if (engine) highlights.push(engine);
  if (exterior_color) highlights.push(`${exterior_color} exterior`);
  if (priceStr) highlights.push(`Priced at ${priceStr}`);

  return {
    description: paragraphs.join("\n\n"),
    features: suggestedFeatures,
    highlights: highlights.slice(0, 6),
  };
}

function inferFeatures(input: ListingInput): string[] {
  const features: string[] = [];
  const { body_style, fuel_type, drivetrain, year } = input;

  // Year-based suggestions
  const y = year ?? 0;
  if (y >= 2020) {
    features.push("Apple CarPlay / Android Auto");
    features.push("Backup Camera");
    features.push("Bluetooth Connectivity");
  }
  if (y >= 2022) {
    features.push("Advanced Safety Suite");
    features.push("Touchscreen Infotainment");
  }

  // Drivetrain
  if (drivetrain === "awd") features.push("All-Wheel Drive");
  if (drivetrain === "4wd") features.push("Four-Wheel Drive");

  // Fuel type
  if (fuel_type === "electric") {
    features.push("Fast Charging Capable");
    features.push("Regenerative Braking");
  }
  if (fuel_type === "hybrid" || fuel_type === "plug_in_hybrid") {
    features.push("Hybrid Powertrain");
  }

  // Body style
  if (body_style === "truck" || body_style === "pickup") {
    features.push("Towing Package");
    features.push("Bed Liner");
  }
  if (body_style === "suv" || body_style === "crossover") {
    features.push("Roof Rails");
    features.push("Third Row Available");
  }

  return features.slice(0, 8);
}

/* -------------------------------------------------------------------------- */
/* OpenAI-powered generation (Strategy 1)                                    */
/* -------------------------------------------------------------------------- */

async function generateWithAI(input: ListingInput): Promise<ListingOutput | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const vehicleName = [input.year, input.make, input.model, input.trim]
    .filter(Boolean)
    .join(" ");

  const prompt = `Generate a professional car dealership listing for this vehicle:

Vehicle: ${vehicleName}
Condition: ${input.condition ?? "used"}
Mileage: ${input.mileage?.toLocaleString("en-US") ?? "N/A"} miles
Price: $${input.price?.toLocaleString("en-US") ?? "Contact for pricing"}
Body Style: ${input.body_style ?? "N/A"}
Engine: ${input.engine ?? "N/A"}
Transmission: ${input.transmission ?? "N/A"}
Drivetrain: ${input.drivetrain ?? "N/A"}
Fuel Type: ${input.fuel_type ?? "N/A"}
Color: ${input.exterior_color ?? "N/A"}
${input.features?.length ? `Current Features: ${input.features.join(", ")}` : ""}

Return a JSON object with:
- "description": A 2-3 paragraph professional marketing description. Engaging but honest. No exclamation marks.
- "features": An array of 6-10 key features as short strings.
- "highlights": An array of 3-6 selling points as short strings.

Return ONLY valid JSON, no markdown.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a professional automotive copywriter. You write accurate, engaging vehicle listings for car dealerships. Return valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(jsonStr) as ListingOutput;

    return {
      description: parsed.description ?? "",
      features: Array.isArray(parsed.features) ? parsed.features : [],
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
    };
  } catch (err) {
    console.error("[generate-listing] AI generation failed:", err);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Route handler                                                             */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  // --- Authentication ---
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    // Pure computation — no DB needed, but shadow check ensures consistency
    try {
      const body = (await req.json()) as ListingInput;
      if (!body.make || !body.model) {
        return NextResponse.json({ error: "make and model are required" }, { status: 400 });
      }
      return NextResponse.json(generateFromTemplate(body));
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  try {
    const body = (await req.json()) as ListingInput;

    if (!body.make || !body.model) {
      return NextResponse.json(
        { error: "make and model are required" },
        { status: 400 },
      );
    }

    // Try AI first, fall back to template
    const aiResult = await generateWithAI(body);
    const result = aiResult ?? generateFromTemplate(body);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/admin/vehicles/generate-listing] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
