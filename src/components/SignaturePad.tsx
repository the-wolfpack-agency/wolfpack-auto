"use client";

import { useRef, useEffect, useState, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface SignaturePadProps {
  onSign: (dataUrl: string) => void;
  width?: number;
  height?: number;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function SignaturePad({
  onSign,
  width = 500,
  height = 200,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  /* ------------------------------------------------------------------ */
  /*  Canvas setup                                                       */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Scale for retina displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#ffffff";
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Drawing helpers                                                    */
  /* ------------------------------------------------------------------ */

  const getPoint = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const clientX =
        "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY =
        "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    [],
  );

  const startDraw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      setIsDrawing(true);
      lastPoint.current = getPoint(e);
    },
    [getPoint],
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !lastPoint.current) return;

      const point = getPoint(e);
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      lastPoint.current = point;
      setHasDrawn(true);
    },
    [isDrawing, getPoint],
  );

  const endDraw = useCallback(() => {
    setIsDrawing(false);
    lastPoint.current = null;
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Actions                                                            */
  /* ------------------------------------------------------------------ */

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width * dpr, rect.height * dpr);
    setHasDrawn(false);
  }, []);

  const handleAccept = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSign(dataUrl);
  }, [hasDrawn, onSign]);

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="w-full space-y-3">
      <p className="text-sm font-medium text-gray-300">
        Sign below with your finger or mouse
      </p>

      {/* Canvas */}
      <div className="relative overflow-hidden rounded-xl border border-gray-600 bg-gray-900">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: `${height}px`, touchAction: "none" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />

        {/* Signature line */}
        <div className="pointer-events-none absolute bottom-8 left-6 right-6 border-b border-dashed border-gray-600" />
        <span className="pointer-events-none absolute bottom-2 left-6 text-xs text-gray-600">
          Signature
        </span>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleClear}
          className="flex-1 rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700"
          style={{ fontSize: "16px" }}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={!hasDrawn}
          className="flex-1 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
          style={{ fontSize: "16px" }}
        >
          Accept Signature
        </button>
      </div>
    </div>
  );
}
