"use client";

import { useState } from "react";
import { X } from "lucide-react";

type AgentPhotoProps = {
  src?: string | null;
  name: string;
  publicId?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** When false, photo is display-only (no lightbox). Default true. */
  previewable?: boolean;
};

const sizeClass = {
  sm: "size-8 text-[10px]",
  md: "size-12 text-xs",
  lg: "size-16 text-sm",
};

export function AgentPhoto({
  src,
  name,
  publicId,
  size = "sm",
  className = "",
  previewable = true,
}: AgentPhotoProps) {
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const initials = initialsFromName(name);
  const showImage = Boolean(src) && !broken;

  const avatar = showImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src!}
      alt={name}
      className={`${sizeClass[size]} shrink-0 rounded-full object-cover ${className}`}
      onError={() => setBroken(true)}
    />
  ) : (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--soft-mist)] font-bold text-[var(--forest-emerald)] ${sizeClass[size]} ${className}`}
      aria-hidden
    >
      {initials}
    </div>
  );

  if (!previewable || !showImage) {
    return avatar;
  }

  return (
    <>
      <button
        type="button"
        className="shrink-0 cursor-zoom-in rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--forest-emerald)]"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Preview photo of ${name}`}
      >
        {avatar}
      </button>

      {open ? (
        <AgentPhotoLightbox
          src={src!}
          name={name}
          publicId={publicId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function AgentPhotoLightbox({
  src,
  name,
  publicId,
  onClose,
}: {
  src: string;
  name: string;
  publicId?: string | null;
  onClose: () => void;
}) {
  const [broken, setBroken] = useState(false);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close photo preview"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[92vh] max-w-[92vw] flex-col items-center">
        <button
          type="button"
          className="absolute -right-1 -top-1 z-20 rounded-full bg-white p-2 shadow"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
        {broken ? (
          <div className="flex h-64 w-64 flex-col items-center justify-center bg-[var(--soft-mist)] text-center">
            <p className="text-sm font-semibold text-[var(--midnight-navy)]">
              Photo unavailable
            </p>
            <p className="mt-1 text-xs text-slate-500">{name}</p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name}
            className="max-h-[78vh] max-w-[90vw] object-contain bg-black"
            onError={() => setBroken(true)}
          />
        )}
        <div className="mt-3 max-w-[90vw] text-center">
          <p className="text-base font-bold text-white">{name}</p>
          {publicId ? (
            <p className="mt-0.5 text-sm text-white/70">{publicId}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AG";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
