import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found | Wolfpack Auto",
  description: "The page you're looking for doesn't exist.",
};

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-md">
        <p className="text-7xl font-bold text-brand-600">404</p>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Page Not Found</h1>
        <p className="mt-3 text-gray-600">
          Sorry, we couldn&apos;t find the page you&apos;re looking for. It may have been moved or no longer exists.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href="/"
            className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-brand-700"
          >
            Go Home
          </a>
          <a
            href="/inventory"
            className="rounded-lg border-2 border-brand-600 px-6 py-3 text-sm font-semibold text-brand-600 transition-all hover:bg-brand-50"
          >
            Browse Inventory
          </a>
        </div>
      </div>
    </div>
  );
}
