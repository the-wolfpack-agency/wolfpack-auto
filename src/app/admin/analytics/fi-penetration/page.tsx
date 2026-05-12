import FIPenetrationHeatmap from "@/components/admin/analytics/fi-penetration/FIPenetrationHeatmap";

export const dynamic = "force-dynamic";

export default function FIPenetrationPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">F&amp;I Product Penetration</h1>
        <p className="mt-1 text-sm text-gray-500">
          See which F&amp;I products each manager is putting into deals, month over month.
          Green cells mean strong attach rates. Lighter colors flag products customers are
          declining — a good place to retrain or repackage.
        </p>
      </header>
      <FIPenetrationHeatmap />
    </div>
  );
}
