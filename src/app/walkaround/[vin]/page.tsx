"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type CardCategory = "feature" | "safety" | "tech" | "value" | "competitive";

interface FlipCard {
  id: string;
  category: CardCategory;
  front: string;
  back: string;
  icon: string;
}

interface VehicleDetails {
  year: number;
  make: string;
  model: string;
  trim: string;
  vin: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

type CategoryFilter = CardCategory | "all";

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: "All",
  feature: "Features",
  safety: "Safety",
  tech: "Tech",
  value: "Value",
  competitive: "vs. Competition",
};

const CATEGORY_PILL: Record<CardCategory, string> = {
  feature: "bg-blue-100 text-blue-700",
  safety: "bg-green-100 text-green-700",
  tech: "bg-purple-100 text-purple-700",
  value: "bg-amber-100 text-amber-700",
  competitive: "bg-rose-100 text-rose-700",
};

const CATEGORY_CARD_BG: Record<CardCategory, string> = {
  feature: "from-blue-600 to-blue-700",
  safety: "from-green-600 to-green-700",
  tech: "from-purple-600 to-purple-700",
  value: "from-amber-500 to-amber-600",
  competitive: "from-rose-600 to-rose-700",
};

const ICON_MAP: Record<string, React.ReactNode> = {
  speedometer: (
    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v2m0 0a6 6 0 1 0 6 6m-6-6a6 6 0 0 0-6 6m6-6v-.01M12 18a6 6 0 0 1-6-6" />
    </svg>
  ),
  shield: (
    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  ),
  display: (
    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z" />
    </svg>
  ),
  certificate: (
    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
    </svg>
  ),
  compare: (
    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  ),
  sun: (
    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  ),
  camera: (
    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
    </svg>
  ),
  road: (
    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
  ),
};

