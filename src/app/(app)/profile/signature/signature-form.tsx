"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  removeSignature,
  saveSignature,
  type ActionState,
} from "@/lib/actions/signature";

type CurrentSignature = {
  method: string | null;
  typed: string | null;
  hasImage: boolean;
};

type Method = "DRAW" | "UPLOAD" | "TYPE";

const CANVAS_W = 600;
const CANVAS_H = 200;

const EMPTY: ActionState = {};

/**
 * Three-way e-signature capture: draw on a canvas, upload a photo of a
 * handwritten signature, or type a name rendered in a handwriting face.
 * Uploads and drawings are normalized to a white-background PNG in the
 * browser before they ever reach the server.
 */
export function SignatureForm({
  current,
  defaultName,
}: {
  current: CurrentSignature;
  defaultName: string;
}) {
  const [saveState, saveAction] = useActionState(saveSignature, EMPTY);
  const [removeState, removeAction] = useActionState(removeSignature, EMPTY);
  const [method, setMethod] = useState<Method>(
    current.method === "TYPE" || current.method === "UPLOAD" || current.method === "DRAW"
      ? current.method
      : "DRAW"
  );

  // Draw state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataUrlRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Upload state
  const [uploadDataUrl, setUploadDataUrl] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Typed state
  const [typed, setTyped] = useState(current.typed ?? defaultName);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, [method]);

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  }

  function startStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = canvasPoint(e);
  }

  function extendStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const from = lastPointRef.current;
    if (!ctx || !from) return;
    const to = canvasPoint(e);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    lastPointRef.current = to;
    setHasDrawn(true);
  }

  function endStroke() {
    drawingRef.current = false;
    lastPointRef.current = null;
    // Capture imperatively so every finished stroke is included; render-time
    // snapshots would go stale as the user keeps drawing.
    if (dataUrlRef.current && canvasRef.current) {
      dataUrlRef.current.value = canvasRef.current.toDataURL("image/png");
    }
  }

  function clearCanvas() {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (dataUrlRef.current) dataUrlRef.current.value = "";
    setHasDrawn(false);
  }

  function handleUpload(file: File | undefined) {
    setUploadError(null);
    setUploadDataUrl(null);
    setUploadName(null);
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setUploadError("Choose a PNG or JPG image of your signature.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("That image is too large (max 10 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Normalize through a canvas: uniform PNG, white background,
        // capped resolution so storage stays tiny.
        const scale = Math.min(1, 900 / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setUploadError("Could not read that image.");
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        setUploadDataUrl(canvas.toDataURL("image/png"));
        setUploadName(file.name);
      };
      img.onerror = () => setUploadError("That file could not be read as an image.");
      img.src = String(reader.result);
    };
    reader.onerror = () => setUploadError("Could not read that file.");
    reader.readAsDataURL(file);
  }

  const drawReady = method === "DRAW" && hasDrawn;
  const uploadReady = method === "UPLOAD" && uploadDataUrl !== null;
  const typeReady = method === "TYPE" && typed.trim().length > 0;
  const ready = drawReady || uploadReady || typeReady;

  return (
    <div className="space-y-5">
      {(saveState.error || removeState.error || saveState.success || removeState.success) && (
        <Alert
          tone={saveState.error ?? removeState.error ? "danger" : "success"}
        >
          {saveState.error ?? removeState.error ?? saveState.success ?? removeState.success}
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Signature input method">
        {(
          [
            ["DRAW", "Draw"],
            ["UPLOAD", "Upload"],
            ["TYPE", "Type"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={method === value}
            onClick={() => setMethod(value)}
            className={`h-9 rounded-lg border text-sm font-semibold transition-colors ${
              method === value
                ? "border-primary bg-primary-light text-primary-dark"
                : "border-line bg-surface text-content-secondary hover:bg-surface-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form action={saveAction}>
        <input type="hidden" name="method" value={method} />

        {method === "DRAW" && (
          <div className="space-y-2">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              onPointerDown={startStroke}
              onPointerMove={extendStroke}
              onPointerUp={endStroke}
              onPointerLeave={endStroke}
              className="w-full max-w-[600px] cursor-crosshair touch-none rounded-lg border-2 border-dashed border-line-strong bg-white"
              aria-label="Signature drawing area"
            />
            <p className="text-xs text-content-secondary">
              Sign with your mouse, finger, or stylus.
            </p>
            <input ref={dataUrlRef} type="hidden" name="dataUrl" />
            <Button variant="outline" size="sm" onClick={clearCanvas}>
              Clear
            </Button>
          </div>
        )}

        {method === "UPLOAD" && (
          <div className="space-y-3">
            <Field label="Signature image" hint="PNG or JPG. A phone photo of your signature works well.">
              <Input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
            </Field>
            {uploadError && <p className="text-sm font-medium text-danger">{uploadError}</p>}
            {uploadDataUrl && (
              <div className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadDataUrl}
                  alt={`Preview of ${uploadName ?? "uploaded signature"}`}
                  className="max-h-[120px] rounded-lg border border-line bg-white p-2"
                />
                <input type="hidden" name="dataUrl" value={uploadDataUrl} />
              </div>
            )}
          </div>
        )}

        {method === "TYPE" && (
          <div className="space-y-3">
            <Field label="Type your full name">
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                maxLength={60}
                placeholder="Juan D. Dela Cruz"
                autoComplete="off"
              />
            </Field>
            <input type="hidden" name="typed" value={typed.trim()} />
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-content-secondary">
                Preview
              </p>
              <p
                className="rounded-lg border border-line bg-white px-4 py-3 text-[28px] leading-snug text-gray-900"
                style={{ fontFamily: '"Great Vibes", cursive' }}
              >
                {typed.trim() || "Your name here"}
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <SubmitButton disabled={!ready}>Save signature</SubmitButton>
          {!ready && (
            <span className="text-xs text-content-secondary">
              {method === "DRAW"
                ? "Draw your signature first."
                : method === "UPLOAD"
                  ? "Choose an image first."
                  : "Type your name first."}
            </span>
          )}
        </div>
      </form>

      {current.hasImage || current.typed ? (
        <form action={removeAction}>
          <SubmitButton variant="ghost">Remove saved signature</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
