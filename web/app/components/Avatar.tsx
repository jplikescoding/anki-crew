"use client";
import { createContext, useContext, useRef, useState } from "react";
import type { Profile } from "@/lib/types";

const RING = ["var(--violet-soft)", "var(--cyan-soft)", "var(--gold)"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Set once by the page. Any avatar with an id becomes a way into that person's
 * card, and the champion's wears gold wherever it appears -- no prop threading
 * through the feed and notes.
 */
export const PersonCard = createContext<{ open: (id: string) => void; champion: string | null } | null>(null);

export function Avatar({ profile, size = 28, index = 0, interactive = true }: {
  profile: Pick<Profile, "displayName" | "avatar"> & { id?: string };
  size?: number;
  index?: number;
  /** Off where the avatar sits inside another control, like the upload button or a filter chip. */
  interactive?: boolean;
}) {
  const card = useContext(PersonCard);
  const crowned = Boolean(profile.id && card?.champion === profile.id);
  const ring = crowned ? "var(--gold)" : RING[index % RING.length];
  const face = (
    <span
      data-crowned={String(crowned)}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border"
      style={{
        width: size, height: size, borderColor: ring,
        background: profile.avatar ? "transparent" : "var(--pane-lift)",
        boxShadow: crowned ? "0 0 0 1px var(--gold), 0 0 14px rgba(251,191,36,.45)" : undefined,
        fontSize: Math.max(9, size * 0.36),
        fontWeight: 700,
        color: ring,
      }}
      aria-hidden="true"
    >
      {profile.avatar
        // eslint-disable-next-line @next/next/no-img-element -- a data URL, already sized to 128px
        ? <img src={profile.avatar} alt="" width={size} height={size} style={{ objectFit: "cover", width: "100%", height: "100%" }} />
        : initials(profile.displayName)}
    </span>
  );
  if (!interactive || !card || !profile.id) return face;

  const id = profile.id;
  // A span, not a button: feed cards put avatars inside their own button.
  return (
    <span
      role="button"
      tabIndex={0}
      data-testid={`avatar-${id}`}
      title={`${profile.displayName}'s card`}
      className="inline-flex shrink-0 cursor-pointer rounded-full transition-transform duration-150 hover:scale-105"
      onClick={(e) => { e.stopPropagation(); card.open(id); }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        card.open(id);
      }}
    >
      {face}
    </span>
  );
}

/** Reads a file, shrinks it to a square 128px, and hands back a data URL. */
async function squareDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, 128, 128,
  );
  bitmap.close?.();
  return canvas.toDataURL("image/webp", 0.85);
}

/**
 * Your own picture. The shrink happens here rather than on the server: a 128px
 * square is a few kilobytes, so nothing large ever crosses the network and
 * there is no file store to run.
 */
export function AvatarUploader({ profile, index, apiKey, onChange }: {
  profile: Pick<Profile, "displayName" | "avatar">;
  index: number;
  apiKey: string;
  onChange: (dataUrl: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setState("working");
    try {
      const image = await squareDataUrl(file);
      const res = await fetch(`/api/avatar?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image }),
      });
      if (!res.ok) throw new Error(String(res.status));
      onChange(image);
      setState("idle");
    } catch {
      setState("failed");
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative rounded-full transition-transform duration-200 hover:scale-105"
        title="Change your picture"
        data-testid="avatar-upload"
      >
        <Avatar profile={profile} size={40} index={index} interactive={false} />
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <span className="text-[10.5px]" style={{ color: state === "failed" ? "var(--rose)" : "var(--ink-faint)" }}>
        {state === "working" ? "uploading…"
          : state === "failed" ? "that didn't upload — try a smaller image"
          : profile.avatar ? "tap to change" : "add a picture"}
      </span>
    </span>
  );
}
