"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface MarketingTemplatePreviewProps {
  html: string;
  size?: "social" | "email" | "flyer" | "auto";
  className?: string;
  showControls?: boolean;
}

const SIZE_STYLES: Record<string, { maxWidth: string; aspectRatio: string }> = {
  social: { maxWidth: "540px", aspectRatio: "1 / 1" },
  email: { maxWidth: "600px", aspectRatio: "3 / 1" },
  flyer: { maxWidth: "500px", aspectRatio: "8.5 / 11" },
  auto: { maxWidth: "100%", aspectRatio: "auto" },
};

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export default function MarketingTemplatePreview({
  html,
  size = "auto",
  className = "",
  showControls = true,
}: MarketingTemplatePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [activeSize, setActiveSize] = useState(size);
  const [copied, setCopied] = useState(false);

  const sizeConfig = SIZE_STYLES[activeSize] || SIZE_STYLES.auto;

  /* Write HTML into iframe */
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  /* Copy HTML to clipboard */
  const handleCopyHtml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = html;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [html]);

  /* Download as image via html2canvas (if available) */
  const handleDownloadImage = useCallback(async () => {
    try {
      const html2canvas = (await import("html2canvas")).default;
      const iframe = iframeRef.current;
      if (!iframe?.contentDocument?.body) return;
      const canvas = await html2canvas(iframe.contentDocument.body, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = "marketing-template.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      // html2canvas not available — fallback message
      alert("Image download requires html2canvas. Copy the HTML instead.");
    }
  }, []);

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Size selector + action buttons */}
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Size tabs */}
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(["social", "email", "flyer", "auto"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setActiveSize(s)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  activeSize === s
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleCopyHtml}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              {copied ? "Copied!" : "Copy HTML"}
            </button>
            <button
              onClick={handleDownloadImage}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              Download Image
            </button>
          </div>
        </div>
      )}

      {/* Preview iframe */}
      <div
        className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
        style={{ maxWidth: sizeConfig.maxWidth }}
      >
        <iframe
          ref={iframeRef}
          title="Template Preview"
          className="w-full border-0"
          style={{ aspectRatio: sizeConfig.aspectRatio, minHeight: "200px" }}
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}
