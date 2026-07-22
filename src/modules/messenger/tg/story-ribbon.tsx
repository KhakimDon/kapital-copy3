// Telegram Stories ("statuslar") ribbon — a horizontal strip of peer avatars,
// each wrapped in a SEGMENTED ring (one arc per story item — half-width grey for
// read, a blue gradient for unread, green for close-friends), ported from
// Telegram Web A's story/StoryRibbon.tsx + StoryRibbonButton.tsx +
// common/AvatarStoryCircle.tsx. Clicking a peer opens the full-screen
// TgStoryViewer (which the ribbon owns via local open-state and hands the full
// peer array + starting index + the clicked avatar rect for the ghost morph). A
// right-click / long-press opens a small per-peer menu, and a toggler pill
// collapses the whole strip.
//
// It renders `null` when there are no peers, so mounting it at the top of the
// chat list is always safe — until the stories backend is live, useTgStories
// resolves to an empty list (defensively swallowing any 404/500) and the ribbon
// stays invisible without disturbing the chat list.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronUp } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { TgAvatar } from "./tg-avatar";
import { TgStoryViewer } from "./story-viewer";
import {
  useMarkTgStorySeen,
  useTgStories,
  type TgStoryItem,
  type TgStoryPeer,
} from "./api";
import "./tgweb-stories.css";

const RIBBON_AVATAR = 54; // px, inside the segmented ring
const COLLAPSE_AVATARS = 3; // how many avatars the collapsed pill stacks

// Optional close-friends flag (backend may not send it → treated as false).
type StoryItemX = TgStoryItem & { isForCloseFriends?: boolean | null };

