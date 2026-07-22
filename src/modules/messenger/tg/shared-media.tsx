// RIGHT-column SHARED MEDIA — the real content behind the Telegram-Web-A profile
// tabs, a fidelity port of `right/Profile.tsx`'s `renderContent()` shared-media
// branches (+ their `Profile.module.scss` grid/list classes):
//
//   • Media   — a 3-col photo/video mosaic (`.content.mediaList`) with rounded
//               outer corners; a tap opens the existing `TgMediaViewer` at that
//               index (photos zoom, videos play, prev/next across the set).
//   • GIFs    — the same mosaic (`.content.gifList`), tap → viewer.
//   • Files   — document rows (`.content.documentsList`) via the shared
//               `TgMediaBody` document renderer (round icon + name + size).
//   • Music   — audio player rows (`.content.audioList`) via `TgMediaBody`.
//   • Voice   — voice player rows with a waveform (`.content.voiceList`).
//   • Links   — link cards (`.content.linksList`): a webpage preview when the
//               message carries one, else an entity-rendered text card.
//
// Every tab is its own lazy/paginated infinite query (`useTgSharedMedia`), each
// rendered DEFENSIVELY: a skeleton while the first page loads, then either the
// content or an honest empty state. A bottom sentinel (observed against the
// `.Profile` scroll container) pulls the next page as it nears the viewport.
//
// Bytes come through the auth'd media endpoints (`tgMediaUrl` / `tgThumbUrl`)
// resolved to cached blobs via `useTgMediaSrc`; grid thumbnails use the small
// poster, and the full bytes are only fetched inside the viewer.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  File as FileIcon,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Mic,
  Music as MusicIcon,
  Play,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { tgMediaUrl, tgThumbUrl, type TgEntity, type TgMessage } from "./api";
import { useTgMediaSrc } from "./media";
import { renderEntities } from "./entities";
import { TgMediaBody } from "./message-media";
import { TgMediaViewer } from "./media-viewer";
import {
  flattenSharedMedia,
  useTgSharedMedia,
  type TgSharedMediaFilter,
} from "./profile-media-api";

type Tr = (k: string, d: string) => string;

/** The non-member profile tabs (member list lives in chat-info). */
export type SharedMediaTab = "media" | "documents" | "links" | "audio" | "gif" | "voice";

/** The empty-state kinds (one per visible tab). */
type EmptyKind = "media" | "files" | "links" | "audio" | "gif" | "voice";

const GRID_COLUMNS = 3;

