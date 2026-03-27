"use client";

import { useCallback, useRef, useState } from "react";
import { trackEvent } from "@/components/Analytics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

interface FieldErrors {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  message?: string;
}

type FormState = "idle" | "submitting" | "success" | "error";

const SUBJECTS = [
  "General Inquiry",
  "Vehicle Question",
  "Schedule Test Drive",
  "Financing Question",
  "Trade-In Appraisal",
  "Service Appointment",
] as const;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[(]?\d{1,4}[)]?[-\s./0-9]*$/;

function validate(data: FormData): FieldErrors {
  const errors: FieldErrors = {};

  if (!data.first_name.trim()) {
    errors.first_name = "First name is required.";
  }
  if (!data.last_name.trim()) {
    errors.last_name = "Last name is required.";
  }
  if (!data.email.trim()) {
    errors.email = "Email address is required.";
  } else if (!EMAIL_RE.test(data.email)) {
    errors.email = "Please enter a valid email address.";
  }
  if (data.phone.trim() && !PHONE_RE.test(data.phone.trim())) {
    errors.phone = "Please enter a valid phone number.";
  }
  if (!data.message.trim()) {
    errors.message = "Message is required.";
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const INITIAL: FormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  subject: "General Inquiry",
  message: "",
};

interface ContactFormProps {
  initialSubject?: string;
  initialMessage?: string;
  vehicleInfo?: string;
}

export default function ContactForm({ initialSubject, initialMessage, vehicleInfo }: ContactFormProps = {}) {
  const [form, setForm] = useState<FormData>({
    ...INITIAL,
    subject: initialSubject ?? INITIAL.subject,
    message: initialMessage ?? INITIAL.message,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<FormState>("idle");
  const [serverError, setServerError] = useState("");
  const firstErrorRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const set = useCallback(
    (field: keyof FormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
        // Clear field error on change
        if (errors[field as keyof FieldErrors]) {
          setErrors((prev) => {
            const next = { ...prev };
            delete next[field as keyof FieldErrors];
            return next;
          });
        }
      },
    [errors],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const fieldErrors = validate(form);
    setErrors(fieldErrors);

    if (Object.keys(fieldErrors).length > 0) {
      // Focus the first errored field
      const firstKey = Object.keys(fieldErrors)[0] as keyof FieldErrors;
      const el = document.getElementById(`contact-${firstKey.replace("_", "-")}`) as HTMLElement | null;
      el?.focus();
      return;
    }

    setState("submitting");
    setServerError("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setState("success");
        trackEvent("contact_form_submission", { subject: form.subject });
        setForm(INITIAL);
        setErrors({});
      } else if (res.status === 429) {
        setState("error");
        setServerError("You have submitted too many messages. Please try again later.");
      } else {
        setState("error");
        setServerError("");
      }
    } catch {
      setState("error");
      setServerError("");
    }
  };

  // Success state
  if (state === "success") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg
            className="h-8 w-8 text-emerald-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="mt-4 text-xl font-bold text-gray-900">Message Sent!</h3>
        <p className="mt-2 text-sm text-gray-600">
          Thanks! We will get back to you within 1 business hour.
        </p>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="mt-6 rounded-lg border border-surface-border px-6 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-surface-subtle"
        >
          Send Another Message
        </button>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
      {/* Error banner */}
      {state === "error" && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <svg
            className="mt-0.5 h-5 w-5 shrink-0 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <p className="text-sm text-red-700">
            {serverError || "Something went wrong. Please call us at (303) 555-1234."}
          </p>
        </div>
      )}

      {/* Name row */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-first-name" className="text-sm font-medium text-gray-700">
            First Name <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="contact-first-name"
            name="first_name"
            type="text"
            required
            value={form.first_name}
            onChange={set("first_name")}
            aria-describedby={errors.first_name ? "error-first-name" : undefined}
            aria-invalid={!!errors.first_name}
            className={`mt-1 w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
              errors.first_name
                ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                : "border-surface-border focus:border-brand-500 focus:ring-brand-500/20"
            }`}
            placeholder="John"
            ref={(el) => {
              if (errors.first_name && !firstErrorRef.current) firstErrorRef.current = el;
            }}
          />
          {errors.first_name && (
            <p id="error-first-name" className="mt-1 text-xs text-red-600" role="alert">
              {errors.first_name}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="contact-last-name" className="text-sm font-medium text-gray-700">
            Last Name <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="contact-last-name"
            name="last_name"
            type="text"
            required
            value={form.last_name}
            onChange={set("last_name")}
            aria-describedby={errors.last_name ? "error-last-name" : undefined}
            aria-invalid={!!errors.last_name}
            className={`mt-1 w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
              errors.last_name
                ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                : "border-surface-border focus:border-brand-500 focus:ring-brand-500/20"
            }`}
            placeholder="Smith"
          />
          {errors.last_name && (
            <p id="error-last-name" className="mt-1 text-xs text-red-600" role="alert">
              {errors.last_name}
            </p>
          )}
        </div>
      </div>

      {/* Email + Phone */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-email" className="text-sm font-medium text-gray-700">
            Email Address <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            value={form.email}
            onChange={set("email")}
            aria-describedby={errors.email ? "error-email" : undefined}
            aria-invalid={!!errors.email}
            className={`mt-1 w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
              errors.email
                ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                : "border-surface-border focus:border-brand-500 focus:ring-brand-500/20"
            }`}
            placeholder="john@example.com"
          />
          {errors.email && (
            <p id="error-email" className="mt-1 text-xs text-red-600" role="alert">
              {errors.email}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="contact-phone" className="text-sm font-medium text-gray-700">
            Phone Number
          </label>
          <input
            id="contact-phone"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={set("phone")}
            aria-describedby={errors.phone ? "error-phone" : undefined}
            aria-invalid={!!errors.phone}
            className={`mt-1 w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
              errors.phone
                ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                : "border-surface-border focus:border-brand-500 focus:ring-brand-500/20"
            }`}
            placeholder="(303) 555-0000"
          />
          {errors.phone && (
            <p id="error-phone" className="mt-1 text-xs text-red-600" role="alert">
              {errors.phone}
            </p>
          )}
        </div>
      </div>

      {/* Subject */}
      <div>
        <label htmlFor="contact-subject" className="text-sm font-medium text-gray-700">
          What can we help with?
        </label>
        <select
          id="contact-subject"
          name="subject"
          value={form.subject}
          onChange={set("subject")}
          className="mt-1 w-full rounded-lg border border-surface-border px-4 py-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Message */}
      <div>
        <label htmlFor="contact-message" className="text-sm font-medium text-gray-700">
          Message <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          value={form.message}
          onChange={set("message")}
          aria-describedby={errors.message ? "error-message" : undefined}
          aria-invalid={!!errors.message}
          className={`mt-1 w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
            errors.message
              ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
              : "border-surface-border focus:border-brand-500 focus:ring-brand-500/20"
          }`}
          placeholder="Tell us how we can help..."
        />
        {errors.message && (
          <p id="error-message" className="mt-1 text-xs text-red-600" role="alert">
            {errors.message}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={state === "submitting"}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:bg-brand-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {state === "submitting" ? (
          <>
            <svg
              className="h-5 w-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Sending...
          </>
        ) : (
          <>
            <svg
              width="20"
              height="20"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
              />
            </svg>
            Send Message
          </>
        )}
      </button>
    </form>
  );
}
