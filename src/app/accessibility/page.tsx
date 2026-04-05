import type { Metadata } from "next";
import { getDealerConfig } from "@/lib/dealer-config";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description:
    "Accessibility commitment — our efforts to ensure an inclusive experience for all users.",
};

export default async function AccessibilityPage() {
  const dealer = await getDealerConfig();
  return (
    <div className="bg-brand-950 text-gray-200">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          Accessibility Statement
        </h1>
        <p className="mt-2 text-sm text-brand-400">
          Last updated: March 26, 2026
        </p>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-gray-300">
          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              Our Commitment
            </h2>
            <p className="mt-2">
              {dealer.name} is committed to ensuring that our website is
              accessible to all users, including people with disabilities. We
              strive to conform to the{" "}
              <strong className="text-gray-100">
                Web Content Accessibility Guidelines (WCAG) 2.1 Level AA
              </strong>{" "}
              standards, and we continuously work to improve the user experience
              for everyone.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              Accessibility Features
            </h2>
            <p className="mt-2">
              We have implemented the following features to support
              accessibility:
            </p>
            <ul className="mt-3 list-inside list-disc space-y-2 text-gray-400">
              <li>
                <strong className="text-gray-200">
                  Keyboard Navigation:
                </strong>{" "}
                All interactive elements are reachable and operable using a
                keyboard alone. A &ldquo;Skip to main content&rdquo; link is
                provided at the top of every page.
              </li>
              <li>
                <strong className="text-gray-200">
                  Screen Reader Support:
                </strong>{" "}
                We use semantic HTML elements, ARIA landmarks, and descriptive
                labels so that screen readers can accurately convey the content
                and structure of our pages.
              </li>
              <li>
                <strong className="text-gray-200">Semantic HTML:</strong> Our
                pages use proper heading hierarchy (h1 through h6), landmark
                roles (banner, navigation, main, contentinfo), and structured
                content to support assistive technologies.
              </li>
              <li>
                <strong className="text-gray-200">Alternative Text:</strong>{" "}
                Images include descriptive alt text. Decorative images are
                marked with <code className="text-brand-400">aria-hidden</code>{" "}
                to avoid cluttering screen reader output.
              </li>
              <li>
                <strong className="text-gray-200">Focus Indicators:</strong>{" "}
                Visible focus outlines are provided on all interactive elements
                so keyboard users can track their position on the page.
              </li>
              <li>
                <strong className="text-gray-200">Color Contrast:</strong> Text
                and interactive elements meet WCAG AA minimum contrast ratios.
              </li>
              <li>
                <strong className="text-gray-200">Responsive Design:</strong>{" "}
                The site adapts to different screen sizes and supports text
                resizing up to 200% without loss of content or functionality.
              </li>
              <li>
                <strong className="text-gray-200">Form Labels:</strong> All
                form inputs have associated labels and clear error messages to
                assist users in completing forms.
              </li>
            </ul>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              Known Limitations
            </h2>
            <p className="mt-2">
              Despite our efforts, some areas of the site may have accessibility
              gaps:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>
                Vehicle photo galleries may not have fully descriptive alt text
                for every image in a multi-photo carousel.
              </li>
              <li>
                The AI chat assistant may produce responses that are not
                optimally structured for screen readers.
              </li>
              <li>
                Some third-party embedded content may not meet our accessibility
                standards.
              </li>
            </ul>
            <p className="mt-2">
              We are actively working to address these limitations.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              Reporting Accessibility Issues
            </h2>
            <p className="mt-2">
              If you encounter any accessibility barriers while using our
              website, we want to hear from you. Please contact us with details
              about the issue, including:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>The page URL where the issue occurred</li>
              <li>A description of the problem</li>
              <li>
                The assistive technology you were using (e.g., screen reader
                name and version, browser)
              </li>
            </ul>
            <p className="mt-3">Contact us at:</p>
            <ul className="mt-2 space-y-1 text-gray-400">
              <li>
                Email:{" "}
                <a
                  href={`mailto:accessibility@${dealer.email.split("@")[1] || "example.com"}`}
                  className="text-brand-400 underline hover:text-brand-300"
                >
                  accessibility@{dealer.email.split("@")[1] || "example.com"}
                </a>
              </li>
              <li>Phone: {dealer.phone}</li>
            </ul>
            <p className="mt-2">
              We aim to respond to accessibility feedback within 5 business
              days.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              Third-Party Content
            </h2>
            <p className="mt-2">
              Our website may include content or services provided by third
              parties. While we encourage our partners to follow accessibility
              best practices, we cannot guarantee that all third-party content
              meets WCAG 2.1 Level AA standards. If you encounter issues with
              third-party content on our site, please let us know so we can work
              with the provider to resolve it.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-semibold text-white">
              Standards and Guidelines
            </h2>
            <p className="mt-2">
              This site targets conformance with the following standards:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              <li>
                <a
                  href="https://www.w3.org/TR/WCAG21/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-400 underline hover:text-brand-300"
                >
                  Web Content Accessibility Guidelines (WCAG) 2.1 Level AA
                </a>
              </li>
              <li>
                <a
                  href="https://www.w3.org/WAI/ARIA/apg/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-400 underline hover:text-brand-300"
                >
                  WAI-ARIA Authoring Practices
                </a>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