/** seconds → m:ss (or h:mm:ss) — the grid video duration badge. */
function fmtDur(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "";
  const total = Math.floor(sec);
  const s = String(total % 60).padStart(2, "0");
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${s}`;
  return `${m}:${s}`;
}

/** Rounded-corner class for a grid cell — mirrors the reference
 *  `getGridCornerClassName` so only the four outer corners of the mosaic round. */
function cornerClass(index: number, total: number): string {
  const lastRowIndex = Math.floor((total - 1) / GRID_COLUMNS);
  const lastRowCount = total - lastRowIndex * GRID_COLUMNS;
  const isLastRowFull = lastRowCount === GRID_COLUMNS;
  const isTopStart = index === 0;
  const isTopEnd = index === Math.min(GRID_COLUMNS - 1, total - 1);
  const isBottomStart = index === lastRowIndex * GRID_COLUMNS;
  const isBottomEnd =
    index === total - 1 ||
    (!isLastRowFull && lastRowIndex > 0 && index === lastRowIndex * GRID_COLUMNS - 1);
  return cn(
    isTopStart && "roundTopStart",
    isTopEnd && "roundTopEnd",
    isBottomStart && "roundBottomStart",
    isBottomEnd && "roundBottomEnd",
  );
}

/** First URL in a message — a `textUrl`/`url` entity target, else the first
 *  http(s) run in the text (used for the plain-text link card's href). */
function firstUrl(text: string, entities: TgEntity[] | null | undefined): string | null {
  const e = entities?.find((x) => x.type === "textUrl" && x.url)?.url;
  if (e) return e;
  const m = text.match(/https?:\/\/[^\s<]+/);
  return m ? m[0].replace(/[.,;:!?)\]]+$/, "") : null;
}

/** Host label for a url ("t.me", "github.com"), falling back to the raw url. */
function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// ── load-more sentinel ──────────────────────────────────────────────────────
// A ref attached to a bottom sentinel; when it nears the `.Profile` scroll
// container it calls `loadMore`. Finding the root via `.closest(".Profile")`
// keeps the shared-media components free of any ref plumbing from chat-info.
function useLoadMoreOnView(hasMore: boolean, loadMore: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore) return;
    const root = el.closest(".Profile");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root, rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);
  return ref;
}

// ── empty + skeleton ────────────────────────────────────────────────────────

function MediaEmpty({ id, tr }: { id: EmptyKind; tr: Tr }) {
  const map: Record<EmptyKind, { icon: React.ReactNode; text: string }> = {
    media: { icon: <ImageIcon className="size-9" />, text: tr("mediaEmpty", "No media yet") },
    files: { icon: <FileIcon className="size-9" />, text: tr("filesEmpty", "No files yet") },
    links: { icon: <LinkIcon className="size-9" />, text: tr("linksEmpty", "No links yet") },
    audio: { icon: <MusicIcon className="size-9" />, text: tr("musicEmpty", "No music yet") },
    gif: { icon: <ImageIcon className="size-9" />, text: tr("gifsEmpty", "No GIFs yet") },
    voice: { icon: <Mic className="size-9" />, text: tr("voiceEmpty", "No voice messages yet") },
  };
  const e = map[id];
  return (
    <div className="content emptyList">
      <span className="empty-icon">{e.icon}</span>
      <p className="empty-text">{e.text}</p>
    </div>
  );
}

/** Grid loading placeholder (nine shimmering cells). */
function GridSkeleton({ listClass }: { listClass: "mediaList" | "gifList" }) {
  return (
    <div className={cn("content", listClass)}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="media-thumb skeleton" />
      ))}
    </div>
  );
}

/** Rows loading placeholder (icon disc + two lines). */
function RowsSkeleton({ listClass }: { listClass: string }) {
  return (
    <div className={cn("content", listClass)}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="shared-row">
          <span className="shared-row-icon skeleton" />
          <div className="shared-row-lines">
            <span className="skeleton-line" style={{ width: "55%" }} />
            <span className="skeleton-line short" style={{ width: "32%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── media / gif mosaic ──────────────────────────────────────────────────────

/** One grid cell — a poster thumbnail (photo/video/gif) that opens the viewer. */
function MediaThumb({
  accountId,
  chatId,
  msg,
  corner,
  onOpen,
}: {
  accountId: number;
  chatId: number;
  msg: TgMessage;
  corner: string;
  onOpen: () => void;
}) {
  const media = msg.media;
  const canLoad = !!media && media.downloadable !== false;
  const { src, loading } = useTgMediaSrc(canLoad ? tgThumbUrl(accountId, chatId, msg.id) : null);
  const isVideo = media?.type === "video";
  const isGif = media?.type === "gif";

  return (
    <div
      className={cn("media-thumb", corner)}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {src ? (
        <img src={src} alt="" draggable={false} />
      ) : (
        <span className="media-thumb-empty">
          {loading ? <Loader2 className="size-5 animate-spin" /> : <ImageIcon className="size-5" />}
        </span>
      )}
      {isVideo && (
        <>
          <span className="media-thumb-play">
            <Play className="size-4" fill="currentColor" />
          </span>
          {media?.duration != null && media.duration > 0 && (
            <span className="media-thumb-badge">{fmtDur(media.duration)}</span>
          )}
        </>
      )}
      {isGif && <span className="media-thumb-badge">GIF</span>}
    </div>
  );
}

/** The shared mosaic body: skeleton → empty → grid + viewer + load-more. */
function MediaGrid({
  accountId,
  chatId,
  items,
  loading,
  hasMore,
  loadMore,
  listClass,
  emptyKind,
  tr,
}: {
  accountId: number;
  chatId: number;
  items: TgMessage[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  listClass: "mediaList" | "gifList";
  emptyKind: EmptyKind;
  tr: Tr;
}) {
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const sentinelRef = useLoadMoreOnView(hasMore, loadMore);

  if (loading && items.length === 0) return <GridSkeleton listClass={listClass} />;
  if (items.length === 0) return <MediaEmpty id={emptyKind} tr={tr} />;

  return (
    <>
      <div className={cn("content", listClass)}>
        {items.map((m, i) => (
          <MediaThumb
            key={m.id}
            accountId={accountId}
            chatId={chatId}
            msg={m}
            corner={cornerClass(i, items.length)}
            onOpen={() => setViewerAt(i)}
          />
        ))}
      </div>
      {hasMore && <div ref={sentinelRef} className="shared-sentinel" />}
      {viewerAt != null && (
        <TgMediaViewer
          accountId={accountId}
          chatId={chatId}
          items={items}
          /* Stable id, not the positional index — the viewer filters `items` to
           * viewable/downloadable media, so an index could drift. */
          startMsgId={items[viewerAt]?.id}
          startIndex={viewerAt}
          tr={tr}
          onClose={() => setViewerAt(null)}
        />
      )}
    </>
  );
}

/** Media tab — merges the photo + video filters into one newest-first mosaic. */
function MediaVideoGrid({ accountId, chatId, tr }: { accountId: number; chatId: number; tr: Tr }) {
  const photoQ = useTgSharedMedia(accountId, chatId, "photo");
  const videoQ = useTgSharedMedia(accountId, chatId, "video");

  const items = useMemo(() => {
    const merged = [...flattenSharedMedia(photoQ.data), ...flattenSharedMedia(videoQ.data)];
    const seen = new Set<number>();
    const out: TgMessage[] = [];
    for (const m of merged) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        out.push(m);
      }
    }
    out.sort((a, b) => b.id - a.id);
    return out;
  }, [photoQ.data, videoQ.data]);

  const loadMore = useCallback(() => {
    if (photoQ.hasNextPage && !photoQ.isFetchingNextPage) void photoQ.fetchNextPage();
    if (videoQ.hasNextPage && !videoQ.isFetchingNextPage) void videoQ.fetchNextPage();
  }, [photoQ, videoQ]);

  return (
    <MediaGrid
      accountId={accountId}
      chatId={chatId}
      items={items}
      loading={photoQ.isLoading || videoQ.isLoading}
      hasMore={!!photoQ.hasNextPage || !!videoQ.hasNextPage}
      loadMore={loadMore}
      listClass="mediaList"
      emptyKind="media"
      tr={tr}
    />
  );
}

/** GIFs tab — the gif filter as its own mosaic. */
function GifGrid({ accountId, chatId, tr }: { accountId: number; chatId: number; tr: Tr }) {
  const q = useTgSharedMedia(accountId, chatId, "gif");
  const items = useMemo(() => flattenSharedMedia(q.data), [q.data]);
  const loadMore = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  }, [q]);
  return (
    <MediaGrid
      accountId={accountId}
      chatId={chatId}
      items={items}
      loading={q.isLoading}
      hasMore={!!q.hasNextPage}
      loadMore={loadMore}
      listClass="gifList"
      emptyKind="gif"
      tr={tr}
    />
  );
}

// ── document / music / voice rows ───────────────────────────────────────────

/** Rows of the shared `TgMediaBody` renderer (document / audio / voice), each a
 *  message's media as a self-contained row. */
function MediaRows({
  accountId,
  chatId,
  filter,
  listClass,
  emptyKind,
  tr,
}: {
  accountId: number;
  chatId: number;
  filter: TgSharedMediaFilter;
  listClass: string;
  emptyKind: EmptyKind;
  tr: Tr;
}) {
  const q = useTgSharedMedia(accountId, chatId, filter);
  const items = useMemo(() => flattenSharedMedia(q.data), [q.data]);
  const loadMore = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  }, [q]);
  const sentinelRef = useLoadMoreOnView(!!q.hasNextPage, loadMore);

  if (q.isLoading && items.length === 0) return <RowsSkeleton listClass={listClass} />;
  if (items.length === 0) return <MediaEmpty id={emptyKind} tr={tr} />;

  return (
    <>
      <div className={cn("content", listClass)}>
        {items.map((m) =>
          m.media ? (
            <div key={m.id} className="shared-row">
              <TgMediaBody media={m.media} url={tgMediaUrl(accountId, chatId, m.id)} tr={tr} />
            </div>
          ) : null,
        )}
      </div>
      {q.hasNextPage && <div ref={sentinelRef} className="shared-sentinel" />}
    </>
  );
}

// ── links ───────────────────────────────────────────────────────────────────

/** One link card — a webpage preview when the message carries one, else an
 *  entity-rendered text card whose href is the message's first URL. */
function LinkCard({
  accountId,
  chatId,
  msg,
  tr,
}: {
  accountId: number;
  chatId: number;
  msg: TgMessage;
  tr: Tr;
}) {
  if (msg.media?.type === "webpage") {
    return (
      <div className="shared-row">
        <TgMediaBody media={msg.media} url={tgMediaUrl(accountId, chatId, msg.id)} tr={tr} />
      </div>
    );
  }
  const url = firstUrl(msg.text, msg.entities);
  return (
    <a
      className="shared-link-card"
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="shared-link-title">{hostOf(url) ?? tr("mLink", "Havola")}</span>
      {msg.text && (
        <span className="shared-link-text">
          {renderEntities(msg.text, msg.entities, "", tr, accountId, `lk-${msg.id}`)}
        </span>
      )}
    </a>
  );
}

function LinksList({ accountId, chatId, tr }: { accountId: number; chatId: number; tr: Tr }) {
  const q = useTgSharedMedia(accountId, chatId, "url");
  const items = useMemo(() => flattenSharedMedia(q.data), [q.data]);
  const loadMore = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  }, [q]);
  const sentinelRef = useLoadMoreOnView(!!q.hasNextPage, loadMore);

  if (q.isLoading && items.length === 0) return <RowsSkeleton listClass="linksList" />;
  if (items.length === 0) return <MediaEmpty id="links" tr={tr} />;

  return (
    <>
      <div className="content linksList">
        {items.map((m) => (
          <LinkCard key={m.id} accountId={accountId} chatId={chatId} msg={m} tr={tr} />
        ))}
      </div>
      {q.hasNextPage && <div ref={sentinelRef} className="shared-sentinel" />}
    </>
  );
}

// ── dispatcher ──────────────────────────────────────────────────────────────

/** Render the active non-member profile tab's shared-media content. */
export function SharedMediaPanel({
  accountId,
  chatId,
  tab,
  tr,
}: {
  accountId: number;
  chatId: number;
  tab: SharedMediaTab;
  tr: Tr;
}) {
  switch (tab) {
    case "media":
      return <MediaVideoGrid accountId={accountId} chatId={chatId} tr={tr} />;
    case "gif":
      return <GifGrid accountId={accountId} chatId={chatId} tr={tr} />;
    case "documents":
      return (
        <MediaRows
          accountId={accountId}
          chatId={chatId}
          filter="document"
          listClass="documentsList"
          emptyKind="files"
          tr={tr}
        />
      );
    case "audio":
      return (
        <MediaRows
          accountId={accountId}
          chatId={chatId}
          filter="music"
          listClass="audioList"
          emptyKind="audio"
          tr={tr}
        />
      );
    case "voice":
      return (
        <MediaRows
          accountId={accountId}
          chatId={chatId}
          filter="voice"
          listClass="voiceList"
          emptyKind="voice"
          tr={tr}
        />
      );
    case "links":
      return <LinksList accountId={accountId} chatId={chatId} tr={tr} />;
    default:
      return null;
  }
}