export function TgStoryRibbon({ accountId }: { accountId: number }) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  const storiesQ = useTgStories(accountId);
  const markSeen = useMarkTgStorySeen();
  // Peers greyed optimistically this session (opened in the viewer) — the ring
  // turns grey immediately, without waiting on the read POST or a refetch.
  const [seen, setSeen] = useState<Set<number>>(() => new Set());
  const [open, setOpen] = useState<{ peers: TgStoryPeer[]; index: number; rect: DOMRect | null } | null>(
    null,
  );
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState<{ peer: TgStoryPeer; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Only peers that actually carry at least one story item (defensive).
  const peers = useMemo(
    () => (storiesQ.data ?? []).filter((p) => p.items && p.items.length > 0),
    [storiesQ.data],
  );

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const handlePeerViewed = useCallback(
    (peer: TgStoryPeer) => {
      if (!peer || peer.items.length === 0) return;
      const maxId = peer.items.reduce((m, s) => (s.id > m ? s.id : m), 0);
      setSeen((prev) => {
        if (prev.has(peer.peerId)) return prev;
        const next = new Set(prev);
        next.add(peer.peerId);
        return next;
      });
      markSeen.mutate({ accountId, peerId: peer.peerId, maxId });
    },
    [accountId, markSeen],
  );

  if (peers.length === 0) return null;

  // Read-count for a peer's ring: all-seen (or greyed this session) → every arc
  // grey; otherwise count the items whose `seen` flag is set.
  const readCount = (peer: TgStoryPeer) => {
    if (peer.allSeen || seen.has(peer.peerId)) return peer.items.length;
    return peer.items.reduce((n, s) => n + (s.seen ? 1 : 0), 0);
  };
  const isCloseFriend = (peer: TgStoryPeer) =>
    peer.items.some((s) => (s as StoryItemX).isForCloseFriends && !s.seen);

  const openViewer = (index: number, el: HTMLElement | null) => {
    setMenu(null);
    setOpen({ peers, index, rect: el ? el.getBoundingClientRect() : null });
  };

  return (
    <>
      {collapsed ? (
        <button
          type="button"
          className="StoryRibbon__toggler"
          aria-label={tr("stories", "Hikoyalar")}
          onClick={() => setCollapsed(false)}
        >
          {peers.slice(0, COLLAPSE_AVATARS).map((peer, i) => (
            <span
              key={peer.peerId}
              className="StoryRibbon__togglerAvatar"
              style={{ zIndex: COLLAPSE_AVATARS - i, marginInlineStart: i === 0 ? 0 : -14 }}
            >
              <StoryCircle
                size={30}
                total={peer.items.length}
                read={readCount(peer)}
                closeFriend={isCloseFriend(peer)}
              >
                <TgAvatar accountId={accountId} peerId={peer.peerId} name={peer.name} size={30} />
              </StoryCircle>
            </span>
          ))}
        </button>
      ) : (
        <div className="StoryRibbon" role="list" aria-label={tr("stories", "Hikoyalar")}>
          {peers.map((peer, index) => {
            const unread = !(peer.allSeen || seen.has(peer.peerId));
            return (
              <button
                key={peer.peerId}
                type="button"
                role="listitem"
                className="StoryRibbon__peer"
                aria-label={`${tr("story", "Hikoya")}: ${peer.name}`}
                onClick={(e) => openViewer(index, e.currentTarget.querySelector(".StoryCircle"))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ peer, x: e.clientX, y: e.clientY });
                }}
              >
                <StoryCircle
                  size={RIBBON_AVATAR}
                  total={peer.items.length}
                  read={readCount(peer)}
                  closeFriend={isCloseFriend(peer)}
                >
                  <TgAvatar
                    accountId={accountId}
                    peerId={peer.peerId}
                    name={peer.name}
                    size={RIBBON_AVATAR}
                  />
                </StoryCircle>
                <span className={cn("StoryRibbon__name", unread && "StoryRibbon__name--unread")}>
                  {peer.isSelf ? tr("myStory", "Sizning hikoyangiz") : peer.name}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className="StoryRibbon__collapse"
            aria-label={tr("collapse", "Yig'ish")}
            onClick={() => setCollapsed(true)}
          >
            <ChevronUp className="size-4" />
          </button>
        </div>
      )}

      {menu && (
        <PeerMenu
          x={menu.x}
          y={menu.y}
          isSelf={menu.peer.isSelf}
          tr={tr}
          onAction={() => {
            setMenu(null);
            setToast(tr("comingSoon", "Tez orada"));
          }}
          onClose={() => setMenu(null)}
        />
      )}

      {toast && createPortal(<div className="tg-surface StoryRibbon__toast">{toast}</div>, document.body)}

      {open && (
        <TgStoryViewer
          accountId={accountId}
          peers={open.peers}
          initialIndex={open.index}
          originRect={open.rect}
          onPeerViewed={handlePeerViewed}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

// ── segmented gradient ring (AvatarStoryCircle.tsx port) ──────────────────────
const BLUE = ["#34C578", "#3CA3F3"];
const GREEN = ["#C9EB38", "#09C167"];
const GRAY = "#C4C9CC";
const DARK_GRAY = "#737373";
const REM = 16;
const STROKE = 0.125 * REM; // 2px
const GAP_PERCENT = 2;
const SEGMENTS_MAX = 45; // more than this breaks canvas arc rendering in Safari/Chrome
const RING_GAP = 3; // clearance between the avatar and the ring

/** Avatar wrapped in a canvas ring of `total` arcs — the first `read` arcs drawn
 *  half-width grey, the rest in the blue (or green for close-friends) gradient. */
function StoryCircle({
  size,
  total,
  read,
  closeFriend,
  children,
}: {
  size: number;
  total: number;
  read: number;
  closeFriend: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const dark = useIsDark();
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const adaptedSize = size + 2 * RING_GAP + STROKE;

  useLayoutEffect(() => {
    if (!ref.current || total <= 0) return;
    drawGradientCircle({
      canvas: ref.current,
      size: adaptedSize,
      strokeWidth: STROKE,
      segmentsCount: total,
      readSegmentsCount: read,
      colorStops: closeFriend ? GREEN : BLUE,
      readSegmentColor: dark ? DARK_GRAY : GRAY,
      dpr,
    });
  }, [adaptedSize, total, read, closeFriend, dark, dpr]);

  return (
    <span
      className="StoryCircle"
      style={{ width: adaptedSize, height: adaptedSize }}
    >
      <canvas ref={ref} className="StoryCircle__canvas" />
      <span className="StoryCircle__inner" style={{ width: size, height: size }}>
        {children}
      </span>
    </span>
  );
}

function drawGradientCircle({
  canvas,
  size,
  strokeWidth: strokeWidthPx,
  colorStops,
  segmentsCount,
  readSegmentsCount,
  readSegmentColor,
  dpr,
}: {
  canvas: HTMLCanvasElement;
  size: number;
  strokeWidth: number;
  colorStops: string[];
  segmentsCount: number;
  readSegmentsCount: number;
  readSegmentColor: string;
  dpr: number;
}) {
  let segments = segmentsCount;
  let read = readSegmentsCount;
  if (segments > SEGMENTS_MAX) {
    read = Math.round(read * (SEGMENTS_MAX / segments));
    segments = SEGMENTS_MAX;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const canvasSize = size * dpr;
  const strokeWidth = strokeWidthPx * dpr;
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const center = canvasSize / 2;
  const radius = (canvasSize - strokeWidth) / 2;
  const segmentAngle = (2 * Math.PI) / segments;
  const gapSize = (GAP_PERCENT / 100) * (2 * Math.PI);
  const gradient = ctx.createLinearGradient(
    0,
    0,
    Math.ceil(canvasSize * Math.cos(Math.PI / 2)),
    Math.ceil(canvasSize * Math.sin(Math.PI / 2)),
  );
  if (colorStops.length === 1) {
    gradient.addColorStop(0, colorStops[0]);
    gradient.addColorStop(1, colorStops[0]);
  } else {
    colorStops.forEach((stop, i) => gradient.addColorStop(i / (colorStops.length - 1), stop));
  }

  ctx.lineCap = "round";
  ctx.clearRect(0, 0, canvasSize, canvasSize);

  for (let i = 0; i < segments; i++) {
    const isRead = i < read;
    const startAngle = i * segmentAngle - Math.PI / 2 + gapSize / 2;
    const endAngle = startAngle + segmentAngle - (segments > 1 ? gapSize : 0);
    ctx.strokeStyle = isRead ? readSegmentColor : gradient;
    ctx.lineWidth = strokeWidth * (isRead ? 0.5 : 1);
    ctx.beginPath();
    ctx.arc(center, center, radius, startAngle, endAngle);
    ctx.stroke();
  }
}

/** Track the host app's `.dark` class so the read arcs pick the right grey. */
function useIsDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

// ── per-peer context menu (view profile / send message — defensive) ───────────
function PeerMenu({
  x,
  y,
  isSelf,
  tr,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  isSelf: boolean;
  tr: (k: string, d: string) => string;
  onAction: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + width + pad > window.innerWidth) left = window.innerWidth - width - pad;
    if (top + height + pad > window.innerHeight) top = Math.max(pad, y - height);
    setPos({ left: Math.max(pad, left), top: Math.max(pad, top) });
  }, [x, y]);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="tg-surface" onMouseDown={(e) => e.stopPropagation()}>
      <div ref={ref} className="StoryRibbon__menu" style={{ left: pos.left, top: pos.top }} role="menu">
        {!isSelf && (
          <button type="button" className="StoryRibbon__menuItem" onClick={onAction}>
            {tr("storySendMessage", "Xabar yuborish")}
          </button>
        )}
        <button type="button" className="StoryRibbon__menuItem" onClick={onAction}>
          {isSelf ? tr("storyMyProfile", "Mening profilim") : tr("storyViewProfile", "Profilni ko'rish")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
