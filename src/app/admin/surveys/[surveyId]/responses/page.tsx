"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface EnrichedResponse {
  id: string;
  survey_id: string;
  session_id: string | null;
  answers: Array<{ question_id: string; value: string | number }>;
  submitted_at: string;
  page_url: string;
  replay_link: { id: string; session_id: string; linked_at: string } | null;
  replay_url: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function SurveyResponsesPage() {
  const params = useParams();
  const surveyId = params?.surveyId as string;
  const [responses, setResponses] = useState<EnrichedResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!surveyId) return;
    fetch(`/api/admin/surveys/${surveyId}/responses`)
      .then((r) => r.json())
      .then((data) => setResponses(data.responses ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [surveyId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <a href="/admin/surveys" className="text-sm text-blue-600 hover:underline">
          &larr; Back to surveys
        </a>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Survey Responses</h1>
        <p className="mt-1 text-sm text-gray-500">
          {responses.length} response{responses.length !== 1 ? "s" : ""} with session replay links.
        </p>
      </div>

      <div className="space-y-3">
        {responses.map((r) => (
          <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Response #{r.id.slice(-6)}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(r.submitted_at).toLocaleString()} on {r.page_url}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {r.replay_url ? (
                  <a
                    href={r.replay_url}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    View Session
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">No replay</span>
                )}
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {r.answers.map((a, i) => (
                <div key={a.question_id ?? i} className="flex gap-2 text-sm">
                  <span className="text-gray-500">Q{i + 1}:</span>
                  <span className="text-gray-900">
                    {typeof a.value === "number" ? `${a.value}/10` : String(a.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {responses.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            No responses yet.
          </div>
        )}
      </div>
    </div>
  );
}
