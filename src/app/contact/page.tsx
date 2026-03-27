import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import { getDealerConfig } from "@/lib/dealer-config";

export async function generateMetadata(): Promise<Metadata> {
  const dealer = await getDealerConfig();
  return {
    title: "Contact Us",
    description: `Get in touch with ${dealer.name}. Visit our ${dealer.city} showroom, call us, or send a message. We respond within 1 business hour.`,
    openGraph: {
      title: `Contact Us | ${dealer.name}`,
      description: `Get in touch with ${dealer.name}. Visit our ${dealer.city} showroom, call us, or send a message. We respond within 1 business hour.`,
      type: "website",
    },
  };
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const dealer = await getDealerConfig();
  const phoneHref = `tel:+1${dealer.phone.replace(/\D/g, "")}`;
  const subjectParam = typeof sp.subject === "string" ? sp.subject : undefined;
  const vehicleParam = typeof sp.vehicle === "string" ? sp.vehicle : undefined;
  const vinParam = typeof sp.vin === "string" ? sp.vin : undefined;

  // Map URL subject to form subject
  const subjectMap: Record<string, string> = {
    price_request: "Vehicle Question",
    test_drive: "Schedule Test Drive",
  };
  const initialSubject = subjectParam ? subjectMap[subjectParam] ?? "General Inquiry" : undefined;

  // Build pre-filled message from vehicle context
  let initialMessage = "";
  if (vehicleParam && subjectParam === "price_request") {
    initialMessage = `I'm interested in the ${vehicleParam}${vinParam ? ` (VIN: ${vinParam})` : ""}. Could you please send me the best price?`;
  } else if (vehicleParam && subjectParam === "test_drive") {
    initialMessage = `I'd like to schedule a test drive for the ${vehicleParam}${vinParam ? ` (VIN: ${vinParam})` : ""}. What times are available?`;
  }
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-300">Get in Touch</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Contact Us
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-200">
            Have a question? We are here to help. Reach out and we will respond within 1 business hour.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-5">
          {/* Contact Form */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-surface-border bg-white p-8 shadow-card sm:p-10">
              <h2 className="text-2xl font-bold text-gray-900">Send Us a Message</h2>
              <p className="mt-2 text-sm text-gray-600">
                Fill out the form below and a team member will be in touch shortly.
              </p>

              <ContactForm
                initialSubject={initialSubject}
                initialMessage={initialMessage}
                vehicleInfo={vehicleParam}
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6 lg:col-span-2">
            {/* Response Badge */}
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                <svg width="20" height="20" className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-800">Fast Response</p>
                <p className="text-xs text-emerald-700">We respond within 1 business hour</p>
              </div>
            </div>

            {/* Contact Info Card */}
            <div className="rounded-2xl border border-surface-border bg-white p-8 shadow-card">
              <h3 className="text-lg font-bold text-gray-900">Dealership Information</h3>
              <div className="mt-6 space-y-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <svg width="20" height="20" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Address</p>
                    <p className="mt-0.5 text-sm text-gray-600">
                      {dealer.address}<br />
                      {dealer.city}, {dealer.state} {dealer.zip}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <svg width="20" height="20" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Phone</p>
                    <a href={phoneHref} className="mt-0.5 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700">
                      {dealer.phone}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <svg width="20" height="20" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Email</p>
                    <a href={`mailto:${dealer.email}`} className="mt-0.5 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700">
                      {dealer.email}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Hours Card */}
            <div className="rounded-2xl border border-surface-border bg-white p-8 shadow-card">
              <h3 className="text-lg font-bold text-gray-900">Business Hours</h3>
              <div className="mt-4 space-y-3">
                {Object.entries(dealer.business_hours).map(([day, hours]) => (
                  <div key={day} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{day}</span>
                    <span className="font-medium text-gray-900">{hours}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700">Open Now</span>
              </div>
            </div>

            {/* Google Map */}
            <div className="overflow-hidden rounded-2xl border border-surface-border shadow-card">
              <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3067.2!2d-104.9903!3d39.7392!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMznCsDQ0JzIxLjEiTiAxMDTCsDU5JzI1LjEiVw!5e0!3m2!1sen!2sus!4v1"
                  className="absolute inset-0 h-full w-full border-0"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`${dealer.name} location - ${dealer.city}, ${dealer.state}`}
                />
              </div>
              <div className="bg-white p-4 text-center">
                <a
                  href="https://www.google.com/maps/dir//39.7392,-104.9903"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
                >
                  Get Directions &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
