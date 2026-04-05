import type { Metadata } from "next";
import { getDealerConfig } from "@/lib/dealer-config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy policy — how we collect, use, and protect your personal information.",
};

export default async function PrivacyPolicyPage() {
  const dealer = await getDealerConfig();
  return (
    <div className="bg-brand-950 text-gray-200">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-brand-400">
          Last updated: March 26, 2026
        </p>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-gray-300">
          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              1. Information We Collect
            </h2>

            <h3 className="mt-4 text-base font-medium text-gray-100">
              1.1 Information You Provide
            </h3>
            <p className="mt-2">
              When you submit a contact form, lead inquiry, or financing
              application, we collect the personal information you provide,
              including:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>First and last name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Message content and subject</li>
              <li>Vehicle preferences and interests</li>
            </ul>

            <h3 className="mt-4 text-base font-medium text-gray-100">
              1.2 Information Collected Automatically
            </h3>
            <p className="mt-2">
              When you browse our website, we automatically collect usage data
              to improve your experience:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>Pages visited and time spent on each page</li>
              <li>Clicks, scroll depth, and navigation patterns</li>
              <li>Search queries entered on the site</li>
              <li>Chat messages with our virtual assistant</li>
              <li>Form interactions (which fields are focused, not the values entered)</li>
              <li>Device type, viewport size, and browser information</li>
              <li>Referrer URL (how you found our site)</li>
            </ul>
            <p className="mt-2">
              This data is collected using anonymous session identifiers. We do
              not use third-party tracking pixels or cross-site tracking.
            </p>

            <h3 className="mt-4 text-base font-medium text-gray-100">
              1.3 Information from Chat Interactions
            </h3>
            <p className="mt-2">
              If you use our AI-powered chat assistant, we collect the messages
              you send and the responses provided. Chat transcripts are stored
              to improve response quality and may be linked to your session for
              continuity.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              2. How We Use Your Information
            </h2>
            <p className="mt-2">We use the information we collect to:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>Respond to your inquiries and follow up on leads</li>
              <li>Improve our website experience based on usage patterns</li>
              <li>Analyze site traffic and user behavior in aggregate</li>
              <li>Personalize vehicle recommendations and search results</li>
              <li>Run A/B tests to optimize page layouts and content</li>
              <li>Send transactional emails related to your inquiries</li>
              <li>Detect and prevent fraudulent or abusive activity</li>
            </ul>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              3. Cookies and Local Storage
            </h2>
            <p className="mt-2">We use the following cookies and browser storage:</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-brand-800 text-gray-100">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Purpose</th>
                    <th className="pb-2 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="text-gray-400">
                  <tr className="border-b border-brand-900">
                    <td className="py-2 pr-4 font-mono text-xs">wolfpack_vid</td>
                    <td className="py-2 pr-4">Cookie</td>
                    <td className="py-2 pr-4">
                      A/B testing variant assignment
                    </td>
                    <td className="py-2">30 days</td>
                  </tr>
                  <tr className="border-b border-brand-900">
                    <td className="py-2 pr-4 font-mono text-xs">wolfpack_analytics_session</td>
                    <td className="py-2 pr-4">Session Storage</td>
                    <td className="py-2 pr-4">
                      Anonymous session identifier for analytics
                    </td>
                    <td className="py-2">Browser session</td>
                  </tr>
                  <tr className="border-b border-brand-900">
                    <td className="py-2 pr-4 font-mono text-xs">wolfpack_analytics_fp</td>
                    <td className="py-2 pr-4">Local Storage</td>
                    <td className="py-2 pr-4">
                      Anonymous visitor fingerprint (random ID, no PII)
                    </td>
                    <td className="py-2">Persistent</td>
                  </tr>
                  <tr className="border-b border-brand-900">
                    <td className="py-2 pr-4 font-mono text-xs">cookie_consent</td>
                    <td className="py-2 pr-4">Local Storage</td>
                    <td className="py-2 pr-4">
                      Stores your cookie preference
                    </td>
                    <td className="py-2">Persistent</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-xs">admin session</td>
                    <td className="py-2 pr-4">Cookie</td>
                    <td className="py-2 pr-4">
                      Authentication for dealer admin dashboard
                    </td>
                    <td className="py-2">30 days</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              You can manage your cookie preferences using the consent banner
              that appears on your first visit. Choosing{" "}
              <strong className="text-gray-100">&ldquo;Essential Only&rdquo;</strong> disables the
              A/B testing cookie and non-essential behavioral analytics while
              preserving basic page view tracking needed for site functionality.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              4. Third-Party Services
            </h2>
            <p className="mt-2">
              We use third-party service providers for hosting, email delivery,
              and infrastructure. These providers may process data on our behalf
              but are contractually obligated to use it only for the services we
              request. We do not sell your personal information to third parties.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              5. Data Retention
            </h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>
                <strong className="text-gray-200">Analytics data:</strong> Retained
                for up to 2 years, then automatically purged.
              </li>
              <li>
                <strong className="text-gray-200">Lead and contact submissions:</strong>{" "}
                Retained until you request deletion.
              </li>
              <li>
                <strong className="text-gray-200">Session data:</strong> Expires
                after 30 days of inactivity.
              </li>
              <li>
                <strong className="text-gray-200">Chat transcripts:</strong>{" "}
                Retained for up to 90 days.
              </li>
            </ul>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              6. Your Rights
            </h2>
            <p className="mt-2">You have the right to:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>
                <strong className="text-gray-200">Access</strong> the personal
                information we hold about you.
              </li>
              <li>
                <strong className="text-gray-200">Delete</strong> your personal
                information from our systems.
              </li>
              <li>
                <strong className="text-gray-200">Opt out</strong> of
                non-essential analytics by selecting &ldquo;Essential Only&rdquo; in
                the cookie consent banner.
              </li>
              <li>
                <strong className="text-gray-200">Correct</strong> inaccurate
                personal information.
              </li>
              <li>
                <strong className="text-gray-200">Withdraw consent</strong> for
                data processing at any time.
              </li>
            </ul>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              7. How to Exercise Your Rights
            </h2>
            <p className="mt-2">
              To request access to, correction of, or deletion of your personal
              data, please contact us at:
            </p>
            <p className="mt-2 font-medium text-gray-100">
              <a
                href={`mailto:privacy@${dealer.email.split("@")[1] || "example.com"}`}
                className="text-brand-400 underline hover:text-brand-300"
              >
                privacy@{dealer.email.split("@")[1] || "example.com"}
              </a>
            </p>
            <p className="mt-2">
              We will respond to your request within 30 days. We may ask you to
              verify your identity before processing a deletion request.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              8. California Privacy Rights (CCPA)
            </h2>
            <p className="mt-2">
              If you are a California resident, you have additional rights under
              the California Consumer Privacy Act (CCPA):
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>
                <strong className="text-gray-200">Right to Know:</strong> You
                may request details about the categories and specific pieces of
                personal information we have collected about you.
              </li>
              <li>
                <strong className="text-gray-200">Right to Delete:</strong> You
                may request that we delete your personal information, subject to
                certain exceptions.
              </li>
              <li>
                <strong className="text-gray-200">Right to Opt Out:</strong> We
                do not sell your personal information. There is no need to
                opt out of a sale.
              </li>
              <li>
                <strong className="text-gray-200">
                  Non-Discrimination:
                </strong>{" "}
                We will not discriminate against you for exercising any of your
                CCPA rights.
              </li>
            </ul>
            <p className="mt-2">
              To exercise your CCPA rights, email{" "}
              <a
                href={`mailto:privacy@${dealer.email.split("@")[1] || "example.com"}`}
                className="text-brand-400 underline hover:text-brand-300"
              >
                privacy@{dealer.email.split("@")[1] || "example.com"}
              </a>{" "}
              with the subject line &ldquo;CCPA Request.&rdquo;
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              9. European Privacy Rights (GDPR)
            </h2>
            <p className="mt-2">
              If you are located in the European Economic Area (EEA), United
              Kingdom, or Switzerland, you have additional rights under the
              General Data Protection Regulation (GDPR):
            </p>

            <h3 className="mt-4 text-base font-medium text-gray-100">
              9.1 Legal Basis for Processing
            </h3>
            <p className="mt-2">We process your personal data based on:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>
                <strong className="text-gray-200">Consent:</strong> When you
                voluntarily submit a contact form, chat with our assistant, or
                accept non-essential cookies.
              </li>
              <li>
                <strong className="text-gray-200">Legitimate Interest:</strong>{" "}
                To improve our website, analyze aggregate usage patterns, and
                prevent fraud.
              </li>
              <li>
                <strong className="text-gray-200">Contractual Necessity:</strong>{" "}
                When processing is required to respond to your inquiry or
                complete a transaction.
              </li>
            </ul>

            <h3 className="mt-4 text-base font-medium text-gray-100">
              9.2 Your GDPR Rights
            </h3>
            <p className="mt-2">Under GDPR, you have the right to:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>
                <strong className="text-gray-200">Access:</strong> Request a
                copy of the personal data we hold about you.
              </li>
              <li>
                <strong className="text-gray-200">Rectification:</strong>{" "}
                Request correction of inaccurate or incomplete data.
              </li>
              <li>
                <strong className="text-gray-200">Erasure:</strong> Request
                deletion of your personal data (&ldquo;right to be
                forgotten&rdquo;).
              </li>
              <li>
                <strong className="text-gray-200">Data Portability:</strong>{" "}
                Receive your data in a structured, machine-readable format.
              </li>
              <li>
                <strong className="text-gray-200">Restriction:</strong> Request
                that we restrict processing of your data under certain
                circumstances.
              </li>
              <li>
                <strong className="text-gray-200">Object:</strong> Object to
                processing based on legitimate interest, including profiling.
              </li>
              <li>
                <strong className="text-gray-200">Withdraw Consent:</strong>{" "}
                Where processing is based on consent, you may withdraw it at
                any time without affecting the lawfulness of prior processing.
              </li>
            </ul>

            <h3 className="mt-4 text-base font-medium text-gray-100">
              9.3 Data Protection Officer
            </h3>
            <p className="mt-2">
              For GDPR-related inquiries, you may contact our Data Protection
              Officer at{" "}
              <a
                href={`mailto:dpo@${dealer.email.split("@")[1] || "example.com"}`}
                className="text-brand-400 underline hover:text-brand-300"
              >
                dpo@{dealer.email.split("@")[1] || "example.com"}
              </a>
              .
            </p>

            <h3 className="mt-4 text-base font-medium text-gray-100">
              9.4 Right to Lodge a Complaint
            </h3>
            <p className="mt-2">
              You have the right to lodge a complaint with a supervisory
              authority in your country of residence if you believe our
              processing of your personal data violates applicable data
              protection law.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              10. Data Breach Notification
            </h2>
            <p className="mt-2">
              In the event of a data breach that compromises the security of
              your personal information, we commit to the following:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>
                <strong className="text-gray-200">Timely Notification:</strong>{" "}
                We will notify affected users within 72 hours of discovering a
                breach, consistent with GDPR requirements and industry best
                practices.
              </li>
              <li>
                <strong className="text-gray-200">Notification Content:</strong>{" "}
                Our notification will include: what personal data was affected,
                what steps we are taking to address the breach and mitigate
                potential harm, and what steps you can take to protect yourself.
              </li>
              <li>
                <strong className="text-gray-200">Regulatory Reporting:</strong>{" "}
                We will notify relevant regulatory authorities as required by
                applicable law, including state attorneys general and data
                protection authorities.
              </li>
              <li>
                <strong className="text-gray-200">Ongoing Communication:</strong>{" "}
                We will provide updates as our investigation progresses and
                additional information becomes available.
              </li>
            </ul>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              11. Children&apos;s Privacy
            </h2>
            <p className="mt-2">
              Our website is not directed at children under the age of 13. We do
              not knowingly collect personal information from children under 13.
              If you believe we have inadvertently collected such information,
              please contact us and we will promptly delete it.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              12. Data Security
            </h2>
            <p className="mt-2">
              We implement industry-standard security measures to protect your
              personal information, including encrypted connections (HTTPS),
              input validation, rate limiting, and access controls. However, no
              method of transmission over the internet is 100% secure, and we
              cannot guarantee absolute security.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              13. Changes to This Policy
            </h2>
            <p className="mt-2">
              We may update this Privacy Policy from time to time. We will post
              the revised policy on this page with an updated &ldquo;Last
              updated&rdquo; date. Your continued use of the website after any
              changes constitutes acceptance of the updated policy.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              14. Contact Us
            </h2>
            <p className="mt-2">
              If you have questions about this Privacy Policy, please contact
              us:
            </p>
            <ul className="mt-2 space-y-1 text-gray-400">
              <li>
                Email:{" "}
                <a
                  href={`mailto:privacy@${dealer.email.split("@")[1] || "example.com"}`}
                  className="text-brand-400 underline hover:text-brand-300"
                >
                  privacy@{dealer.email.split("@")[1] || "example.com"}
                </a>
              </li>
              <li>Phone: {dealer.phone}</li>
              <li>Address: {dealer.address}, {dealer.city}, {dealer.state} {dealer.zip}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
