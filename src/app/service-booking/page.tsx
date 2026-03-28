"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface Slot {
  id: string;
  date: string;
  time: string;
  available: boolean;
}

interface DayOverview {
  date: string;
  available_count: number;
  total: number;
}

type Step = 1 | 2 | 3 | 4 | 5;

const SERVICE_TYPES = [
  { value: "maintenance", label: "Oil Change / Maintenance", icon: "M11.42 15.17l-4.655-2.56A5 5 0 003.03 7.61l4.34-4.34a1.5 1.5 0 012.12 0l4.34 4.34a5 5 0 01-2.735 5l-4.655 2.56z" },
  { value: "repair", label: "Repair / Diagnostics", icon: "" },
  { value: "recall", label: "Recall Service", icon: "" },
  { value: "inspection", label: "State Inspection", icon: "" },
  { value: "detail", label: "Detailing", icon: "" },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateFull(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/* -------------------------------------------------------------------------- */
/* Step indicator                                                              */
/* -------------------------------------------------------------------------- */

function StepIndicator({ current }: { current: Step }) {
  const steps = ["Vehicle", "Service", "Date & Time", "Contact", "Confirm"];
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {steps.map((label, i) => {
        const num = (i + 1) as Step;
        const active = num === current;
        const done = num < current;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                active
                  ? "bg-brand-600 text-white"
                  : done
                  ? "bg-brand-100 text-brand-700"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {done ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                num
              )}
            </div>
            <span className={`hidden text-xs sm:inline ${active ? "font-semibold text-brand-700" : "text-gray-400"}`}>
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className={`h-px w-6 ${num < current ? "bg-brand-300" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function ServiceBookingPage() {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Vehicle
  const [vehicleVin, setVehicleVin] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [mileage, setMileage] = useState("");

  // Step 2: Service type
  const [serviceType, setServiceType] = useState("");

  // Step 3: Date & time
  const [days, setDays] = useState<DayOverview[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Step 4: Contact
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  // Step 5: Confirmation
  const [confirmation, setConfirmation] = useState<any>(null);
  const [submitError, setSubmitError] = useState("");

  // Load day overview when reaching step 3
  useEffect(() => {
    if (step === 3 && days.length === 0) {
      fetch("/api/service/schedule")
        .then((r) => r.json())
        .then((data) => setDays(data.days ?? []))
        .catch(() => {});
    }
  }, [step, days.length]);

  // Load slots when date is selected
  useEffect(() => {
    if (!selectedDate) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    fetch(`/api/service/schedule/slots?date=${selectedDate}&service_type=${serviceType}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [selectedDate, serviceType]);

  const vehicleDesc = vehicleVin
    ? vehicleVin
    : [vehicleYear, vehicleMake, vehicleModel].filter(Boolean).join(" ");

  const handleSubmit = async () => {
    if (!selectedSlot) return;
    setLoading(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/service/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          vehicle_vin: vehicleVin.trim() || undefined,
          vehicle_desc: vehicleDesc || undefined,
          service_type: serviceType,
          slot_id: selectedSlot.id,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfirmation(data.appointment);
        setStep(5);
      } else {
        setSubmitError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-brand-700 text-white">
        <div className="mx-auto max-w-3xl px-4 py-8 text-center">
          <h1 className="text-3xl font-bold">Schedule Service</h1>
          <p className="mt-2 text-brand-200">Book your service appointment online — fast, easy, and confirmed instantly.</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <StepIndicator current={step} />

        {/* Step 1: Vehicle Info */}
        {step === 1 && (
          <div className="rounded-card border border-surface-border bg-white p-6 shadow-card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Vehicle Information</h2>
            <p className="mb-4 text-sm text-gray-500">Enter your VIN for the most accurate service recommendations, or describe your vehicle below.</p>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">VIN (optional)</label>
              <input
                type="text"
                value={vehicleVin}
                onChange={(e) => setVehicleVin(e.target.value.toUpperCase())}
                maxLength={17}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm uppercase tracking-wider focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="1HGCV1F34PA012345"
              />
            </div>

            <div className="mb-1 text-center text-xs font-medium text-gray-400">— OR —</div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Year</label>
                <input type="text" value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="2024" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Make</label>
                <input type="text" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Toyota" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Model</label>
                <input type="text" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Camry" />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">Current Mileage</label>
              <input type="text" value={mileage} onChange={(e) => setMileage(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="45,000" />
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!vehicleVin && !vehicleMake}
                className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Next: Select Service
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Service Type */}
        {step === 2 && (
          <div className="rounded-card border border-surface-border bg-white p-6 shadow-card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">What service do you need?</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {SERVICE_TYPES.map((st) => (
                <button
                  key={st.value}
                  onClick={() => setServiceType(st.value)}
                  className={`rounded-lg border-2 p-4 text-left transition ${
                    serviceType === st.value
                      ? "border-brand-500 bg-brand-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className={`font-medium ${serviceType === st.value ? "text-brand-700" : "text-gray-900"}`}>
                    {st.label}
                  </p>
                </button>
              ))}
            </div>

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep(1)} className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!serviceType}
                className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Next: Choose Date
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Date & Time */}
        {step === 3 && (
          <div className="rounded-card border border-surface-border bg-white p-6 shadow-card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Choose a Date & Time</h2>

            {/* Date picker */}
            <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-7">
              {days.map((d) => (
                <button
                  key={d.date}
                  onClick={() => d.available_count > 0 && setSelectedDate(d.date)}
                  disabled={d.available_count === 0}
                  className={`rounded-lg border-2 p-2 text-center transition ${
                    selectedDate === d.date
                      ? "border-brand-500 bg-brand-50"
                      : d.available_count > 0
                      ? "border-gray-200 hover:border-gray-300"
                      : "border-gray-100 bg-gray-50 opacity-50"
                  }`}
                >
                  <p className="text-xs font-medium text-gray-500">{formatDate(d.date)}</p>
                  <p className={`text-sm font-semibold ${d.available_count > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                    {d.available_count > 0 ? `${d.available_count} open` : "Full"}
                  </p>
                </button>
              ))}
            </div>

            {/* Time slots */}
            {selectedDate && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-700">
                  Available times for {formatDateFull(selectedDate)}
                </h3>
                {loadingSlots ? (
                  <p className="text-sm text-gray-400">Loading slots...</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {slots.map((slot) => (
                      <button
                        key={slot.id}
                        onClick={() => slot.available && setSelectedSlot(slot)}
                        disabled={!slot.available}
                        className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition ${
                          selectedSlot?.id === slot.id
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : slot.available
                            ? "border-gray-200 text-gray-700 hover:border-gray-300"
                            : "border-gray-100 bg-gray-50 text-gray-300 line-through"
                        }`}
                      >
                        {formatTime(slot.time)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep(2)} className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!selectedSlot}
                className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Next: Contact Info
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Contact Info */}
        {step === 4 && (
          <div className="rounded-card border border-surface-border bg-white p-6 shadow-card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Your Contact Information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Full Name *</label>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Jane Smith" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="jane@example.com" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="(555) 123-4567" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label>
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Any special requests or details about the issue..." />
              </div>
            </div>

            {submitError && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{submitError}</div>
            )}

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep(3)} className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!customerName.trim() || !email.trim() || loading}
                className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? "Booking..." : "Confirm Appointment"}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Confirmation */}
        {step === 5 && confirmation && (
          <div className="rounded-card border border-surface-border bg-white p-6 shadow-card text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">Appointment Confirmed!</h2>
            <p className="mt-1 text-sm text-gray-500">Confirmation ID: <span className="font-mono">{confirmation.id}</span></p>

            <div className="mx-auto mt-6 max-w-sm rounded-lg bg-gray-50 p-4 text-left">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Service</dt>
                  <dd className="font-medium text-gray-900 capitalize">{confirmation.service_type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Date</dt>
                  <dd className="font-medium text-gray-900">{formatDateFull(confirmation.appointment_date)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Time</dt>
                  <dd className="font-medium text-gray-900">{formatTime(confirmation.appointment_time)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Vehicle</dt>
                  <dd className="font-medium text-gray-900">{confirmation.vehicle_desc ?? confirmation.vehicle_vin ?? "—"}</dd>
                </div>
              </dl>
            </div>

            <p className="mt-6 text-sm text-gray-500">
              A confirmation email has been sent to <span className="font-medium">{confirmation.email}</span>.
            </p>

            <button
              onClick={() => {
                setStep(1);
                setConfirmation(null);
                setSelectedSlot(null);
                setSelectedDate("");
                setServiceType("");
                setCustomerName("");
                setEmail("");
                setPhone("");
                setNotes("");
              }}
              className="mt-4 rounded-lg border border-brand-300 px-6 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Book Another Appointment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
