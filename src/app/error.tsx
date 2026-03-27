"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-bold text-gray-900">Something Went Wrong</h1>
        <p className="mt-3 text-gray-600">
          We encountered an unexpected error. Please try again, or contact us if the problem persists.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-brand-700"
          >
            Try Again
          </button>
          <a
            href="/"
            className="rounded-lg border-2 border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50"
          >
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}
