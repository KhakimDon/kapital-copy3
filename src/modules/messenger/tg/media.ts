// TG media → authenticated blob-URL cache. A plain <img src> can't carry the
// JWT, so photos/documents are streamed through the auth'd media endpoint
// (see `tgMediaUrl` in ./api) and resolved to an object-URL, cached by url.
// Mirrors the internal messenger's fetchAttachmentBlobUrl/useAttachmentSrc.
import { useEffect, useState } from "react";
import { api } from "@/shared/api/client";

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

/** Fetch a TG media url (auth'd) and resolve to a cached object-URL. */
export function fetchTgMediaBlobUrl(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(url);
  if (pending) return pending;
  const p = api
    .get(url, { responseType: "blob", timeout: 300_000 })
    .then((r) => {
      const obj = URL.createObjectURL(r.data as Blob);
      cache.set(url, obj);
      inflight.delete(url);
      return obj;
    })
    .catch((e) => {
      inflight.delete(url);
      throw e;
    });
  inflight.set(url, p);
  return p;
}

/** Resolve an auth'd TG media url into a cached blob object-URL for <img>. */
export function useTgMediaSrc(url: string | null | undefined): {
  src: string | null;
  loading: boolean;
  failed: boolean;
} {
  const [state, setState] = useState(() =>
    url
      ? { src: cache.get(url) ?? null, loading: !cache.has(url), failed: false }
      : { src: null, loading: false, failed: false },
  );
  useEffect(() => {
    if (!url) {
      setState({ src: null, loading: false, failed: false });
      return;
    }
    const hit = cache.get(url);
    if (hit) {
      setState({ src: hit, loading: false, failed: false });
      return;
    }
    let alive = true;
    setState({ src: null, loading: true, failed: false });
    fetchTgMediaBlobUrl(url).then(
      (u) => alive && setState({ src: u, loading: false, failed: false }),
      () => alive && setState({ src: null, loading: false, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}

// ── custom emoji (inline stickers) ───────────────────────────────────────────
// Telegram custom emoji are tiny stickers streamed from an auth'd endpoint
// (tgCustomEmojiUrl) — a .tgs (gzip Lottie), a .webm video, or a static
// webp/png. Like the media cache above, each resolves to a session-cached
// object-URL keyed by url (one per distinct sticker, so repeats — e.g. the same
// bank-logo emoji reused across a chat — never refetch), plus the detected
// `kind` so the caller can pick the right renderer.

export type TgEmojiKind = "tgs" | "webm" | "img";
export type TgEmojiResource = { url: string; kind: TgEmojiKind };

const emojiCache = new Map<string, TgEmojiResource>();
const emojiInflight = new Map<string, Promise<TgEmojiResource>>();

/** Sniff the sticker kind from the blob's leading magic bytes (the backend's
 *  Content-Type isn't reliable): gzip → .tgs Lottie, EBML → .webm, else a
 *  static image (webp/png). */
async function detectEmojiKind(blob: Blob): Promise<TgEmojiKind> {
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) return "tgs";
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  return "img";
}

/** Fetch a custom-emoji sticker (auth'd) → cached object-URL + detected kind. */
export function fetchTgCustomEmoji(url: string): Promise<TgEmojiResource> {
  const hit = emojiCache.get(url);
  if (hit) return Promise.resolve(hit);
  const pending = emojiInflight.get(url);
  if (pending) return pending;
  const p = api
    .get(url, { responseType: "blob", timeout: 300_000 })
    .then(async (r) => {
      const blob = r.data as Blob;
      const res: TgEmojiResource = {
        url: URL.createObjectURL(blob),
        kind: await detectEmojiKind(blob),
      };
      emojiCache.set(url, res);
      emojiInflight.delete(url);
      return res;
    })
    .catch((e) => {
      emojiInflight.delete(url);
      throw e;
    });
  emojiInflight.set(url, p);
  return p;
}

/** Resolve a custom-emoji url into its object-URL + kind (session-cached, so the
 *  object-URL is shared across every mount and never leaks per-render). */
export function useTgCustomEmoji(url: string | null): {
  res: TgEmojiResource | null;
  failed: boolean;
} {
  const [state, setState] = useState<{ res: TgEmojiResource | null; failed: boolean }>(() => ({
    res: url ? emojiCache.get(url) ?? null : null,
    failed: false,
  }));
  useEffect(() => {
    if (!url) {
      setState({ res: null, failed: false });
      return;
    }
    const hit = emojiCache.get(url);
    if (hit) {
      setState({ res: hit, failed: false });
      return;
    }
    let alive = true;
    setState({ res: null, failed: false });
    fetchTgCustomEmoji(url).then(
      (res) => alive && setState({ res, failed: false }),
      () => alive && setState({ res: null, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}

/** Download a TG media file through the auth client and save it under `name`. */
export async function downloadTgMedia(url: string, name: string): Promise<void> {
  const src = await fetchTgMediaBlobUrl(url);
  const a = document.createElement("a");
  a.href = src;
  a.download = name || "file";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Human file size (bytes → B/KB/MB/GB). */
export function fmtSize(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
