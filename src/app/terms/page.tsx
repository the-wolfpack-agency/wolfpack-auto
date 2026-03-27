import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Wolfpack Motors terms of service — rules and conditions for using our website.",
};

export default function TermsOfServicePage() {
  return (
    <div className="bg-brand-950 text-gray-200">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-brand-400">
          Last updated: March 26, 2026
        </p>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-gray-300">
          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              1. Acceptance of Terms
            </h2>
            <p className="mt-2">
              By accessing or using the Wolfpack Motors website
              (&ldquo;Site&rdquo;), you agree to be bound by these Terms of
              Service (&ldquo;Terms&rdquo;). If you do not agree to these Terms,
              you may not use the Site. We reserve the right to modify these
              Terms at any time, and your continued use of the Site constitutes
              acceptance of any changes.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              2. Use of Website
            </h2>
            <p className="mt-2">
              The Site is provided for informational purposes only. You may
              browse vehicle listings, submit inquiries, and use the tools
              available on the Site for personal, non-commercial purposes. You
              agree not to:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>Use the Site for any unlawful purpose</li>
              <li>
                Scrape, crawl, or harvest data from the Site using automated
                tools without our written permission
              </li>
              <li>
                Attempt to gain unauthorized access to any part of the Site or
                its systems
              </li>
              <li>
                Transmit viruses, malware, or any other harmful code
              </li>
              <li>
                Impersonate another person or entity when submitting inquiries
              </li>
              <li>
                Interfere with or disrupt the operation of the Site
              </li>
            </ul>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              3. Vehicle Listings Disclaimer
            </h2>
            <p className="mt-2">
              All vehicle listings, including pricing, specifications, mileage,
              features, and availability, are provided for informational
              purposes only and are subject to change without notice. Listing a
              vehicle on the Site does not constitute an offer to sell.
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>
                Prices displayed may not include taxes, registration fees,
                dealer fees, or other applicable charges.
              </li>
              <li>
                Vehicle availability is not guaranteed. A listed vehicle may
                have been sold, reserved, or removed at any time.
              </li>
              <li>
                Photos may not reflect the exact vehicle. Colors may appear
                differently depending on your display settings.
              </li>
              <li>
                Mileage and specifications are sourced from manufacturer data
                and third-party providers and may contain errors.
              </li>
            </ul>
            <p className="mt-2">
              We encourage you to verify all details in person before making a
              purchase decision.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              4. User Accounts
            </h2>
            <p className="mt-2">
              Certain areas of the Site, such as the dealer administration
              dashboard, require authentication. If you are provided with
              account credentials, you are responsible for maintaining the
              confidentiality of your login information and for all activities
              that occur under your account. You must notify us immediately of
              any unauthorized use.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              5. Intellectual Property
            </h2>
            <p className="mt-2">
              All content on the Site, including text, graphics, logos, images,
              software, and the overall design and layout, is the property of
              Wolfpack Motors or its licensors and is protected by copyright,
              trademark, and other intellectual property laws. You may not
              reproduce, distribute, modify, or create derivative works from any
              content on the Site without our prior written consent.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              6. User Submissions
            </h2>
            <p className="mt-2">
              When you submit content through the Site (such as contact form
              messages, chat conversations, or reviews), you grant us a
              non-exclusive, royalty-free license to use, store, and process
              that content for the purposes of providing our services, including
              responding to your inquiries and improving our offerings.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              7. Limitation of Liability
            </h2>
            <p className="mt-2">
              To the fullest extent permitted by law, Wolfpack Motors and its
              officers, directors, employees, and agents shall not be liable for
              any indirect, incidental, special, consequential, or punitive
              damages arising out of or related to your use of the Site,
              including but not limited to:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>Errors or inaccuracies in vehicle listings</li>
              <li>Loss of data or unauthorized access to your information</li>
              <li>
                Any transaction or agreement entered into based on information
                found on the Site
              </li>
              <li>Service interruptions or technical failures</li>
            </ul>
            <p className="mt-2">
              In no event shall our total liability exceed the amount you paid
              to us, if any, in the twelve months preceding the claim.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              8. Disclaimer of Warranties
            </h2>
            <p className="mt-2">
              THE SITE AND ALL CONTENT, FEATURES, AND SERVICES ARE PROVIDED ON
              AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS
              WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
              INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
              NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SITE WILL BE
              UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL
              COMPONENTS.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              9. Indemnification
            </h2>
            <p className="mt-2">
              You agree to indemnify and hold harmless Wolfpack Motors and its
              affiliates from any claims, damages, losses, or expenses
              (including reasonable attorney fees) arising from your use of the
              Site or your violation of these Terms.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              10. Governing Law
            </h2>
            <p className="mt-2">
              These Terms shall be governed by and construed in accordance with
              the laws of the State of Colorado, without regard to its conflict
              of law provisions. Any disputes arising from these Terms or your
              use of the Site shall be resolved exclusively in the state or
              federal courts located in Denver, Colorado.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              11. Third-Party Links
            </h2>
            <p className="mt-2">
              The Site may contain links to third-party websites or services
              that are not owned or controlled by Wolfpack Motors. We are not
              responsible for the content, privacy policies, or practices of any
              third-party sites. You access them at your own risk.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              12. Changes to These Terms
            </h2>
            <p className="mt-2">
              We reserve the right to update or modify these Terms at any time.
              Changes will be posted on this page with an updated &ldquo;Last
              updated&rdquo; date. We encourage you to review these Terms
              periodically. Your continued use of the Site after changes are
              posted constitutes your acceptance of the revised Terms.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              13. Severability
            </h2>
            <p className="mt-2">
              If any provision of these Terms is found to be invalid or
              unenforceable, the remaining provisions shall continue in full
              force and effect.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              14. Contact Us
            </h2>
            <p className="mt-2">
              If you have questions about these Terms of Service, please
              contact us:
            </p>
            <ul className="mt-2 space-y-1 text-gray-400">
              <li>
                Email:{" "}
                <a
                  href="mailto:legal@wolfpackmotors.com"
                  className="text-brand-400 underline hover:text-brand-300"
                >
                  legal@wolfpackmotors.com
                </a>
              </li>
              <li>Phone: (303) 555-1234</li>
              <li>Address: 1234 Auto Drive, Denver, CO 80202</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
