// Full-screen Telegram Story viewer ("statuslar") — a faithful port of Telegram
// Web A's story/StoryViewer + StorySlides + Story + StoryProgress + StoryCaption
// + StoryFooter. It portals to <body> under the `.tg-surface` class (same pattern
// as media-viewer.tsx) so the scoped theme tokens resolve, and draws the classic
// dark overlay as a MULTI-PEER DECK: the active peer sits centered as a 9:16
// media stage while up to ~4 neighbouring peers are partially visible on each
// side (scaled-down preview cards), and switching peers animates the whole deck.
// (On mobile — < 600px — the deck collapses to a single slide.)
//
// The stage carries thin segmented progress bars (one per story item, driven by a
// CSS keyframe for photos and by real playback time for video), a peer header
// (avatar + name + relative time + optional "who can see" / forward / edited
// hints), a mute toggle for video, a 3-dot menu, tap-left / tap-right zones, a
// clamp-to-3-lines caption that expands on "Show more", and a reply composer with
// a heart reaction. Auto-advance mirrors the source: photos step after ~6s (a CSS
// animation that pauses when the tab is hidden, on spacebar, or while the pointer
// is held down), video steps on `ended`. Media bytes load through the auth'd blob
// hook (useTgMediaSrc); a failed load shows a neutral placeholder and STILL
// auto-advances (a broken story can never stall or crash the run).
//
// Everything richer than the basic backend contract (close-friends, visibility,
// forward attribution, edited flag, own-story views) is read DEFENSIVELY from
// OPTIONAL fields — absent data simply renders nothing.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  Loader2,
  MoreHorizontal,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { TgAvatar } from "./tg-avatar";
import { renderEntities } from "./entities";
import { useTgMediaSrc, downloadTgMedia } from "./media";
import {
  tgStoryMediaUrl,
  useSendTgMessage,
  type TgStoryItem,
  type TgStoryPeer,
} from "./api";
import {
  useReactTgStory,
  useTgStoryViews,
  type TgStoryView,
  type TgStoryViews,
} from "./story-actions-api";
import "./tgweb-stories.css";

// The reaction the heart button sends (Telegram Web's HEART_REACTION). Sending
// the same reaction again removes it (POST with an empty string).
const HEART = "❤"; // ❤

type Tr = (k: string, d: string) => string;

// How long a photo story stays on screen before auto-advancing. The real client's
// DEFAULT_STORY_DURATION_S is 6s (StoryProgress.tsx).
const PHOTO_MS = 6000;

// ── OPTIONAL richer fields (read defensively; backend may not send them) ────────
// These widen the basic TgStoryItem/TgStoryPeer contract with everything the real
// viewer shows. Every field is optional; missing data renders nothing.
type StoryItemX = TgStoryItem & {
  isForCloseFriends?: boolean | null;
  edited?: boolean | null;
  editDate?: number | string | null;
  visibility?: "everybody" | "contacts" | "closeFriends" | "nobody" | null;
  fwdFrom?: { name?: string | null } | null;
  forwardInfo?: { fromName?: string | null } | null;
  isOut?: boolean | null;
};
type StoryPeerX = TgStoryPeer & { lastReadId?: number | null };

/** Optional side-effect *listeners*. The viewer wires the real backend calls
 *  itself (reply → `useSendTgMessage`, reaction → `useReactTgStory`); these
 *  callbacks are additive hooks for a parent that also wants to observe the
 *  action (e.g. analytics / optimistic list updates). `emoji` is null on removal. */
export type TgStoryViewerCallbacks = {
  onReply?: (peer: TgStoryPeer, item: TgStoryItem, text: string) => void | Promise<void>;
  onReact?: (peer: TgStoryPeer, item: TgStoryItem, emoji: string | null) => void;
};

