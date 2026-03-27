"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAnalytics } from "@/components/EventCollector";

interface PhotoGalleryProps {
  mainPhoto: string;
  alt: string;
  gradient: string;
}

/**
 * Vehicle photo gallery with thumbnail switching and lightbox.
 * Generates multiple crop variants from the base Unsplash URL.
 */
export default function PhotoGallery({ mainPhoto, alt, gradient }: PhotoGalleryProps) {
  const baseUrl = mainPhoto.split("?")[0];

  // Generate photo variants (simulated angles/crops from same base)
  const photos = [
    `${baseUrl}?w=1200&h=800&fit=crop&auto=format`,
    `${baseUrl}?w=1200&h=800&fit=crop&auto=format&crop=left`,
    `${baseUrl}?w=1200&h=800&fit=crop&auto=format&crop=right`,
    `${baseUrl}?w=1200&h=800&fit=crop&auto=format&crop=top`,
  ];

  const thumbs = [
    `${baseUrl}?w=400&h=300&fit=crop&auto=format`,
    `${baseUrl}?w=400&h=250&fit=crop&auto=format&crop=left`,
    `${baseUrl}?w=350&h=300&fit=crop&auto=format&crop=right`,
    `${baseUrl}?w=450&h=300&fit=crop&auto=format&crop=top`,
  ];

  const { track } = useAnalytics();
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const lightboxOpenedAt = useRef(0);
  const photosViewed = useRef(new Set<number>([0]));

  const next = useCallback(() => {
    setActiveIndex((i) => {
      const n = (i + 1) % photos.length;
      photosViewed.current.add(n);
      return n;
    });
  }, [photos.length]);

  const prev = useCallback(() => {
    setActiveIndex((i) => {
      const n = (i - 1 + photos.length) % photos.length;
      photosViewed.current.add(n);
      return n;
    });
  }, [photos.length]);

  // Track thumbnail clicks
  const handleThumbClick = useCallback((index: number) => {
    setActiveIndex(index);
    photosViewed.current.add(index);
    track("gallery_interaction", "thumbnail_click", {
      photo_index: index,
      total_photos: photos.length,
      alt,
    });
  }, [track, photos.length, alt]);

  // Track lightbox open/close with dwell time
  useEffect(() => {
    if (lightboxOpen) {
      lightboxOpenedAt.current = Date.now();
      track("gallery_interaction", "lightbox_opened", {
        photo_index: activeIndex,
        alt,
      });
    } else if (lightboxOpenedAt.current > 0) {
      const dwellMs = Date.now() - lightboxOpenedAt.current;
      track("gallery_interaction", "lightbox_closed", {
        dwell_ms: dwellMs,
        photos_viewed: photosViewed.current.size,
        total_photos: photos.length,
        viewed_all: photosViewed.current.size === photos.length,
        alt,
      });
      lightboxOpenedAt.current = 0;
    }
  }, [lightboxOpen, track, activeIndex, photos.length, alt]);

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowRight") setActiveIndex((i) => (i + 1) % photos.length);
      if (e.key === "ArrowLeft") setActiveIndex((i) => (i - 1 + photos.length) % photos.length);
    }

    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen, photos.length]);

  return (
    <section aria-label="Vehicle photos">
      {/* Main Image */}
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className={`relative h-80 w-full overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} shadow-card cursor-zoom-in`}
        aria-label="Open photo gallery"
      >
        <img
          src={photos[activeIndex]}
          alt={alt}
          className="h-full w-full object-cover transition-opacity duration-300"
        />
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
          </svg>
          {activeIndex + 1} / {photos.length}
        </div>
      </button>

      {/* Thumbnails */}
      <div className="mt-3 grid grid-cols-4 gap-3">
        {thumbs.map((thumb, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleThumbClick(i)}
            className={`h-24 overflow-hidden rounded-xl ring-2 transition-all ${
              i === activeIndex ? "ring-brand-500" : "ring-transparent hover:ring-brand-300"
            }`}
            aria-label={`View photo ${i + 1}`}
            aria-pressed={i === activeIndex}
          >
            <img
              src={thumb}
              alt={`${alt} - view ${i + 1}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Photo gallery"
        >
          {/* Close */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Close gallery"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Prev */}
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Previous photo"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>

          {/* Image */}
          <img
            src={photos[activeIndex]}
            alt={`${alt} - photo ${activeIndex + 1}`}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next */}
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Next photo"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-sm font-medium text-white">
            {activeIndex + 1} / {photos.length}
          </div>
        </div>
      )}
    </section>
  );
}
