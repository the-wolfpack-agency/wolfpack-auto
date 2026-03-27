"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DecodedVIN {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  body_style: string | null;
  engine: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuel_type: string | null;
  country_of_origin: string;
}

interface QuickAddResult {
  success: boolean;
  vehicle: {
    id: string;
    vin: string;
    year: number;
    make: string;
    model: string;
    trim: string;
    price: number;
    description: string;
    photos: { url: string; thumbnail_url: string }[];
  };
  meta: {
    smart_defaults_confidence: number;
    photos_processed: number;
    photos_auto_ordered: boolean;
    qdrant_indexed: boolean;
    highlights: string[];
  };
}

type Step =
  | "idle"
  | "decoding"
  | "decoded"
  | "submitting"
  | "generating_listing"
  | "processing_photos"
  | "indexing"
  | "done"
  | "error";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function QuickAddPage() {
  // Form state
  const [vin, setVin] = useState("");
  const [price, setPrice] = useState("");
  const [mileage, setMileage] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);

  // Decode state
  const [decoded, setDecoded] = useState<DecodedVIN | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuickAddResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showScanner, setShowScanner] = useState(false);

  // Dealer ID — in production this comes from auth/session context
  const dealerId = "default";

  /* ---------------------------------------------------------------- */
  /*  VIN decode                                                       */
  /* ---------------------------------------------------------------- */

  const handleVinDecode = useCallback(async (vinValue: string) => {
    const cleaned = vinValue.trim().toUpperCase();
    if (cleaned.length !== 17) return;

    setStep("decoding");
    setError(null);
    setDecoded(null);

    try {
      const res = await fetch(`/api/admin/vin-decode?vin=${encodeURIComponent(cleaned)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to decode VIN");
        setStep("idle");
        return;
      }

      setDecoded(data.decoded);
      setStep("decoded");
    } catch {
      setError("Network error — could not reach VIN decode service");
      setStep("idle");
    }
  }, []);

  const handleVinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
      setVin(value);

      // Auto-decode when 17 chars are entered
      if (value.length === 17) {
        handleVinDecode(value);
      }
    },
    [handleVinDecode],
  );

  /* ---------------------------------------------------------------- */
  /*  Photo handling                                                   */
  /* ---------------------------------------------------------------- */

  const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhotos((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  }, []);

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Submit                                                           */
  /* ---------------------------------------------------------------- */

  const handleSubmit = useCallback(async () => {
    if (!vin || vin.length !== 17) {
      setError("Please enter a valid 17-character VIN");
      return;
    }

    setStep("submitting");
    setError(null);
    setResult(null);

    try {
      // Simulate step progression for UX feedback
      const progressTimer = setTimeout(() => setStep("generating_listing"), 1500);
      const photoTimer = setTimeout(() => {
        if (photos.length > 0) setStep("processing_photos");
      }, 3000);
      const indexTimer = setTimeout(() => setStep("indexing"), 4500);

      const formData = new FormData();
      formData.append("vin", vin);
      formData.append("dealer_id", dealerId);
      if (price) formData.append("price", price);
      if (mileage) formData.append("mileage", mileage);
      for (const photo of photos) {
        formData.append("photos", photo);
      }

      const res = await fetch("/api/admin/quick-add", {
        method: "POST",
        body: formData,
      });

      clearTimeout(progressTimer);
      clearTimeout(photoTimer);
      clearTimeout(indexTimer);

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to add vehicle");
        setStep("error");
        return;
      }

      setResult(data);
      setStep("done");
    } catch {
      setError("Network error — could not reach the server");
      setStep("error");
    }
  }, [vin, price, mileage, photos, dealerId]);

  /* ---------------------------------------------------------------- */
  /*  Reset                                                            */
  /* ---------------------------------------------------------------- */

  const handleReset = useCallback(() => {
    setVin("");
    setPrice("");
    setMileage("");
    setPhotos([]);
    setDecoded(null);
    setStep("idle");
    setError(null);
    setResult(null);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  // Success screen
  if (step === "done" && result) {
    const v = result.vehicle;
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="rounded-2xl border border-green-700/50 bg-green-900/20 p-6 text-center">
          <CheckIcon className="mx-auto mb-3 h-12 w-12 text-green-400" />
          <h1 className="text-2xl font-bold text-white">Vehicle Added</h1>
          <p className="mt-1 text-gray-300">
            {v.year} {v.make} {v.model} {v.trim}
          </p>
          {v.price > 0 && (
            <p className="mt-1 text-lg font-semibold text-green-400">
              ${v.price.toLocaleString()}
            </p>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Photos" value={String(result.meta.photos_processed)} />
          <StatCard
            label="Confidence"
            value={`${Math.round(result.meta.smart_defaults_confidence * 100)}%`}
          />
        </div>

        {/* Highlights */}
        {result.meta.highlights.length > 0 && (
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
            <h3 className="mb-2 text-sm font-medium text-gray-400">Generated Highlights</h3>
            <ul className="space-y-1">
              {result.meta.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-200">
                  <span className="mt-0.5 text-brand-400">&#x2022;</span>
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <a
            href={`/admin/inventory`}
            className="flex-1 rounded-xl bg-gray-700 px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-gray-600"
          >
            View in Inventory
          </a>
          <button
            onClick={handleReset}
            className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-500"
          >
            Add Another
          </button>
        </div>
      </div>
    );
  }

  // Main form
  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Quick Add Vehicle</h1>
        <p className="mt-1 text-sm text-gray-400">
          Scan VIN, snap photos, done. We handle the rest.
        </p>
      </div>

      {/* VIN Input */}
      <div>
        <label htmlFor="vin" className="mb-1.5 block text-sm font-medium text-gray-300">
          VIN
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              id="vin"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={17}
              placeholder="Scan or type 17-character VIN"
              value={vin}
              onChange={handleVinChange}
              onBlur={() => vin.length === 17 && handleVinDecode(vin)}
              disabled={step === "submitting" || step === "done"}
              className="w-full rounded-xl border border-gray-600 bg-gray-800 px-4 py-3.5 text-[16px] font-mono tracking-wider text-white placeholder-gray-500 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
              style={{ fontSize: "16px" }} /* Prevent iOS zoom */
            />
            <BarcodeIcon className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
          </div>
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            disabled={step === "submitting" || step === "done"}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-500 active:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
            style={{ fontSize: "16px", minWidth: "120px" }}
          >
            <CameraIcon className="h-5 w-5" />
            Scan VIN
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {vin.length}/17 characters
        </p>
      </div>

      {/* VIN Scanner Modal */}
      {showScanner && (
        <ScannerModal
          onDetected={(detectedVin) => {
            setVin(detectedVin);
            setShowScanner(false);
            handleVinDecode(detectedVin);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Decode status */}
      {step === "decoding" && (
        <div className="flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3">
          <Spinner />
          <span className="text-sm text-gray-300">Decoding VIN...</span>
        </div>
      )}

      {/* Decoded specs */}
      {decoded && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
          <h3 className="mb-2 text-sm font-medium text-gray-400">Decoded Specs</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <SpecRow label="Year" value={String(decoded.year)} />
            <SpecRow label="Make" value={decoded.make} />
            <SpecRow label="Model" value={decoded.model} />
            {decoded.trim && <SpecRow label="Trim" value={decoded.trim} />}
            {decoded.body_style && <SpecRow label="Body" value={decoded.body_style} />}
            {decoded.engine && <SpecRow label="Engine" value={decoded.engine} />}
            {decoded.transmission && <SpecRow label="Trans" value={decoded.transmission} />}
            {decoded.drivetrain && <SpecRow label="Drive" value={decoded.drivetrain} />}
            {decoded.fuel_type && <SpecRow label="Fuel" value={decoded.fuel_type} />}
            <SpecRow label="Origin" value={decoded.country_of_origin} />
          </div>
        </div>
      )}

      {/* Price */}
      <div>
        <label htmlFor="price" className="mb-1.5 block text-sm font-medium text-gray-300">
          Price <span className="text-gray-500">(optional -- we can suggest one)</span>
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500">$</span>
          <input
            id="price"
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={step === "submitting" || step === "done"}
            className="w-full rounded-xl border border-gray-600 bg-gray-800 py-3.5 pl-8 pr-4 text-[16px] text-white placeholder-gray-500 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      {/* Mileage */}
      <div>
        <label htmlFor="mileage" className="mb-1.5 block text-sm font-medium text-gray-300">
          Mileage
        </label>
        <input
          id="mileage"
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={mileage}
          onChange={(e) => setMileage(e.target.value)}
          disabled={step === "submitting" || step === "done"}
          className="w-full rounded-xl border border-gray-600 bg-gray-800 px-4 py-3.5 text-[16px] text-white placeholder-gray-500 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
          style={{ fontSize: "16px" }}
        />
      </div>

      {/* Photos */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Photos
        </label>

        {/* Upload zone */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={step === "submitting" || step === "done"}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-600 bg-gray-800/30 px-4 py-6 text-sm text-gray-400 transition-colors hover:border-gray-500 hover:bg-gray-800/50 hover:text-gray-300 active:bg-gray-800 disabled:opacity-50"
          style={{ minHeight: "56px" }}
        >
          <CameraIcon className="h-6 w-6" />
          <span>Tap to add photos</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={handlePhotoSelect}
          className="hidden"
        />

        {/* Photo previews */}
        {photos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {photos.map((photo, i) => (
              <div key={i} className="group relative">
                <div className="h-16 w-16 overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(photo)}
                    alt={`Photo ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ minWidth: "20px", minHeight: "20px" }}
                >
                  x
                </button>
                {i === 0 && (
                  <span className="absolute -left-1 -top-1 rounded bg-brand-600 px-1 py-0.5 text-[10px] font-medium text-white">
                    Primary
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-1 text-xs text-gray-500">
          {photos.length} photo{photos.length !== 1 ? "s" : ""} selected
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Progress indicator */}
      {(step === "submitting" || step === "generating_listing" || step === "processing_photos" || step === "indexing") && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-700/50 bg-brand-900/20 px-4 py-3">
          <Spinner />
          <span className="text-sm text-brand-300">
            {step === "submitting" && "Decoding VIN..."}
            {step === "generating_listing" && "Generating listing..."}
            {step === "processing_photos" && "Processing photos..."}
            {step === "indexing" && "Indexing for search..."}
          </span>
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={
          vin.length !== 17 ||
          step === "submitting" ||
          step === "generating_listing" ||
          step === "processing_photos" ||
          step === "indexing" ||
          step === "decoding"
        }
        className="w-full rounded-xl bg-green-600 px-4 py-4 text-base font-semibold text-white shadow-lg transition-colors hover:bg-green-500 active:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
        style={{ minHeight: "56px", fontSize: "16px" }}
      >
        Add to Inventory
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scanner Modal                                                      */
/* ------------------------------------------------------------------ */

function ScannerModal({
  onDetected,
  onClose,
}: {
  onDetected: (vin: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasBarcodeApi, setHasBarcodeApi] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Check BarcodeDetector availability
    const hasApi = typeof window !== "undefined" && "BarcodeDetector" in window;
    setHasBarcodeApi(hasApi);

    // Start camera
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Start barcode detection polling if API available
        if (hasApi && videoRef.current) {
          const detector = new (window as any).BarcodeDetector({
            formats: ["code_39", "code_128"],
          });

          intervalRef.current = setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            try {
              const barcodes = await detector.detect(videoRef.current);
              for (const barcode of barcodes) {
                const raw = barcode.rawValue?.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "") ?? "";
                if (raw.length === 17) {
                  // Valid VIN detected
                  cleanup();
                  onDetected(raw);
                  return;
                }
              }
            } catch {
              // Detection frame error — ignore and retry
            }
          }, 500);
        }
      } catch (err) {
        if (!cancelled) {
          setCameraError(
            "Could not access camera. Please check permissions or enter VIN manually.",
          );
        }
      }
    })();

    function cleanup() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [onDetected]);

  const handleClose = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    onClose();
  };

  return (
    <div className="rounded-2xl border border-brand-600 bg-gray-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">VIN Barcode Scanner</h3>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700"
        >
          Close
        </button>
      </div>

      {cameraError ? (
        <div className="rounded-xl border border-red-700/50 bg-red-900/20 px-4 py-6 text-center">
          <p className="text-sm text-red-300">{cameraError}</p>
          <p className="mt-2 text-xs text-gray-500">
            Try entering the VIN manually instead.
          </p>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-xl bg-black">
            {/* Camera feed */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full"
              style={{ maxHeight: "300px", objectFit: "cover" }}
            />

            {/* Scan overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-16 w-4/5 rounded border-2 border-brand-400/60" />
            </div>
          </div>

          {!hasBarcodeApi && (
            <p className="mt-2 text-center text-xs text-yellow-400">
              Barcode detection not supported in this browser. Point the camera
              at the VIN barcode and enter it manually.
            </p>
          )}

          {hasBarcodeApi && (
            <p className="mt-2 text-center text-xs text-gray-400">
              Point the camera at the VIN barcode. Detection is automatic.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200">{value}</span>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-3 text-center">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-brand-400"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline SVG icons                                                   */
/* ------------------------------------------------------------------ */

function BarcodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625v2.25m0 3v.375m0-3.375h1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125H13.5m3.375-3.375h.375m0 0h.375m-7.5 0h3.375" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
