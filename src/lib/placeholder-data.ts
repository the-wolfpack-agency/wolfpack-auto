/**
 * Placeholder data for when the database is unavailable.
 *
 * This allows the site to render fully on Vercel (or local dev)
 * without a running PostgreSQL instance.
 */

// ---------------------------------------------------------------------------
// Vehicle placeholders
// ---------------------------------------------------------------------------

export interface PlaceholderVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  msrp: number;
  mileage: number;
  fuel: string;
  transmission: string;
  gradient: string;
  condition: string;
  bodyStyle: string;
  exteriorColor: string;
  interiorColor: string;
  drivetrain: string;
  engine: string;
  mpg: string;
  stockNumber: string;
  features: string[];
  tag?: string;
  photo: string;
  thumbnail: string;
}

export const placeholderVehicles: PlaceholderVehicle[] = [
  {
    vin: "1HGCV1F34PA000001",
    year: 2024,
    make: "Honda",
    model: "CR-V",
    trim: "EX-L",
    price: 34_250,
    msrp: 36_500,
    mileage: 1_283,
    fuel: "Gasoline",
    transmission: "CVT",
    gradient: "from-blue-400 to-blue-600",
    condition: "New",
    bodyStyle: "SUV",
    exteriorColor: "Radiant Red Metallic",
    interiorColor: "Black Leather",
    drivetrain: "All-Wheel Drive",
    engine: "1.5L Turbocharged 4-Cylinder",
    mpg: "29 city / 36 hwy",
    stockNumber: "WP24-0847",
    photo: "https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop&auto=format",
    thumbnail: "https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=400&h=300&fit=crop&auto=format",
    tag: "New Arrival",
    features: [
      "Honda Sensing Suite",
      "Leather-Trimmed Seats",
      "Wireless Apple CarPlay & Android Auto",
      "Heated Front & Rear Seats",
      "Power Tailgate with Hands-Free Access",
      "Panoramic Moonroof",
      "9-inch Color Touchscreen",
      "Blind Spot Information System",
      "Remote Engine Start",
      "Dual-Zone Automatic Climate Control",
      "LED Headlights with Auto On/Off",
      "18-inch Alloy Wheels",
    ],
  },
  {
    vin: "5YJ3E1EA1PF000002",
    year: 2023,
    make: "Tesla",
    model: "Model 3",
    trim: "Long Range",
    price: 38_990,
    msrp: 42_990,
    mileage: 12_450,
    fuel: "Electric",
    transmission: "Single-Speed",
    gradient: "from-red-400 to-red-600",
    condition: "Used",
    bodyStyle: "Sedan",
    exteriorColor: "Midnight Silver Metallic",
    interiorColor: "Black Premium",
    drivetrain: "All-Wheel Drive",
    engine: "Dual Motor Electric",
    mpg: "134 MPGe combined",
    stockNumber: "WP23-1102",
    photo: "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800&h=600&fit=crop&auto=format",
    thumbnail: "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=400&h=300&fit=crop&auto=format",
    tag: "Electric",
    features: [
      "Autopilot",
      "15-inch Touchscreen",
      "Premium Audio System",
      "Glass Roof",
      "Heated Seats All Rows",
      "Wireless Phone Charging",
      "Sentry Mode",
      "Over-the-Air Updates",
      "360 MPG Equivalent",
      "Fast Charging Capable",
      "LED Fog Lights",
      "Power Folding Mirrors",
    ],
  },
  {
    vin: "2T3P1RFV4RC000003",
    year: 2024,
    make: "Toyota",
    model: "RAV4",
    trim: "XLE Premium",
    price: 35_875,
    msrp: 37_200,
    mileage: 856,
    fuel: "Hybrid",
    transmission: "CVT",
    gradient: "from-emerald-400 to-emerald-600",
    condition: "New",
    bodyStyle: "SUV",
    exteriorColor: "Blueprint",
    interiorColor: "Black SofTex",
    drivetrain: "All-Wheel Drive",
    engine: "2.5L 4-Cylinder Hybrid",
    mpg: "41 city / 38 hwy",
    stockNumber: "WP24-0903",
    photo: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop&auto=format",
    thumbnail: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=400&h=300&fit=crop&auto=format",
    tag: "New Arrival",
    features: [
      "Toyota Safety Sense 2.5+",
      "8-inch Touchscreen",
      "SofTex Trimmed Seats",
      "Sunroof",
      "Blind Spot Monitor",
      "Rear Cross-Traffic Alert",
      "Wireless Apple CarPlay",
      "Dual-Zone Climate Control",
      "Power Liftgate",
      "LED Headlights",
      "17-inch Alloy Wheels",
      "Adaptive Cruise Control",
    ],
  },
  {
    vin: "5UXTS3C50P9000004",
    year: 2023,
    make: "BMW",
    model: "X3",
    trim: "xDrive30i",
    price: 42_500,
    msrp: 48_750,
    mileage: 8_720,
    fuel: "Gasoline",
    transmission: "8-Speed Auto",
    gradient: "from-slate-500 to-slate-700",
    condition: "Certified",
    bodyStyle: "SUV",
    exteriorColor: "Alpine White",
    interiorColor: "Cognac Vernasca Leather",
    drivetrain: "All-Wheel Drive",
    engine: "2.0L TwinPower Turbo 4-Cylinder",
    mpg: "25 city / 29 hwy",
    stockNumber: "WP23-0781",
    photo: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop&auto=format",
    thumbnail: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=400&h=300&fit=crop&auto=format",
    tag: "Luxury",
    features: [
      "BMW Live Cockpit Professional",
      "Vernasca Leather Upholstery",
      "Panoramic Moonroof",
      "Parking Assistant Plus",
      "Heated Front Seats",
      "Harman Kardon Sound System",
      "Wireless Charging",
      "Active Driving Assistant",
      "LED Headlights",
      "19-inch Alloy Wheels",
      "Power Tailgate",
      "Head-Up Display",
    ],
  },
  {
    vin: "1G1YA2D4XP5000005",
    year: 2024,
    make: "Chevrolet",
    model: "Corvette",
    trim: "Stingray 2LT",
    price: 68_900,
    msrp: 72_400,
    mileage: 3_210,
    fuel: "Gasoline",
    transmission: "8-Speed DCT",
    gradient: "from-yellow-400 to-orange-500",
    condition: "Used",
    bodyStyle: "Coupe",
    exteriorColor: "Torch Red",
    interiorColor: "Jet Black Mulan Leather",
    drivetrain: "Rear-Wheel Drive",
    engine: "6.2L V8",
    mpg: "16 city / 24 hwy",
    stockNumber: "WP24-0215",
    photo: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&h=600&fit=crop&auto=format",
    thumbnail: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=300&fit=crop&auto=format",
    features: [
      "Performance Exhaust",
      "Magnetic Ride Control",
      "Head-Up Display",
      "Bose 14-Speaker Audio",
      "GT2 Bucket Seats",
      "Performance Data Recorder",
      "Wireless Apple CarPlay",
      "Heated & Ventilated Seats",
      "Front Lift System",
      "Rear Camera Mirror",
      "Carbon Flash Badges",
      "8-inch Touchscreen",
    ],
  },
  {
    vin: "1FTFW1E89PKA00006",
    year: 2023,
    make: "Ford",
    model: "F-150",
    trim: "Lariat",
    price: 52_350,
    msrp: 58_100,
    mileage: 15_680,
    fuel: "Gasoline",
    transmission: "10-Speed Auto",
    gradient: "from-sky-400 to-indigo-500",
    condition: "Used",
    bodyStyle: "Truck",
    exteriorColor: "Iconic Silver Metallic",
    interiorColor: "Black Leather",
    drivetrain: "4x4",
    engine: "3.5L EcoBoost V6",
    mpg: "18 city / 24 hwy",
    stockNumber: "WP23-1450",
    photo: "https://images.unsplash.com/photo-1590362891991-f776e747a588?w=800&h=600&fit=crop&auto=format",
    thumbnail: "https://images.unsplash.com/photo-1590362891991-f776e747a588?w=400&h=300&fit=crop&auto=format",
    features: [
      "Ford Co-Pilot360 2.0",
      "SYNC 4 with 12-inch Screen",
      "B&O Sound System",
      "Leather-Trimmed Seats",
      "Pro Power Onboard",
      "Tailgate Step",
      "Trailer Tow Package",
      "360-Degree Camera",
      "Heated & Cooled Seats",
      "LED Box Lighting",
      "Spray-In Bedliner",
      "20-inch Chrome Wheels",
    ],
  },
];

