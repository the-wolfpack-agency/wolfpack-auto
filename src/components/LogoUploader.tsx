"use client";

import { useState, useRef, useCallback } from "react";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];

interface LogoUploaderProps {
  currentLogoUrl?: string | null;
}

export default function LogoUploader({ currentLogoUrl }: LogoUploaderProps) {
  const [preview, setPreview] = useState<string | null>(currentLogoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setSuccess(false);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Only PNG, JPG, or SVG files are accepted.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("File must be under 2 MB.");
      return;
    }

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    // Upload to API
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);

      const res = await fetch("/api/admin/settings/logo", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed" }));
        setError(body.error ?? `Upload failed (${res.status})`);
        return;
      }

      const data = await res.json();
      if (data.logo_url) {
        setPreview(data.logo_url);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Network error — could not upload logo.");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleRemove = async () => {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch("/api/admin/settings/logo", { method: "DELETE" });
      if (res.ok) {
        setPreview(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    } catch {
      setError("Could not remove logo.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="sm:col-span-2">
      <label className="block text-sm font-medium text-gray-700">Logo</label>
      <div className="mt-2">
        <label
          htmlFor="logo-upload"
          className={`flex cursor-pointer items-center gap-4 rounded-lg border border-dashed p-4 text-sm transition-colors ${
            uploading
              ? "border-gray-300 bg-gray-50 text-gray-400"
              : "border-surface-border text-gray-500 hover:border-brand-500 hover:text-brand-600"
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {preview ? (
            <img
              src={preview}
              alt="Dealer logo preview"
              className="h-12 w-auto shrink-0 rounded object-contain"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-surface-subtle">
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <span className="block font-medium text-gray-700">
              {uploading ? "Uploading..." : preview ? "Click to change logo" : "Click to upload logo"}
            </span>
            <span className="text-xs text-gray-400">
              PNG, JPG, or SVG up to 2 MB — or drag and drop
            </span>
          </div>
        </label>
        <input
          ref={inputRef}
          id="logo-upload"
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          onChange={handleChange}
          disabled={uploading}
          className="sr-only"
        />
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
      {success && (
        <p className="mt-2 text-sm text-green-600">Logo saved successfully.</p>
      )}

      {preview && !uploading && (
        <button
          type="button"
          onClick={handleRemove}
          className="mt-2 text-xs text-gray-500 underline hover:text-red-600"
        >
          Remove logo
        </button>
      )}
    </div>
  );
}
