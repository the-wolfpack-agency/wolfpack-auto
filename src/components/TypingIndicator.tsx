"use client";

export default function TypingIndicator() {
  return (
    <div
      className="flex items-center gap-1 px-4 py-3"
      role="status"
      aria-label="Assistant is typing"
    >
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3">
        <span
          className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400"
          style={{ animationDelay: "0ms", animationDuration: "600ms" }}
        />
        <span
          className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400"
          style={{ animationDelay: "150ms", animationDuration: "600ms" }}
        />
        <span
          className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400"
          style={{ animationDelay: "300ms", animationDuration: "600ms" }}
        />
      </div>
    </div>
  );
}