/**
 * Similar vehicles shown on the VDP page.
 */
export const placeholderSimilarVehicles = [
  {
    year: 2024,
    make: "Toyota",
    model: "RAV4 XLE Premium",
    price: 35_875,
    mileage: 856,
    gradient: "from-emerald-400 to-emerald-600",
    vin: "2T3P1RFV4RC000003",
    photo: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop&auto=format",
  },
  {
    year: 2023,
    make: "Hyundai",
    model: "Tucson SEL",
    price: 29_800,
    mileage: 10_240,
    gradient: "from-violet-400 to-violet-600",
    vin: "5NMJFDAE4PH000008",
    photo: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800&h=600&fit=crop&auto=format",
  },
  {
    year: 2024,
    make: "Mazda",
    model: "CX-5 Carbon Turbo",
    price: 36_950,
    mileage: 2_150,
    gradient: "from-amber-400 to-amber-600",
    vin: "JM3KFBDM4R1000009",
    photo: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop&auto=format",
  },
];

// ---------------------------------------------------------------------------
// Featured vehicles (subset for homepage)
// ---------------------------------------------------------------------------

export const placeholderFeaturedVehicles = placeholderVehicles
  .slice(0, 4)
  .map((v) => ({
    vin: v.vin,
    year: v.year,
    make: v.make,
    model: `${v.model} ${v.trim}`,
    price: v.price,
    mileage: v.mileage,
    gradient: v.gradient,
    tag: v.tag ?? v.condition,
    photo: v.photo,
  }));

