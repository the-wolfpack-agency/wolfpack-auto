export default function LeadsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded-lg bg-gray-200" />
        <div className="flex gap-2">
          <div className="h-10 w-28 rounded-lg bg-gray-200" />
          <div className="h-10 w-28 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="mt-2 h-8 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <div className="flex gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 w-20 rounded bg-gray-100" />
            ))}
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-gray-50 px-5 py-3">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-4 w-20 rounded bg-gray-50" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
