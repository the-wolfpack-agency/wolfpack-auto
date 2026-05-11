"use client";

/**
 * FAQAccordion — keyboard-accessible disclosure list.
 *
 * Pattern: each row is a <button aria-expanded aria-controls> + a
 * <region role="region" aria-labelledby> with the answer. Multiple
 * panels can be open at once (each independent). This matches the
 * WAI-ARIA "Disclosure (Show/Hide)" pattern, which is the right one
 * for FAQs — not the tablist "Accordion" pattern (which forces
 * single-selection and roving tabindex).
 *
 * Keyboard:
 *   - Enter / Space toggles the focused row (native button behavior).
 *   - Tab moves between rows (native focus order).
 *   - There is no roving-focus arrow-key nav by design — it would
 *     trap keyboard users and violate the disclosure pattern.
 */

import { useState, useId, useCallback, type ReactNode } from "react";

export interface FAQAccordionItem {
  id: string;
  question: string;
  answer: ReactNode;
}

export interface FAQAccordionProps {
  items: ReadonlyArray<FAQAccordionItem>;
  /**
   * Optional callback when an item is toggled. Wired up by the
   * pricing page so the analytics layer can record `pricing.faq_opened`
   * without coupling this component to the analytics module.
   */
  onToggle?: (id: string, open: boolean) => void;
  /** Optional className for the outer <dl>. */
  className?: string;
}

export default function FAQAccordion({
  items,
  onToggle,
  className,
}: FAQAccordionProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const reactId = useId();

  const toggle = useCallback(
    (id: string) => {
      setOpenIds((prev) => {
        const next = new Set(prev);
        const willOpen = !next.has(id);
        if (willOpen) {
          next.add(id);
        } else {
          next.delete(id);
        }
        if (onToggle) onToggle(id, willOpen);
        return next;
      });
    },
    [onToggle],
  );

  return (
    <dl className={className || "divide-y divide-surface-border rounded-2xl border border-surface-border bg-white"}>
      {items.map((item) => {
        const isOpen = openIds.has(item.id);
        const panelId = `${reactId}-panel-${item.id}`;
        const buttonId = `${reactId}-button-${item.id}`;
        return (
          <div key={item.id} data-faq-item={item.id} className="px-6">
            <dt>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="flex w-full items-center justify-between py-5 text-left text-base font-semibold text-gray-900 transition-colors hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus-visible:rounded-md"
              >
                <span>{item.question}</span>
                <svg
                  aria-hidden="true"
                  className={`ml-4 h-5 w-5 shrink-0 text-brand-600 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
            </dt>
            <dd
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="pb-5 text-sm leading-relaxed text-gray-600"
            >
              {item.answer}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
