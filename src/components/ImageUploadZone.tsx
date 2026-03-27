"use client";

import { useCallback, useRef, useState } from "react";
import type { VehiclePhoto } from "@/types/vehicle";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface UploadProgress {
  file: File;
  progress: number;
  status: "uploading" | "done" | "error";
  url?: string;
  error?: string;
}

interface ImageUploadZoneProps {
  dealerId: string;
  vin: string;
  existingPhotos?: VehiclePhoto[];
  onChange: (photos: VehiclePhoto[]) => void;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ImageUploadZone({
  dealerId,
  vin,
  existingPhotos = [],
  onChange,
}: ImageUploadZoneProps) {
  const [photos, setPhotos] = useState<VehiclePhoto[]>(existingPhotos);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ---------------------------------------------------------------------- */
  /* Upload a single file                                                   */
  /* ---------------------------------------------------------------------- */

  const uploadFile = useCallback(
    async (file: File, sortOrder: number) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("dealer_id", dealerId);
      formData.append("vin", vin);

      try {
        const res = await fetch("/api/images/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json();
        const url = data.variants?.webp ?? data.variants?.jpeg ?? "";

        return {
          url,
          alt: `${vin} photo ${sortOrder + 1}`,
          sort_order: sortOrder,
          is_primary: sortOrder === 0 && photos.length === 0,
        } satisfies VehiclePhoto;
      } catch (err) {
        throw err;
      }
    },
    [dealerId, vin, photos.length],
  );

  /* ---------------------------------------------------------------------- */
  /* Handle file selection (from drop or browse)                            */
  /* ---------------------------------------------------------------------- */

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArr = Array.from(files);
      const validFiles = fileArr.filter((f) => {
        if (!ACCEPTED_TYPES.includes(f.type)) return false;
        if (f.size > MAX_FILE_SIZE) return false;
        return true;
      });

      if (validFiles.length === 0) return;

      // Initialize upload progress entries
      const progressEntries: UploadProgress[] = validFiles.map((f) => ({
        file: f,
        progress: 0,
        status: "uploading",
      }));
      setUploads((prev) => [...prev, ...progressEntries]);

      const newPhotos: VehiclePhoto[] = [];
      const baseOrder = photos.length;

      for (let i = 0; i < validFiles.length; i++) {
        try {
          const photo = await uploadFile(validFiles[i], baseOrder + i);
          newPhotos.push(photo);

          setUploads((prev) =>
            prev.map((u) =>
              u.file === validFiles[i]
                ? { ...u, progress: 100, status: "done", url: photo.url }
                : u,
            ),
          );
        } catch (err: any) {
          setUploads((prev) =>
            prev.map((u) =>
              u.file === validFiles[i]
                ? { ...u, status: "error", error: err.message }
                : u,
            ),
          );
        }
      }

      if (newPhotos.length > 0) {
        const updated = [...photos, ...newPhotos];
        setPhotos(updated);
        onChange(updated);

        // Clear completed uploads after a delay
        setTimeout(() => {
          setUploads((prev) => prev.filter((u) => u.status === "uploading"));
        }, 2000);
      }
    },
    [photos, onChange, uploadFile],
  );

  /* ---------------------------------------------------------------------- */
  /* Drag & Drop handlers                                                   */
  /* ---------------------------------------------------------------------- */

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files?.length) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  /* ---------------------------------------------------------------------- */
  /* Reorder via drag                                                       */
  /* ---------------------------------------------------------------------- */

  const onThumbDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const onThumbDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;

    const reordered = [...photos];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);

    // Update sort_order and is_primary
    const updated = reordered.map((p, i) => ({
      ...p,
      sort_order: i,
      is_primary: i === 0,
    }));

    setDragIdx(idx);
    setPhotos(updated);
    onChange(updated);
  };

  const onThumbDragEnd = () => {
    setDragIdx(null);
  };

  /* ---------------------------------------------------------------------- */
  /* Delete a photo                                                         */
  /* ---------------------------------------------------------------------- */

  const deletePhoto = (idx: number) => {
    const updated = photos
      .filter((_, i) => i !== idx)
      .map((p, i) => ({
        ...p,
        sort_order: i,
        is_primary: i === 0,
      }));
    setPhotos(updated);
    onChange(updated);
  };

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
          dragActive
            ? "border-brand-500 bg-brand-50"
            : "border-gray-300 bg-gray-50 hover:border-brand-400 hover:bg-brand-50/50"
        }`}
      >
        <UploadIcon className="mb-3 h-10 w-10 text-gray-400" />
        <p className="text-sm font-medium text-gray-700">
          Drag photos here or click to browse
        </p>
        <p className="mt-1 text-xs text-gray-500">
          JPEG, PNG, WebP, HEIC -- max 10 MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.heic"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Upload Progress */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((u, i) => (
            <div
              key={`upload-${i}`}
              className="flex items-center gap-3 rounded-md bg-gray-50 px-3 py-2 text-sm"
            >
              <span className="flex-1 truncate text-gray-700">
                {u.file.name}
              </span>
              {u.status === "uploading" && (
                <span className="text-brand-600">Uploading...</span>
              )}
              {u.status === "done" && (
                <span className="text-green-600">Done</span>
              )}
              {u.status === "error" && (
                <span className="text-red-600" title={u.error}>
                  Failed
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {photos.map((photo, idx) => (
            <div
              key={`photo-${idx}`}
              draggable
              onDragStart={() => onThumbDragStart(idx)}
              onDragOver={(e) => onThumbDragOver(e, idx)}
              onDragEnd={onThumbDragEnd}
              className={`group relative aspect-[4/3] overflow-hidden rounded-lg border-2 transition-all ${
                dragIdx === idx
                  ? "scale-95 border-brand-500 opacity-50"
                  : photo.is_primary
                    ? "border-brand-500"
                    : "border-transparent hover:border-gray-300"
              }`}
            >
              <img
                src={photo.url}
                alt={photo.alt}
                className="h-full w-full object-cover"
                loading="lazy"
              />

              {/* Primary badge */}
              {photo.is_primary && (
                <span className="absolute left-1.5 top-1.5 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  Primary
                </span>
              )}

              {/* Delete button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deletePhoto(idx);
                }}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                aria-label={`Remove photo ${idx + 1}`}
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>

              {/* Drag handle */}
              <div className="absolute bottom-1.5 left-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                Drag to reorder
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline SVG icons                                                           */
/* -------------------------------------------------------------------------- */

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18 18 6M6 6l12 12"
      />
    </svg>
  );
}
