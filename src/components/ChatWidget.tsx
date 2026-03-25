"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ChatBubble from "./ChatBubble";
import ChatMessage, { type ChatMessageData } from "./ChatMessage";
import TypingIndicator from "./TypingIndicator";

const STORAGE_KEY = "wolfpack_chat_messages";
const STORAGE_OPEN_KEY = "wolfpack_chat_open";

const WELCOME_MESSAGE: ChatMessageData = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I'm the Wolfpack Motors assistant. I can help you find vehicles, answer questions about financing, or schedule a test drive. How can I help?",
  timestamp: Date.now(),
  suggested_actions: [
    "Browse inventory",
    "Financing options",
    "Schedule test drive",
    "Business hours",
  ],
};

function loadMessages(): ChatMessageData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ChatMessageData[];
  } catch {
    // Ignore corrupt storage
  }
  return [];
}

function saveMessages(messages: ChatMessageData[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Storage full — non-fatal
  }
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(1);
  const [hasInitialized, setHasInitialized] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load persisted messages on mount
  useEffect(() => {
    const saved = loadMessages();
    if (saved.length > 0) {
      setMessages(saved);
      setUnreadCount(0);
    }
    // Check if chat was previously open
    try {
      const wasOpen = sessionStorage.getItem(STORAGE_OPEN_KEY);
      if (wasOpen === "true") {
        setIsOpen(true);
        setUnreadCount(0);
      }
    } catch {
      // Ignore
    }
    setHasInitialized(true);
  }, []);

  // Save messages whenever they change
  useEffect(() => {
    if (hasInitialized && messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages, hasInitialized]);

  // Persist open state
  useEffect(() => {
    if (hasInitialized) {
      try {
        sessionStorage.setItem(STORAGE_OPEN_KEY, String(isOpen));
      } catch {
        // Ignore
      }
    }
  }, [isOpen, hasInitialized]);

  // Auto-scroll to newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      // Small delay so the animation completes before focusing
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Focus trap inside panel
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [isOpen]);

  const toggleChat = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        setUnreadCount(0);
        // Add welcome message if this is the first open and no saved messages
        setMessages((msgs) => {
          if (msgs.length === 0) {
            return [{ ...WELCOME_MESSAGE, timestamp: Date.now() }];
          }
          return msgs;
        });
      }
      return next;
    });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      const userMsg: ChatMessageData = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsTyping(true);

      try {
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history,
          }),
        });

        const data = await res.json();

        const assistantMsg: ChatMessageData = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.response ?? "Sorry, something went wrong. Please try again.",
          timestamp: Date.now(),
          suggested_actions: data.suggested_actions,
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        const errorMsg: ChatMessageData = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content:
            "I'm having trouble connecting right now. You can reach us at (303) 555-1234.",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsTyping(false);
      }
    },
    [isTyping, messages],
  );

  const handleActionClick = useCallback(
    (action: string) => {
      sendMessage(action);
    },
    [sendMessage],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage],
  );

  return (
    <>
      {/* Chat Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Chat with Wolfpack Motors assistant"
          aria-modal="true"
          className="fixed bottom-0 right-0 z-50 flex h-[min(580px,100dvh)] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:bottom-24 sm:right-6 sm:h-[520px] sm:w-[380px] sm:rounded-2xl animate-in slide-in-from-bottom-4 fade-in duration-200"
          style={{
            animation: "slideUp 200ms ease-out",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-brand-600 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <svg
                  width="16"
                  height="16"
                  className="h-4 w-4 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Wolfpack Motors Assistant
                </h2>
                <p className="text-[11px] text-brand-200">
                  Typically replies instantly
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Close chat"
            >
              <svg
                width="18"
                height="18"
                className="h-[18px] w-[18px]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto py-3"
            role="log"
            aria-live="polite"
            aria-label="Chat messages"
          >
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onActionClick={handleActionClick}
              />
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-gray-100 bg-white px-3 py-3"
          >
            <label htmlFor="chat-input" className="sr-only">
              Type your message
            </label>
            <input
              ref={inputRef}
              id="chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              maxLength={500}
              autoComplete="off"
              className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
              disabled={isTyping}
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-all hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 disabled:opacity-40 disabled:hover:bg-brand-600"
              aria-label="Send message"
            >
              <svg
                width="18"
                height="18"
                className="h-[18px] w-[18px]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* Floating Bubble — hidden when panel is open on mobile */}
      <div className={isOpen ? "hidden sm:block" : ""}>
        <ChatBubble onClick={toggleChat} unreadCount={unreadCount} />
      </div>

      {/* Keyframe for slide-up animation */}
      <style jsx global>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
