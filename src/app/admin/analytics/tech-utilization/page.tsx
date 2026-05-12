import TechUtilizationGrid from "@/components/admin/analytics/tech-utilization/TechUtilizationGrid";

export const dynamic = "force-dynamic";

export default function TechUtilizationPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Service Bay Utilization</h1>
        <p className="mt-1 text-sm text-gray-500">
          Hours billed versus hours available per technician per bay per week. Green
          means a tech and bay are pulling their weight; red flags an underused bay or
          a tech who needs more work routed their way.
        </p>
      </header>
      <TechUtilizationGrid />
    </div>
  );
}
