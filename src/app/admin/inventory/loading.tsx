export default function InventoryLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded-lg bg-gray-200" />
        <div className="h-10 w-32 rounded-lg bg-gray-200" />
      </div>
      <div className="flex gap-3">
        <div className="h-10 w-64 rounded-lg bg-gray-100" />
        <div className="h-10 w-32 rounded-lg bg-gray-100" />
        <div className="h-10 w-32 rounded-lg bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 h-40 rounded-lg bg-gray-100" />
            <div className="space-y-2">
              <div className="h-5 w-3/4 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-100" />
              <div className="h-6 w-24 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
