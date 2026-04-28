"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Client-side wrapper around the inventory search input.
 *
 * The native `type="search"` rendering shows an X clear button that
 * empties the input value WITHOUT submitting the form. The URL keeps
 * its `?search=<term>` param, so the server-rendered list stays
 * filtered until the user manually re-submits the (now-empty) form.
 *
 * Listening for the native `search` event (fired by the X clear in
 * Chromium / Safari) and the `input` event going-to-empty (Firefox /
 * keyboard-cleared) lets us route to the same page WITHOUT the search
 * param so the table re-renders unfiltered. We preserve every other
 * query param verbatim.
 */
export function InventorySearchInput({
  defaultValue,
}: {
  defaultValue?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const clearAndNavigate = () => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("search")) return;
      url.searchParams.delete("search");
      // Reset paging so the cleared list lands on page 1.
      url.searchParams.delete("page");
      router.push(`${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ""}`);
    };

    const onSearchEvent = () => {
      if (el.value === "") clearAndNavigate();
    };
    const onInput = () => {
      // Only fire when the X cleared the field — typing one char at a
      // time and not submitting must NOT cause auto-navigation.
      if (el.value === "" && document.activeElement !== el) {
        clearAndNavigate();
      }
    };

    el.addEventListener("search", onSearchEvent);
    el.addEventListener("input", onInput);
    return () => {
      el.removeEventListener("search", onSearchEvent);
      el.removeEventListener("input", onInput);
    };
  }, [router]);

  return (
    <input
      ref={inputRef}
      id="inv-search"
      name="search"
      type="search"
      defaultValue={defaultValue}
      placeholder="Search VIN, make, model, stock #..."
      className="flex-1 rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
    />
  );
}