// ---------------------------------------------------------------------------
// Lead placeholders
// ---------------------------------------------------------------------------

export interface PlaceholderLead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  vehicle_interest: string;
  source: string;
  status: string;
  created_at: string;
}

export const placeholderLeads: PlaceholderLead[] = [
  {
    id: "lead-001",
    first_name: "Sarah",
    last_name: "Martinez",
    email: "sarah.m@example.com",
    phone: "+13035551001",
    vehicle_interest: "2024 Honda CR-V EX-L",
    source: "website_form",
    status: "new",
    created_at: "2026-03-25T10:30:00Z",
  },
  {
    id: "lead-002",
    first_name: "James",
    last_name: "Robinson",
    email: "james.r@example.com",
    phone: "+13035551002",
    vehicle_interest: "2023 Tesla Model 3 Long Range",
    source: "vdp_inquiry",
    status: "contacted",
    created_at: "2026-03-24T15:45:00Z",
  },
  {
    id: "lead-003",
    first_name: "Maria",
    last_name: "Lopez",
    email: "maria.l@example.com",
    phone: null,
    vehicle_interest: "Any SUV under $40K",
    source: "chat",
    status: "qualified",
    created_at: "2026-03-24T09:15:00Z",
  },
  {
    id: "lead-004",
    first_name: "David",
    last_name: "Chen",
    email: "david.c@example.com",
    phone: "+13035551004",
    vehicle_interest: "2024 Toyota RAV4 XLE Premium",
    source: "website_form",
    status: "appointment_set",
    created_at: "2026-03-23T14:20:00Z",
  },
  {
    id: "lead-005",
    first_name: "Emily",
    last_name: "Thompson",
    email: "emily.t@example.com",
    phone: "+13035551005",
    vehicle_interest: "2023 BMW X3 xDrive30i",
    source: "third_party",
    status: "sold",
    created_at: "2026-03-22T11:00:00Z",
  },
  {
    id: "lead-006",
    first_name: "Michael",
    last_name: "Brown",
    email: "michael.b@example.com",
    phone: "+13035551006",
    vehicle_interest: "2023 Ford F-150 Lariat",
    source: "phone",
    status: "new",
    created_at: "2026-03-25T08:10:00Z",
  },
  {
    id: "lead-007",
    first_name: "Jessica",
    last_name: "Davis",
    email: "jessica.d@example.com",
    phone: null,
    vehicle_interest: "Electric vehicles",
    source: "website_form",
    status: "contacted",
    created_at: "2026-03-21T16:30:00Z",
  },
  {
    id: "lead-008",
    first_name: "Robert",
    last_name: "Wilson",
    email: "robert.w@example.com",
    phone: "+13035551008",
    vehicle_interest: "2024 Chevrolet Corvette Stingray",
    source: "walk_in",
    status: "lost",
    created_at: "2026-03-20T13:45:00Z",
  },
];