const CATEGORY_FILTERS: CategoryFilter[] = ["all", "feature", "safety", "tech", "value", "competitive"];

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function WalkaroundDeckPage() {
  const params = useParams();
  const vin = (Array.isArray(params.vin) ? params.vin[0] : params.vin ?? "").toUpperCase();

  const [vehicle, setVehicle] = useState<VehicleDetails | null>(null);
  const [cards, setCards] = useState<FlipCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [shareCopied, setShareCopied] = useState(false);

  const fetchDeck = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/walkaround?vin=${encodeURIComponent(vin)}`);
      if (res.ok) {
        const json = await res.json();
        setVehicle(json.vehicle);
        setCards(json.cards ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch walkaround deck:", err);
    } finally {
      setLoading(false);
    }
  }, [vin]);

  useEffect(() => {
    if (vin) fetchDeck();
  }, [fetchDeck, vin]);

  // Filtered card list
  const filteredCards = useMemo(() => {
    if (categoryFilter === "all") return cards;
    return cards.filter((c) => c.category === categoryFilter);
  }, [cards, categoryFilter]);

  // Keep currentIndex in bounds when filter changes
  useEffect(() => {
    setCurrentIndex(0);
    setFlipped(false);
  }, [categoryFilter]);

  const card = filteredCards[currentIndex] ?? null;

  async function logFlip(cardId: string) {
    try {
      await fetch("/api/walkaround", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, card_id: cardId, action: "flipped" }),
      });
    } catch {
      // non-blocking
    }
  }

  function handleFlip() {
    if (!card) return;
    const next = !flipped;
    setFlipped(next);
    if (next) logFlip(card.id);
  }

  function handlePrev() {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setFlipped(false);
    }
  }

  function handleNext() {
    if (currentIndex < filteredCards.length - 1) {
      setCurrentIndex((i) => i + 1);
      setFlipped(false);
    }
  }

  async function handleShare() {
    try {
      const url = `${window.location.origin}/walkaround/${vin}#${card?.id ?? ""}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      // Also log as "shared"
      if (card) {
        await fetch("/api/walkaround", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vin, card_id: card.id, action: "shared" }),
        });
      }
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading deck…</p>
      </main>
    );
  }

  if (!vehicle || filteredCards.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <p className="mb-4 text-sm text-gray-700">
          {filteredCards.length === 0 && cards.length > 0
            ? "No cards in this category."
            : `No walkaround deck found for VIN: ${vin}`}
        </p>
        <a
          href="/walkaround"
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Try Another VIN
        </a>
      </main>
    );
  }

  const gradientClass = card ? CATEGORY_CARD_BG[card.category] : "from-brand-600 to-brand-700";

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      {/* Top bar — vehicle info */}
      <header className="border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </p>
            <p className="text-xs text-gray-500">
              {vehicle.trim} &middot; <span className="font-mono">{vehicle.vin}</span>
            </p>
          </div>
          <a
            href="/walkaround"
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            Change VIN
          </a>
        </div>
      </header>

      {/* Category filter pills */}
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-lg overflow-x-auto">
          <div className="flex gap-2 pb-1">
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  categoryFilter === cat
                    ? "bg-brand-600 text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Card counter */}
      <div className="py-3 text-center text-xs font-medium text-gray-500">
        {filteredCards.length > 0
          ? `${currentIndex + 1} of ${filteredCards.length}`
          : "No cards"}
      </div>

      {/* Flip card */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8">
        <div className="mx-auto w-full max-w-sm">
          {/* Card container with 3D perspective */}
          <div
            className="relative cursor-pointer select-none"
            style={{ perspective: "1000px" }}
            onClick={handleFlip}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleFlip();
            }}
            aria-label={flipped ? "Flip back to front" : "Flip card to reveal details"}
          >
            <div
              className="relative transition-transform duration-500"
              style={{
                transformStyle: "preserve-3d",
                transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                minHeight: "380px",
              }}
            >
              {/* Front face */}
              <div
                className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br ${gradientClass} p-8 shadow-xl`}
                style={{ backfaceVisibility: "hidden" }}
              >
                {/* Category badge */}
                {card && (
                  <span className={`mb-4 rounded-full px-3 py-1 text-xs font-semibold ${CATEGORY_PILL[card.category]}`}>
                    {CATEGORY_LABELS[card.category]}
                  </span>
                )}

                {/* Icon */}
                <div className="mb-6 text-white opacity-90">
                  {card ? (ICON_MAP[card.icon] ?? <DefaultIcon />) : <DefaultIcon />}
                </div>

                {/* Feature name */}
                <h2 className="text-center text-2xl font-bold leading-tight text-white">
                  {card?.front ?? ""}
                </h2>

                <p className="mt-6 text-center text-sm text-white/70">
                  Tap to flip
                </p>
              </div>

              {/* Back face */}
              <div
                className="absolute inset-0 flex flex-col justify-between overflow-hidden rounded-2xl bg-white p-8 shadow-xl"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <div>
                  {card && (
                    <span className={`mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${CATEGORY_PILL[card.category]}`}>
                      {CATEGORY_LABELS[card.category]}
                    </span>
                  )}
                  <h2 className="mb-4 text-xl font-bold text-gray-900">
                    {card?.front ?? ""}
                  </h2>
                  <p className="text-sm leading-relaxed text-gray-600">
                    {card?.back ?? ""}
                  </p>
                </div>

                <p className="mt-4 text-center text-xs text-gray-400">
                  Tap to flip back
                </p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-3.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-gray-500 shadow-sm transition-colors hover:bg-gray-50"
              aria-label="Share this card"
              title={shareCopied ? "Copied!" : "Share card link"}
            >
              {shareCopied ? (
                <CheckIcon />
              ) : (
                <ShareIcon />
              )}
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={currentIndex === filteredCards.length - 1}
              className="flex-1 rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>

          {/* Card index dots */}
          {filteredCards.length > 1 && filteredCards.length <= 12 && (
            <div className="mt-4 flex justify-center gap-1.5">
              {filteredCards.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setCurrentIndex(i); setFlipped(false); }}
                  className={`h-2 rounded-full transition-all ${
                    i === currentIndex ? "w-6 bg-brand-600" : "w-2 bg-gray-300"
                  }`}
                  aria-label={`Go to card ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline icons                                                                */
/* -------------------------------------------------------------------------- */

function DefaultIcon() {
  return (
    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}
