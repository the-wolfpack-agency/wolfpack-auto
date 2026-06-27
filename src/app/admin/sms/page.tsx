"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Conversation {
  lead_id: string;
  lead_name: string;
  phone: string;
  last_message: string;
  last_message_at: string;
  message_count: number;
  unread: number;
}

interface Message {
  id: string;
  lead_id: string | null;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  body: string;
  status: string;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function SMSPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [composeTo, setComposeTo] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    fetchJson<{ conversations?: Conversation[]; config?: { configured?: boolean } }>("/api/admin/sms")
      .then((data) => {
        setConversations(data.conversations ?? []);
        setConfigured(data.config?.configured ?? false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectConversation = useCallback(async (conv: Conversation) => {
    setSelected(conv);
    try {
      const data = await fetchJson<{ messages?: Message[] }>(`/api/admin/sms?lead_id=${conv.lead_id}`);
      setMessages(data.messages ?? []);
    } catch {
      setMessages([]);
    }
  }, []);

  const handleSend = useCallback(async () => {
    const to = selected?.phone ?? composeTo;
    if (!to || !composeBody.trim()) return;
    setSending(true);
    try {
      await fetch("/api/admin/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          message: composeBody,
          lead_id: selected?.lead_id,
        }),
      });
      setComposeBody("");
      // Reload messages
      if (selected) {
        const data = await fetchJson<{ messages?: Message[] }>(`/api/admin/sms?lead_id=${selected.lead_id}`);
        setMessages(data.messages ?? []);
      }
    } catch {
      // swallow
    } finally {
      setSending(false);
    }
  }, [selected, composeTo, composeBody]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SMS Messaging</h1>
          <p className="mt-1 text-sm text-gray-500">
            Text message conversations with leads and customers via Twilio.
          </p>
        </div>
        {!configured && (
          <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            Twilio not configured
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Conversation List */}
        <div className="rounded-lg border border-gray-200 bg-white lg:col-span-1">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Conversations</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {conversations.map((conv) => (
              <button
                key={conv.lead_id}
                onClick={() => selectConversation(conv)}
                className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                  selected?.lead_id === conv.lead_id ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">{conv.lead_name}</p>
                  {conv.unread > 0 && (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {conv.unread}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500">{conv.last_message}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {new Date(conv.last_message_at).toLocaleString()}
                </p>
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-500">
                No conversations yet
              </p>
            )}
          </div>
        </div>

        {/* Message Thread */}
        <div className="rounded-lg border border-gray-200 bg-white lg:col-span-2">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              {selected ? `${selected.lead_name} - ${selected.phone}` : "Select a conversation"}
            </h2>
          </div>

          {selected ? (
            <>
              <div className="h-80 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                        msg.direction === "outbound"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                    >
                      <p>{msg.body}</p>
                      <p className={`mt-1 text-xs ${msg.direction === "outbound" ? "text-blue-200" : "text-gray-400"}`}>
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Type a message..."
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !composeBody.trim()}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {sending ? "..." : "Send"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-80 items-center justify-center text-sm text-gray-500">
              Select a conversation or compose a new message
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