// ---------------------------------------------------------------------------
// Dashboard stats (computed from placeholder data)
// ---------------------------------------------------------------------------

export interface PlaceholderDashboardStats {
  vehicles: {
    total: number;
    available: number;
    pending: number;
    sold: number;
  };
  leads: {
    total: number;
    new: number;
    contacted: number;
    qualified: number;
    appointment_set: number;
    sold: number;
    lost: number;
  };
  avgDaysOnLot: number;
  conversionRate: number;
}

export const placeholderDashboardStats: PlaceholderDashboardStats = {
  vehicles: {
    total: placeholderVehicles.length,
    available: placeholderVehicles.filter((v) => v.condition !== "Used").length,
    pending: 1,
    sold: 0,
  },
  leads: {
    total: placeholderLeads.length,
    new: placeholderLeads.filter((l) => l.status === "new").length,
    contacted: placeholderLeads.filter((l) => l.status === "contacted").length,
    qualified: placeholderLeads.filter((l) => l.status === "qualified").length,
    appointment_set: placeholderLeads.filter((l) => l.status === "appointment_set").length,
    sold: placeholderLeads.filter((l) => l.status === "sold").length,
    lost: placeholderLeads.filter((l) => l.status === "lost").length,
  },
  avgDaysOnLot: 18,
  conversionRate: 14,
};

// ---------------------------------------------------------------------------
// Facets (computed from placeholder vehicles)
// ---------------------------------------------------------------------------

export interface PlaceholderFacets {
  makes: { value: string; count: number }[];
  conditions: { value: string; count: number }[];
  bodyStyles: { value: string; count: number }[];
  years: { value: number; count: number }[];
}

function computeFacets(vehicles: PlaceholderVehicle[]): PlaceholderFacets {
  const makeMap = new Map<string, number>();
  const conditionMap = new Map<string, number>();
  const bodyMap = new Map<string, number>();
  const yearMap = new Map<number, number>();

  for (const v of vehicles) {
    makeMap.set(v.make, (makeMap.get(v.make) ?? 0) + 1);
    conditionMap.set(v.condition, (conditionMap.get(v.condition) ?? 0) + 1);
    bodyMap.set(v.bodyStyle, (bodyMap.get(v.bodyStyle) ?? 0) + 1);
    yearMap.set(v.year, (yearMap.get(v.year) ?? 0) + 1);
  }

  const toArray = <T extends string | number>(map: Map<T, number>) =>
    Array.from(map.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

  return {
    makes: toArray(makeMap) as { value: string; count: number }[],
    conditions: toArray(conditionMap) as { value: string; count: number }[],
    bodyStyles: toArray(bodyMap) as { value: string; count: number }[],
    years: (toArray(yearMap) as { value: number; count: number }[]).sort(
      (a, b) => b.value - a.value,
    ),
  };
}

export const placeholderFacets = computeFacets(placeholderVehicles);
