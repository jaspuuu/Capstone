"use client";

import Image from "next/image";
import { useRef, useState } from "react";

/**
 * The 1×1 PICTURE box from the official roster form. Click it to attach a
 * photo before printing - screen-only state, never persisted.
 */
export function PhotoBox({ label }: { label: string }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  return (
    <label
      className="flex h-[24.3mm] w-[27.5mm] shrink-0 cursor-pointer items-center justify-center overflow-hidden border border-black text-center text-[9pt] leading-tight text-black"
      title="Click to attach 1×1 photo"
    >
      {photo ? (
        <Image
          src={photo}
          alt=""
          width={200}
          height={215}
          unoptimized
          className="h-full w-full object-cover"
        />
      ) : (
        <>
          1 x 1
          <br />
          PICTURE
        </>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        aria-label={label}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => setPhoto(typeof r.result === "string" ? r.result : null);
          r.readAsDataURL(f);
        }}
      />
    </label>
  );
}
