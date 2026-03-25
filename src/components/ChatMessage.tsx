"use client";

import { useCallback } from "react";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  suggested_actions?: string[];
}

interface ChatMessageProps {
  message: ChatMessageData;
  onActionClick?: (action: string) => void;
}

/**
 * Renders links in message text as clickable anchor tags.
 * Handles both explicit URLs and internal /path links.
 */
function renderContent(text: string) {
  // Split on markdown-style links [text](url) or bare URLs
  const parts: (string | JSX.Element)[] = [];
  // Match [label](/path) or [label](https://...) markdown links
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mdLinkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const label = match[1];
    const href = match[2];
    parts.push(
      <a
        key={`link-${match.index}`}
        href={href}
        className="font-medium underline underline-offset-2 hover:opacity-80"
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      >
        {label}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ChatMessage({ message, onActionClick }: ChatMessageProps) {
  const isUser = message.role === "user";

  const handleAction = useCallback(
    (action: string) => {
      onActionClick?.(action);
    },
    [onActionClick],
  );

  return (
    <div
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"} group px-4 py-1`}
    >
      <div className="flex max-w-[85%] flex-col gap-1">
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "rounded-br-md bg-brand-600 text-white"
              : "rounded-bl-md bg-gray-100 text-gray-800"
          }`}
        >
          {renderContent(message.content)}
        </div>

        {/* Suggested actions — only on assistant messages */}
        {!isUser && message.suggested_actions && message.suggested_actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {message.suggested_actions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => handleAction(action)}
                className="rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50 hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1"
              >
                {action}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp — visible on hover */}
        <span
          className={`text-[10px] text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 ${
            isUser ? "text-right" : "text-left"
          }`}
          aria-hidden="true"
        >
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}
