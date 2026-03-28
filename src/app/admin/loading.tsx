export default function AdminLoading() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-600" />
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    </div>
  );
}
