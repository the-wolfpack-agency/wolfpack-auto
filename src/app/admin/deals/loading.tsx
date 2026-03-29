export default function DealsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded-lg bg-gray-200" />
        <div className="h-10 w-32 rounded-lg bg-gray-200" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="mt-2 h-8 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="h-5 w-32 rounded bg-gray-200" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-gray-50" />
          ))}
        </div>
      </div>
    </div>
  );
}
