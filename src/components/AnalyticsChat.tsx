"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  data?: unknown;
  type?: "text" | "table" | "number";
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function AnalyticsChat() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll within the messages container, not the page
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q || loading) return;

      setMessages((prev) => [...prev, { role: "user", text: q }]);
      setQuery("");
      setLoading(true);

      try {
        const data = await fetchJson<{ answer?: string; data?: unknown; type?: "text" | "table" | "number" }>(
          "/api/admin/analytics/query",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: q }),
          },
        );

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: data.answer ?? "No response received.",
            data: data.data,
            type: data.type ?? "text",
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "Sorry, something went wrong. Please try again.",
            type: "text",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [query, loading],
  );

  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      {/* Messages */}
      {messages.length > 0 && (
        <div ref={messagesContainerRef} className="mb-4 max-h-80 space-y-3 overflow-y-auto">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-brand-600 text-white"
                    : "bg-surface-muted text-gray-800"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>

                {/* Table rendering */}
                {msg.type === "table" && Array.isArray(msg.data) && msg.data.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-300">
                          {Object.keys(msg.data[0] as Record<string, unknown>).map((key) => (
                            <th
                              key={key}
                              className="pb-1 pr-3 text-left font-semibold capitalize text-gray-500"
                            >
                              {key.replace(/_/g, " ")}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(msg.data as Record<string, unknown>[]).map((row, ri) => (
                          <tr key={ri} className="border-b border-gray-200 last:border-0">
                            {Object.values(row).map((val, ci) => (
                              <td key={ci} className="py-1 pr-3 text-gray-700">
                                {String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-xl bg-surface-muted px-4 py-2.5 text-sm text-gray-500">
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything... 'How many leads this week?' 'Top vehicles?' 'Conversion rate?'"
          disabled={loading}
          className="flex-1 rounded-xl border border-surface-border bg-surface-muted px-4 py-3 text-[16px] text-gray-900 placeholder-gray-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
          style={{ fontSize: "16px" }}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
          style={{ fontSize: "16px" }}
        >
          Ask
        </button>
      </form>
    </div>
  );
}