export function TgStoryViewer({
  accountId,
  peers,
  initialIndex,
  originRect,
  onPeerViewed,
  onClose,
  onReply,
  onReact,
}: {
  accountId: number;
  peers: TgStoryPeer[];
  initialIndex: number;
  /** Bounding rect of the ribbon avatar that opened us, for the ghost morph. */
  originRect?: DOMRect | null;
  /** Fired whenever the viewer lands on a peer — best-effort "mark seen". */
  onPeerViewed?: (peer: TgStoryPeer) => void;
  onClose: () => void;
} & TgStoryViewerCallbacks) {
  const { t } = useTranslation();
  const tr: Tr = (k, d) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  const sizes = useSlideSizes();

  const [peerIndex, setPeerIndex] = useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, peers.length - 1)),
  );
  const [itemIndex, setItemIndex] = useState(0);

  // Pause reasons (any true ⇒ the active story freezes). Tab-hidden, spacebar,
  // pointer hold, an expanded caption, a focused composer, an open menu, or the
  // own-story viewers list.
  const [tabHidden, setTabHidden] = useState(false);
  const [pausedBySpace, setPausedBySpace] = useState(false);
  const [pausedByHold, setPausedByHold] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);

  const [muted, setMuted] = useState(true); // video starts muted (autoplay policy)
  const [videoProgress, setVideoProgress] = useState(0); // 0..1, playable video only
  const [status, setStatus] = useState<{ ready: boolean; failed: boolean }>({
    ready: false,
    failed: false,
  });
  const [toast, setToast] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false); // drives the open transition
  const [closing, setClosing] = useState(false); // drives the close transition

  // Reactions the account left this session, keyed "peerId:storyId" → emoji.
  // Kept in the viewer (which survives peer/item navigation) so a sent reaction
  // persists across the whole session, per the source's `sentReaction`.
  const [sentReactions, setSentReactions] = useState<Map<string, string>>(() => new Map());
  const reactStory = useReactTgStory();
  const sendMessage = useSendTgMessage();

  const peer = peers[peerIndex] as StoryPeerX | undefined;
  const items = peer?.items ?? [];
  const item = items[itemIndex] as StoryItemX | undefined;
  const isVideo = item?.kind === "video";

  const paused =
    tabHidden ||
    pausedBySpace ||
    pausedByHold ||
    captionExpanded ||
    composerFocused ||
    menuOpen ||
    viewsOpen;

  // A working video drives its own bar from playback time; anything else (photo,
  // or a video whose bytes failed) is timed by the CSS keyframe.
  const activeTimed = !isVideo || status.failed;

  // ── close with a short exit transition (ghost morph back to the avatar) ──────
  const requestClose = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, 200);
  }, [onClose]);

  // Play the open transition on the next frame after mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Step forward: next item → next peer → close. Resets per-item state.
  const goNext = useCallback(() => {
    setVideoProgress(0);
    setStatus({ ready: false, failed: false });
    if (itemIndex + 1 < items.length) {
      setItemIndex(itemIndex + 1);
    } else if (peerIndex + 1 < peers.length) {
      setPeerIndex(peerIndex + 1);
      setItemIndex(0);
    } else {
      requestClose();
    }
  }, [itemIndex, items.length, peerIndex, peers.length, requestClose]);

  // Step back: prev item → previous peer's first item → clamp at the very start.
  const goPrev = useCallback(() => {
    setVideoProgress(0);
    setStatus({ ready: false, failed: false });
    if (itemIndex > 0) {
      setItemIndex(itemIndex - 1);
    } else if (peerIndex > 0) {
      setPeerIndex(peerIndex - 1);
      setItemIndex(0);
    } else {
      setItemIndex(0);
    }
  }, [itemIndex, peerIndex]);

  // Jump straight to a neighbouring peer (clicking its preview slide).
  const goToPeer = useCallback(
    (idx: number) => {
      if (idx === peerIndex) return;
      setVideoProgress(0);
      setStatus({ ready: false, failed: false });
      setPeerIndex(Math.min(Math.max(0, idx), peers.length - 1));
      setItemIndex(0);
    },
    [peerIndex, peers.length],
  );

  // Collapse pause/caption reasons whenever the active story changes. The sent
  // reaction is intentionally NOT reset here — it persists per story item.
  const activeKey = `${peerIndex}:${itemIndex}`;
  useEffect(() => {
    setCaptionExpanded(false);
    setViewsOpen(false);
  }, [activeKey]);

  // Mark each peer seen as we land on it (best-effort; greys the ribbon ring).
  const viewedRef = useRef(onPeerViewed);
  viewedRef.current = onPeerViewed;
  useEffect(() => {
    if (peer) viewedRef.current?.(peer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerIndex, peer?.peerId]);

  // Freeze auto-advance while the browser tab is hidden.
  useEffect(() => {
    const onVis = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Esc closes (capture phase, so it beats an underlying dialog's Esc handler),
  // arrows navigate, space pauses; body scroll locks while open. When the
  // own-story viewers list is open, Esc closes just that first.
  const composerFocusedRef = useRef(composerFocused);
  composerFocusedRef.current = composerFocused;
  const viewsOpenRef = useRef(viewsOpen);
  viewsOpenRef.current = viewsOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        if (viewsOpenRef.current) {
          setViewsOpen(false); // close the viewers list, keep the viewer open
          return;
        }
        requestClose();
      } else if (composerFocusedRef.current) {
        return; // typing a reply — don't hijack keys
      } else if (e.key === "ArrowRight") {
        goNext();
      } else if (e.key === "ArrowLeft") {
        goPrev();
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setPausedBySpace((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [requestClose, goNext, goPrev]);

  // ── pointer hold-to-pause (long-press) ───────────────────────────────────────
  // A press held past the threshold pauses playback and hides the chrome; a quick
  // press is a tap (the nav zones handle it). `heldRef` suppresses the click that
  // would otherwise fire on release of a hold.
  const holdTimer = useRef<number | null>(null);
  const heldRef = useRef(false);
  const clearHold = useCallback(() => {
    if (holdTimer.current != null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);
  const onHoldStart = useCallback(() => {
    clearHold();
    heldRef.current = false;
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      setPausedByHold(true);
    }, 200);
  }, [clearHold]);
  const onHoldEnd = useCallback(() => {
    clearHold();
    setPausedByHold(false);
    // keep heldRef true through the click that immediately follows, then reset
    if (heldRef.current) window.setTimeout(() => (heldRef.current = false), 0);
  }, [clearHold]);

  const navGuard = (fn: () => void) => () => {
    if (heldRef.current) return; // released from a hold → ignore the tap
    fn();
  };

  // Window of peers to render around the current one (up to 4 each side).
  const windowStart = Math.max(peerIndex - 4, 0);
  const windowEnd = Math.min(peerIndex + 5, peers.length);
  const windowPeers = useMemo(() => {
    const out: { peer: StoryPeerX; index: number }[] = [];
    for (let i = windowStart; i < windowEnd; i++) out.push({ peer: peers[i] as StoryPeerX, index: i });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers, windowStart, windowEnd]);

  if (!peer || !item) return null;

  const rootClass =
    "tg-surface StoryViewer" +
    (mounted && !closing ? " StoryViewer--open" : "") +
    (closing ? " StoryViewer--closing" : "");

  // Ghost-morph offset: come from / return to the ribbon avatar's position.
  const morph = computeMorph(originRect, sizes);
  const deckStyle: React.CSSProperties =
    mounted && !closing
      ? { transform: "translate(0px, 0px) scale(1)", opacity: 1 }
      : { transform: `translate(${morph.dx}px, ${morph.dy}px) scale(${morph.scale})`, opacity: 0 };

  const singleSlide = sizes.isMobile;

  // The reaction we've left on the *current* story item (from the session map).
  const reactionKey = `${peer.peerId}:${item.id}`;
  const sentReaction = sentReactions.get(reactionKey) ?? "";

  // Toggle/replace our reaction on the active story. Optimistic: the map (and so
  // the heart) updates immediately; the POST is best-effort (the hook swallows a
  // 404), so the viewer never crashes. Sending the same reaction again removes it
  // (empty string).
  const handleReact = (emoji: string) => {
    const next = sentReaction === emoji ? "" : emoji;
    setSentReactions((prev) => {
      const m = new Map(prev);
      if (next) m.set(reactionKey, next);
      else m.delete(reactionKey);
      return m;
    });
    reactStory.mutate({ accountId, peerId: peer.peerId, storyId: item.id, reaction: next });
    onReact?.(peer, item, next || null);
  };

  const handleReplySubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // A story reply is just a message to the story's author (the peer id IS the
    // author). Reuse the shared send mutation; best-effort, so a failure never
    // throws into the viewer (react-query captures the rejection in state).
    sendMessage.mutate({ accountId, chatId: peer.peerId, text: trimmed });
    onReply?.(peer, item, trimmed);
    showToast(tr("storyReplySent", "Yuborildi"));
  };

  return createPortal(
    <div className={rootClass} role="dialog" aria-modal="true" onMouseDown={requestClose}>
      <div className="StoryViewer__backdrop" />

      <div className="StoryViewer__deck" style={deckStyle}>
        {(singleSlide ? [{ peer, index: peerIndex }] : windowPeers).map(({ peer: p, index }) => {
          const pos = index - peerIndex;
          const slideStyle = {
            width: sizes.activeW,
            height: sizes.activeH,
            "--slide-x": `${singleSlide ? 0 : sizes.offsetX(pos)}px`,
            "--slide-scale": pos === 0 ? 1 : sizes.fromActiveScale,
          } as React.CSSProperties;
          return (
            <div
              key={p.peerId}
              className={"StoryViewer__slide" + (pos === 0 ? " StoryViewer__slide--active" : "")}
              style={slideStyle}
            >
              <div className="StoryViewer__slideScale">
                {pos === 0 ? (
                  <ActiveSlide
                    accountId={accountId}
                    peer={peer as StoryPeerX}
                    item={item}
                    items={items}
                    itemIndex={itemIndex}
                    isVideo={isVideo}
                    activeTimed={activeTimed}
                    ready={status.ready}
                    paused={paused}
                    holding={pausedByHold}
                    muted={muted}
                    sentReaction={sentReaction}
                    videoProgress={videoProgress}
                    captionExpanded={captionExpanded}
                    tr={tr}
                    onStatus={setStatus}
                    onVideoProgress={setVideoProgress}
                    onNext={goNext}
                    onPrev={goPrev}
                    onClose={requestClose}
                    onToggleMute={() => setMuted((m) => !m)}
                    onHoldStart={onHoldStart}
                    onHoldEnd={onHoldEnd}
                    navGuard={navGuard}
                    onExpandCaption={() => setCaptionExpanded(true)}
                    onFoldCaption={() => setCaptionExpanded(false)}
                    onComposerFocus={() => setComposerFocused(true)}
                    onComposerBlur={() => setComposerFocused(false)}
                    onReplySubmit={handleReplySubmit}
                    onReact={handleReact}
                    onMenuOpenChange={setMenuOpen}
                    viewsOpen={viewsOpen}
                    onViewsOpenChange={setViewsOpen}
                    onToast={showToast}
                  />
                ) : (
                  <PreviewSlide
                    accountId={accountId}
                    peer={p}
                    tr={tr}
                    onClick={() => goToPeer(index)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toast && <div className="StoryViewer__toast">{toast}</div>}
    </div>,
    document.body,
  );
}

// ── the active (centered) peer's full story stage ────────────────────────────
function ActiveSlide({
  accountId,
  peer,
  item,
  items,
  itemIndex,
  isVideo,
  activeTimed,
  ready,
  paused,
  holding,
  muted,
  sentReaction,
  videoProgress,
  captionExpanded,
  tr,
  onStatus,
  onVideoProgress,
  onNext,
  onPrev,
  onClose,
  onToggleMute,
  onHoldStart,
  onHoldEnd,
  navGuard,
  onExpandCaption,
  onFoldCaption,
  onComposerFocus,
  onComposerBlur,
  onReplySubmit,
  onReact,
  onMenuOpenChange,
  viewsOpen,
  onViewsOpenChange,
  onToast,
}: {
  accountId: number;
  peer: StoryPeerX;
  item: StoryItemX;
  items: TgStoryItem[];
  itemIndex: number;
  isVideo: boolean;
  activeTimed: boolean;
  ready: boolean;
  paused: boolean;
  holding: boolean;
  muted: boolean;
  /** The emoji we've reacted with on this item ("" = none). */
  sentReaction: string;
  videoProgress: number;
  captionExpanded: boolean;
  tr: Tr;
  onStatus: (s: { ready: boolean; failed: boolean }) => void;
  onVideoProgress: (p: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onToggleMute: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  navGuard: (fn: () => void) => () => void;
  onExpandCaption: () => void;
  onFoldCaption: () => void;
  onComposerFocus: () => void;
  onComposerBlur: () => void;
  onReplySubmit: (text: string) => void;
  /** Toggle a reaction (emoji) on the active story. */
  onReact: (emoji: string) => void;
  onMenuOpenChange: (open: boolean) => void;
  /** Whether the own-story viewers list is open (owned by the parent). */
  viewsOpen: boolean;
  /** Open/close the own-story viewers list (also pauses the story). */
  onViewsOpenChange: (open: boolean) => void;
  onToast: (msg: string) => void;
}) {
  const displayName = peer.isSelf ? tr("myStory", "Sizning hikoyangiz") : peer.name;
  const ageLabel = fmtStoryAge(item.date, tr);
  const hasCaption = Boolean(item.caption && item.caption.trim().length > 0);
  const isOwn = Boolean(peer.isSelf || item.isOut);

  const fwdName = item.fwdFrom?.name ?? item.forwardInfo?.fromName ?? null;
  const edited = Boolean(item.edited || item.editDate);
  const visibilityLabel = fmtVisibility(item.visibility, tr);

  const holdBind = {
    onPointerDown: onHoldStart,
    onPointerUp: onHoldEnd,
    onPointerLeave: onHoldEnd,
    onPointerCancel: onHoldEnd,
  };

  // Stop a header/composer/caption press from being read as a media hold.
  const stopHold = (e: React.PointerEvent) => e.stopPropagation();

  // Own-story views + reactions (self only). DEFENSIVE query: only fetched for
  // our own stories, and a missing/failing endpoint resolves to empty — so the
  // footer hides for others' stories and when nobody has viewed yet.
  const viewsQ = useTgStoryViews(accountId, peer.peerId, item.id, isOwn);
  const views = viewsQ.data;
  const showOwnFooter = isOwn && !!views && views.count > 0;

  return (
    <div
      className={"StoryViewer__slideInner" + (holding ? " StoryViewer__slideInner--holding" : "")}
      onMouseDown={(e) => e.stopPropagation()}
      {...holdBind}
    >
      {/* media */}
      <StoryStage
        key={`${peer.peerId}-${item.id}`}
        accountId={accountId}
        peerId={peer.peerId}
        item={item}
        isVideo={isVideo}
        muted={muted}
        paused={paused}
        onStatus={onStatus}
        onProgress={onVideoProgress}
        onEnded={onNext}
        tr={tr}
      />

      <div className="StoryViewer__scrimTop" />

      {/* segmented progress */}
      <StoryProgressBar
        items={items}
        itemIndex={itemIndex}
        activeTimed={activeTimed}
        durationS={PHOTO_MS / 1000}
        paused={paused || !ready}
        videoProgress={videoProgress}
        onPhotoEnd={onNext}
      />

      {/* peer header */}
      <div className="StoryViewer__header" onPointerDown={stopHold}>
        <div className="StoryViewer__sender">
          <TgAvatar accountId={accountId} peerId={peer.peerId} name={peer.name} size={36} />
          <div className="StoryViewer__meta">
            <span className="StoryViewer__name">{displayName}</span>
            <div className="StoryViewer__metaRow">
              {fwdName && (
                <span className="StoryViewer__metaItem StoryViewer__metaFwd">↻ {fwdName}</span>
              )}
              {ageLabel && <span className="StoryViewer__metaItem">{ageLabel}</span>}
              {edited && (
                <span className="StoryViewer__metaItem">{tr("storyEdited", "tahrirlangan")}</span>
              )}
            </div>
          </div>
        </div>
        <div className="StoryViewer__actions">
          {visibilityLabel && (
            <span className="StoryViewer__who" title={visibilityLabel}>
              {visibilityLabel}
            </span>
          )}
          {isVideo && (
            <button
              type="button"
              className="StoryViewer__btn"
              aria-label={muted ? tr("unmute", "Ovozni yoqish") : tr("mute", "Ovozsiz")}
              onClick={onToggleMute}
            >
              {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>
          )}
          <StoryMenu
            accountId={accountId}
            peerId={peer.peerId}
            item={item}
            isOwn={isOwn}
            tr={tr}
            onOpenChange={onMenuOpenChange}
            onToast={onToast}
          />
          <button
            type="button"
            className="StoryViewer__btn"
            aria-label={tr("close", "Yopish")}
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* tap-left / tap-right navigation (hidden while holding) */}
      <button
        type="button"
        className="StoryViewer__nav StoryViewer__nav--prev"
        aria-label={tr("previous", "Oldingi")}
        onClick={navGuard(onPrev)}
      >
        <ChevronLeft className="StoryViewer__navIcon" />
      </button>
      <button
        type="button"
        className="StoryViewer__nav StoryViewer__nav--next"
        aria-label={tr("next", "Keyingi")}
        onClick={navGuard(onNext)}
      >
        <ChevronRight className="StoryViewer__navIcon" />
      </button>

      {/* caption (clamp → expand) */}
      {hasCaption && (
        <StoryCaption
          key={`cap-${peer.peerId}-${item.id}`}
          accountId={accountId}
          peerId={peer.peerId}
          item={item}
          expanded={captionExpanded}
          onExpand={onExpandCaption}
          onFold={onFoldCaption}
          tr={tr}
        />
      )}

      {/* own-story views footer (StoryFooter port) or the reply composer */}
      {showOwnFooter ? (
        <div className="StoryViewer__footer" onPointerDown={stopHold}>
          <button
            type="button"
            className="StoryViewer__viewInfo"
            aria-label={tr("storyViewers", "Ko'rganlar")}
            onClick={() => onViewsOpenChange(true)}
          >
            {views!.viewers.length > 0 && (
              <span className="StoryViewer__viewAvatars">
                {views!.viewers.slice(0, 3).map((v, i) => (
                  <span
                    key={`${v.id}-${i}`}
                    className="StoryViewer__viewAvatar"
                    style={{ zIndex: 3 - i, marginInlineStart: i === 0 ? 0 : "-0.5rem" }}
                  >
                    <TgAvatar accountId={accountId} peerId={v.id} name={v.name} size={24} />
                  </span>
                ))}
              </span>
            )}
            <span className="StoryViewer__views">
              <Eye className="size-4" /> {views!.count}
            </span>
            {views!.reactionsCount > 0 && (
              <span className="StoryViewer__footerReacts">
                <Heart className="size-4" /> {views!.reactionsCount}
              </span>
            )}
          </button>
        </div>
      ) : (
        !isOwn && (
          <div className="StoryViewer__composer" onPointerDown={stopHold}>
            <StoryComposer
              tr={tr}
              onFocus={onComposerFocus}
              onBlur={onComposerBlur}
              onSubmit={onReplySubmit}
            />
            <button
              type="button"
              className={"StoryViewer__heart" + (sentReaction ? " StoryViewer__heart--on" : "")}
              aria-label={tr("react", "Reaksiya")}
              onClick={() => onReact(HEART)}
            >
              {sentReaction && sentReaction !== HEART ? (
                <span className="StoryViewer__heartEmoji">{sentReaction}</span>
              ) : (
                <Heart className="size-6" />
              )}
            </button>
          </div>
        )
      )}

      {/* own-story viewers list (opens from the footer) */}
      {isOwn && viewsOpen && (
        <StoryViewsModal
          accountId={accountId}
          views={views}
          loading={viewsQ.isLoading}
          tr={tr}
          onClose={() => onViewsOpenChange(false)}
        />
      )}
    </div>
  );
}

// ── own-story viewers list (StoryViewModal.tsx / StoryView.tsx port) ──────────
// A sheet of viewer rows (avatar + name + view time + the reaction they left).
// Portaled to <body> with a full-screen backdrop so an outside click / Esc
// closes it (it sits above the story chrome). Defensive: never assumes `views`
// is present, and shows a friendly empty state.
function StoryViewsModal({
  accountId,
  views,
  loading,
  tr,
  onClose,
}: {
  accountId: number;
  views: TgStoryViews | undefined;
  loading: boolean;
  tr: Tr;
  onClose: () => void;
}) {
  // Esc is handled centrally by the viewer (it closes this list first); here we
  // just own the backdrop / close-button dismissal.
  const viewers = views?.viewers ?? [];
  const count = views?.count ?? 0;

  return createPortal(
    // Portals bubble through the REACT tree, so pointer/mouse events here would
    // otherwise reach the slide's hold-to-pause handler — contain them, and close
    // on an outside (backdrop) press.
    <div
      className="tg-surface StoryViewer__viewsBackdrop"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="StoryViewer__viewsSheet"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="StoryViewer__viewsHeader">
          <span className="StoryViewer__viewsTitle">
            {count > 0
              ? `${count} ${tr("storyViewsWord", "ko'rish")}`
              : tr("storyNobodyViewed", "Hali hech kim ko'rmagan")}
          </span>
          <button
            type="button"
            className="StoryViewer__viewsClose"
            aria-label={tr("close", "Yopish")}
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="StoryViewer__viewsList">
          {loading && viewers.length === 0 ? (
            <div className="StoryViewer__viewsState">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : viewers.length === 0 ? (
            <div className="StoryViewer__viewsState">
              {tr("storyNobodyViewed", "Hali hech kim ko'rmagan")}
            </div>
          ) : (
            viewers.map((v, i) => <StoryViewerRow key={`${v.id}-${i}`} accountId={accountId} view={v} />)
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// One viewer row: avatar + name over its view time, with the reaction they left
// (if any) pinned to the trailing edge.
function StoryViewerRow({ accountId, view }: { accountId: number; view: TgStoryView }) {
  const when = fmtViewerDate(view.date);
  return (
    <div className="StoryViewer__viewer">
      <TgAvatar accountId={accountId} peerId={view.id} name={view.name} size={40} />
      <div className="StoryViewer__viewerMeta">
        <span className="StoryViewer__viewerName">{view.name}</span>
        {when && <span className="StoryViewer__viewerDate">{when}</span>}
      </div>
      {view.reaction && <span className="StoryViewer__viewerReaction">{view.reaction}</span>}
    </div>
  );
}

// ── a partially-visible neighbour peer (thumbnail + avatar + name) ────────────
function PreviewSlide({
  accountId,
  peer,
  tr,
  onClick,
}: {
  accountId: number;
  peer: StoryPeerX;
  tr: Tr;
  onClick: () => void;
}) {
  const first = peer.items[0];
  const { src } = useTgMediaSrc(
    first ? tgStoryMediaUrl(accountId, peer.peerId, first.id, true) : null,
  );
  return (
    <button
      type="button"
      className="StoryViewer__preview"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      {src ? (
        <img src={src} alt="" draggable={false} className="StoryViewer__previewMedia" />
      ) : (
        <div className="StoryViewer__previewMedia StoryViewer__previewMedia--empty" />
      )}
      <div className="StoryViewer__previewScrim" />
      <div className="StoryViewer__previewInner">
        <TgAvatar accountId={accountId} peerId={peer.peerId} name={peer.name} size={54} />
        <span className="StoryViewer__previewName">
          {peer.isSelf ? tr("myStory", "Sizning hikoyangiz") : peer.name}
        </span>
      </div>
    </button>
  );
}

// ── segmented progress (StoryProgress.tsx port) ───────────────────────────────
// Past items are full, the active one animates (CSS keyframe for a photo / a
// failed video, or a live translate for a playing video), future items are empty.
function StoryProgressBar({
  items,
  itemIndex,
  activeTimed,
  durationS,
  paused,
  videoProgress,
  onPhotoEnd,
}: {
  items: TgStoryItem[];
  itemIndex: number;
  activeTimed: boolean;
  durationS: number;
  paused: boolean;
  videoProgress: number;
  onPhotoEnd: () => void;
}) {
  return (
    <div className="StoryViewer__indicators">
      {items.map((s, i) => {
        const state = i < itemIndex ? "viewed" : i === itemIndex ? "active" : "future";
        return (
          <span key={s.id} className={`StoryViewer__seg StoryViewer__seg--${state}`}>
            {state === "active" &&
              (activeTimed ? (
                <i
                  key={`t-${s.id}`}
                  className={"StoryViewer__segInner" + (paused ? " StoryViewer__segInner--paused" : "")}
                  style={{ animationDuration: `${durationS}s` }}
                  onAnimationEnd={(e) => {
                    if (e.animationName.startsWith("tgstory-progress")) onPhotoEnd();
                  }}
                />
              ) : (
                <i
                  className="StoryViewer__segInner StoryViewer__segInner--video"
                  style={{ transform: `translateX(${(Math.min(1, videoProgress) - 1) * 100}%)` }}
                />
              ))}
          </span>
        );
      })}
    </div>
  );
}

// ── caption with 3-line clamp + "Show more" (StoryCaption.tsx port) ───────────
const CAPTION_LINES = 3;
function StoryCaption({
  accountId,
  peerId,
  item,
  expanded,
  onExpand,
  onFold,
  tr,
}: {
  accountId: number;
  peerId: number;
  item: StoryItemX;
  expanded: boolean;
  onExpand: () => void;
  onFold: () => void;
  tr: Tr;
}) {
  const textRef = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState(false);

  // Measure once per caption: does the text exceed 3 lines?
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const lineH = parseFloat(style.lineHeight) || 20;
    setOverflow(el.scrollHeight > lineH * CAPTION_LINES + 2);
  }, [item.caption]);

  const canExpand = overflow && !expanded;

  return (
    <>
      {expanded && (
        <div
          className="StoryViewer__captionBackdrop"
          role="button"
          aria-label={tr("close", "Yopish")}
          onClick={onFold}
        />
      )}
      <div
        className={
          "StoryViewer__captionWrap" +
          (expanded ? " StoryViewer__captionWrap--expanded" : "") +
          (canExpand ? " StoryViewer__captionWrap--clamped" : "")
        }
      >
        <div
          className="StoryViewer__caption"
          role={canExpand ? "button" : undefined}
          onClick={canExpand ? onExpand : undefined}
        >
          <div
            ref={textRef}
            className="StoryViewer__captionText"
            style={
              canExpand
                ? ({ WebkitLineClamp: CAPTION_LINES } as React.CSSProperties)
                : undefined
            }
          >
            {renderEntities(
              item.caption as string,
              item.entities,
              "",
              tr,
              accountId,
              `story-${peerId}-${item.id}`,
            )}
          </div>
        </div>
        {canExpand && (
          <button type="button" className="StoryViewer__showMore" onClick={onExpand}>
            {tr("storyShowMore", "Ko'proq")}
          </button>
        )}
      </div>
    </>
  );
}

// ── reply composer (a text input that posts via the optional callback) ────────
function StoryComposer({
  tr,
  onFocus,
  onBlur,
  onSubmit,
}: {
  tr: Tr;
  onFocus: () => void;
  onBlur: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text);
    setText("");
  };
  return (
    <div className="StoryViewer__composerInput">
      <input
        type="text"
        value={text}
        placeholder={tr("storyReplyPlaceholder", "Hikoyaga javob berish...")}
        onChange={(e) => setText(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
    </div>
  );
}

// ── 3-dot menu (copy link / save / download / report / delete). Portaled with a
//    full-screen backdrop so an outside click always closes it — the active
//    slide swallows bubbling mousedowns, so a window listener would be unreliable.
function StoryMenu({
  accountId,
  peerId,
  item,
  isOwn,
  tr,
  onOpenChange,
  onToast,
}: {
  accountId: number;
  peerId: number;
  item: StoryItemX;
  isOwn: boolean;
  tr: Tr;
  onOpenChange: (open: boolean) => void;
  onToast: (msg: string) => void;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    setAnchor(
      r ? { right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 6 } : { right: 12, top: 56 },
    );
    setOpen(true);
    onOpenChange(true);
  };

  const soon = () => {
    onToast(tr("comingSoon", "Tez orada"));
    close();
  };
  const download = () => {
    void downloadTgMedia(
      tgStoryMediaUrl(accountId, peerId, item.id),
      `story-${peerId}-${item.id}.${item.kind === "video" ? "mp4" : "jpg"}`,
    );
    close();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={"StoryViewer__btn" + (open ? " StoryViewer__btn--active" : "")}
        aria-label={tr("more", "Yana")}
        onClick={toggle}
      >
        <MoreHorizontal className="size-5" />
      </button>
      {open &&
        anchor &&
        createPortal(
          <div
            className="tg-surface StoryViewer__menuBackdrop"
            onMouseDown={close}
            onContextMenu={(e) => {
              e.preventDefault();
              close();
            }}
          >
            <div
              className="StoryViewer__menu"
              style={{ right: anchor.right, top: anchor.top }}
              role="menu"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button type="button" className="StoryViewer__menuItem" onClick={soon}>
                {tr("copyLink", "Havolani nusxalash")}
              </button>
              <button type="button" className="StoryViewer__menuItem" onClick={soon}>
                {tr("storySave", "Saqlash")}
              </button>
              <button type="button" className="StoryViewer__menuItem" onClick={download}>
                {tr("download", "Yuklab olish")}
              </button>
              <button
                type="button"
                className="StoryViewer__menuItem StoryViewer__menuItem--danger"
                onClick={soon}
              >
                {isOwn ? tr("delete", "O'chirish") : tr("report", "Shikoyat")}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// ── one story's media + its timing (photo = CSS bar drives advance; video =
//    element `ended` / `timeupdate` drives it). A broken load reports `failed`
//    so the parent falls back to the timed bar and the sequence keeps moving. ──
function StoryStage({
  accountId,
  peerId,
  item,
  isVideo,
  muted,
  paused,
  onStatus,
  onProgress,
  onEnded,
  tr,
}: {
  accountId: number;
  peerId: number;
  item: TgStoryItem;
  isVideo: boolean;
  muted: boolean;
  paused: boolean;
  onStatus: (s: { ready: boolean; failed: boolean }) => void;
  onProgress: (p: number) => void;
  onEnded: () => void;
  tr: Tr;
}) {
  const { src, failed } = useTgMediaSrc(tgStoryMediaUrl(accountId, peerId, item.id));
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const ready = Boolean(src) || failed;
  useEffect(() => {
    onStatusRef.current({ ready, failed });
  }, [ready, failed]);

  // Video play/pause reflects the hold state; keep the element's muted flag in
  // sync (React's `muted` attribute alone isn't reliable).
  const playable = isVideo && !!src && !failed;
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playable) return;
    v.muted = muted;
    if (paused) v.pause();
    else void v.play().catch(() => {});
  }, [paused, muted, playable, src]);

  return (
    <div className="StoryViewer__mediaBox">
      {playable ? (
        <video
          ref={videoRef}
          src={src ?? undefined}
          className="StoryViewer__media"
          autoPlay
          muted={muted}
          playsInline
          draggable={false}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration > 0) onProgressRef.current(Math.min(1, v.currentTime / v.duration));
          }}
          onEnded={() => onEndedRef.current()}
          onError={() => onEndedRef.current()}
        />
      ) : !isVideo && src && !failed ? (
        <img src={src} alt="" draggable={false} className="StoryViewer__media" />
      ) : (
        <div className="StoryViewer__placeholder">
          <span>
            {failed ? tr("storyNoMedia", "Media yuklanmadi") : tr("loading", "Yuklanmoqda...")}
          </span>
        </div>
      )}
    </div>
  );
}

// ── sizing (dimensions.ts port) ──────────────────────────────────────────────
const BASE_SCREEN_W = 1200;
const BASE_SCREEN_H = 800;
const BASE_ACTIVE_W = 405;
const BASE_ACTIVE_H = 720;
const BASE_PREV_W = 135;
const BASE_GAP = 40;
const MOBILE_MAX = 600;

type SlideSizes = {
  isMobile: boolean;
  activeW: number;
  activeH: number;
  fromActiveScale: number;
  offsetX: (pos: number) => number;
};

/** Compute the active-slide + preview dimensions from the viewport, re-measuring
 *  on resize. Mirrors Telegram's `calculateSlideSizes`/`calculateOffsetX`. */
function useSlideSizes(): SlideSizes {
  const [wh, setWh] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : BASE_SCREEN_W,
    h: typeof window !== "undefined" ? window.innerHeight : BASE_SCREEN_H,
  }));
  useEffect(() => {
    const onResize = () => setWh({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return useMemo(() => {
    const isMobile = wh.w <= MOBILE_MAX;
    const scale = Math.min(wh.w / BASE_SCREEN_W, wh.h / BASE_SCREEN_H);
    const activeW = isMobile ? Math.min(wh.w, (wh.h * BASE_ACTIVE_W) / BASE_ACTIVE_H) : Math.round(BASE_ACTIVE_W * scale);
    const activeH = isMobile ? (activeW * BASE_ACTIVE_H) / BASE_ACTIVE_W : Math.round(BASE_ACTIVE_H * scale);
    const prevW = Math.round(BASE_PREV_W * scale);
    const gap = BASE_GAP * scale;
    const fromActiveScale = prevW / activeW;
    const firstStep = activeW / 2 + gap + prevW / 2;
    const prevStep = prevW + gap;
    const offsetX = (pos: number) => {
      if (pos === 0) return 0;
      const mag = firstStep + (Math.abs(pos) - 1) * prevStep;
      return pos > 0 ? mag : -mag;
    };
    return { isMobile, activeW, activeH, fromActiveScale, offsetX };
  }, [wh]);
}

/** Ghost-morph translate/scale from the ribbon avatar rect toward viewport centre. */
function computeMorph(
  rect: DOMRect | null | undefined,
  sizes: SlideSizes,
): { dx: number; dy: number; scale: number } {
  if (!rect || typeof window === "undefined") return { dx: 0, dy: 0, scale: 0.6 };
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const rx = rect.left + rect.width / 2;
  const ry = rect.top + rect.height / 2;
  const scale = Math.max(0.15, Math.min(0.9, rect.width / sizes.activeW));
  return { dx: rx - cx, dy: ry - cy, scale };
}

// ── helpers ───────────────────────────────────────────────────────────────────
/** "everybody"/"contacts"/"closeFriends"/"nobody" → a short "who can see" label. */
function fmtVisibility(
  v: StoryItemX["visibility"],
  tr: Tr,
): string | null {
  switch (v) {
    case "contacts":
      return tr("storyVisContacts", "Kontaktlar");
    case "closeFriends":
      return tr("storyVisCloseFriends", "Yaqin do'stlar");
    case "nobody":
      return tr("storyVisNobody", "Faqat men");
    default:
      return null; // "everybody" / unknown → no chip
  }
}

/** Absolute view time for a viewer row ("Jul 19, 14:30"). Accepts unix seconds
 *  (the story contract) OR an ISO string, and guards missing/invalid values to
 *  "" so a row without a date simply omits it. */
function fmtViewerDate(date: number | string | null | undefined): string {
  if (date == null || date === "") return "";
  let ms: number;
  if (typeof date === "number") {
    if (!Number.isFinite(date)) return "";
    ms = date < 1e12 ? date * 1000 : date; // seconds vs milliseconds
  } else {
    const p = Date.parse(date);
    if (Number.isNaN(p)) return "";
    ms = p;
  }
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Relative age for the header ("hozirgina" / "5 daqiqa oldin" / "3 soat oldin" /
 *  "2 kun oldin"). Guards missing/invalid dates to "". */
function fmtStoryAge(dateSec: number | null | undefined, tr: Tr): string {
  if (!dateSec || !Number.isFinite(dateSec)) return "";
  const diff = Math.max(0, Date.now() / 1000 - dateSec);
  if (diff < 60) return tr("storyJustNow", "hozirgina");
  if (diff < 3600) return `${Math.floor(diff / 60)} ${tr("storyMinAgo", "daqiqa oldin")}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ${tr("storyHourAgo", "soat oldin")}`;
  return `${Math.floor(diff / 86400)} ${tr("storyDayAgo", "kun oldin")}`;
}
