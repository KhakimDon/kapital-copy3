// Message context menu + sender profile popover for the Telegram surface.
//
// The context menu is a faithful port of the real Telegram Web A ("A" client)
// MessageContextMenu — the same DOM hierarchy and class names as the reference
// (`.MessageContextMenu` → a `.ReactionSelector` quick-reaction pill floating on
// top + a `.bubble` wrapping a `.MessageContextMenu_items` list of `.MenuItem`
// rows). Its styling lives in the shared `tgweb-menu.css` (ported from
// ui/Menu.scss + ui/MenuItem.scss + MessageContextMenu.scss + ReactionSelector.scss).
//
// It renders through a portal to <body>, so the portal wrapper carries the
// `tg-surface` class itself: that both matches the scoped `.tg-surface .Menu…`
// selectors AND resolves the real `--color-*` tokens (defined on `.tg-surface`).
// The SenderCard popover still floats on our shadcn `bg-popover` tokens.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckSquare,
  ChevronDown,
  Clock,
  Copy,
  CornerUpLeft,
  Download,
  Flag,
  Forward,
  Image as ImageIcon,
  Link as LinkIcon,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useToastStore } from "@/shared/notifications/store";
import { ChatAvatar } from "../avatar";
import { useTgPeer, type TgMessage } from "./api";
import { downloadTgMedia, fetchTgMediaBlobUrl } from "./media";
import { useTgChatActions } from "./chat-actions";
import { TgReactionPicker } from "./reaction-picker";
import "./tgweb-menu.css";
import "./reaction-picker.css";

type Tr = (k: string, d: string) => string;

/**
 * Fallback quick-reaction set — the popular emoji shown when the chat's real
 * "available reactions" aren't known yet (see `resolveAvailableReactions`).
 * Longer than the 7-wide strip so the "show more" chevron is exercised.
 */
const POPULAR_REACTIONS = [
  "👍", "❤️", "🔥", "🥰", "👏", "😁", "🤔", "🤯",
  "😱", "🤬", "😢", "🎉", "🤩", "🙏", "👌", "🤡",
];

/** How many reactions fit in the strip before the "show more" chevron appears
 *  (ReactionSelector.tsx REACTIONS_AMOUNT). */
const REACTIONS_AMOUNT = 7;
/** Per-item appear stagger, ms (ReactionSelector.tsx FADE_IN_DELAY). */
const FADE_IN_DELAY = 18;

const uniq = (arr: string[]): string[] => Array.from(new Set(arr));

/** Order `list` by a `top`-reactions priority (unknowns keep their tail order). */
function sortByTop(list: string[], top?: string[] | null): string[] {
  if (!top || top.length === 0) return list;
  const rank = new Map(top.map((e, i) => [e, i] as const));
  return [...list].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
}

/**
 * Resolve the emoji set for the quick-reaction strip, defensively — the chat's
 * allowed reactions when the caller/backend provides them (an OPTIONAL, additive
 * `availableReactions` prop, or the same field inlined onto the message when the
 * backend denormalises it there), else the popular fallback. `topReactions`
 * (also optional) reorders by popularity.
 */
function resolveAvailableReactions(
  msg: TgMessage,
  available?: string[],
  top?: string[],
): string[] {
  const inlined = (msg as TgMessage & { availableReactions?: string[] | null }).availableReactions;
  const inlinedTop = (msg as TgMessage & { topReactions?: string[] | null }).topReactions;
  const source = available ?? inlined ?? POPULAR_REACTIONS;
  return sortByTop(uniq(source), top ?? inlinedTop);
}

/** Human date+time for the "last edited" info row (LastEditTimeMenuItem). */
function formatEditTime(iso: string): { short: string; full: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { short: "", full: "" };
  const short = d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { short, full: d.toLocaleString() };
}

/** Copy a photo to the clipboard. The auth'd media endpoint can't be read by a
 *  bare fetch, so resolve it to a blob object-URL first, then re-encode via a
 *  canvas to PNG (the format browsers reliably accept in `ClipboardItem`). */
async function copyImageToClipboard(url: string): Promise<void> {
  const objUrl = await fetchTgMediaBlobUrl(url);
  const img = new Image();
  img.src = objUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("toBlob failed");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** Push a lightweight ephemeral toast (used for not-yet-wired menu actions and
 *  copy-image feedback), reusing the app's macOS-style notification stack. */
function pushMenuToast(title: string, body: string): void {
  useToastStore.getState().push({
    id: `tg-menu-${Date.now()}`,
    title,
    body,
    icon: "telegram",
    link: "",
    module: "telegram",
    createdAt: new Date().toISOString(),
    isRead: false,
  });
}

// ── message context menu (portal, clamped to viewport) ─────────────────────────

export function TgBubbleMenu({
  x,
  y,
  msg,
  mediaUrl,
  tr,
  onClose,
  accountId,
  chatId,
  availableReactions,
  topReactions,
  onSelect,
  onReport,
}: {
  x: number;
  y: number;
  msg: TgMessage;
  mediaUrl: string;
  tr: Tr;
  onClose: () => void;
  /** OPTIONAL: the account + chat this bubble lives in. When provided, the chat's
   *  real available reactions are read from the peer detail (useTgPeer) to drive
   *  the quick-reaction strip; absent → the popular fallback is shown. */
  accountId?: number;
  chatId?: number;
  /** OPTIONAL: an explicit allowed-reactions list. Takes precedence over the
   *  peer-derived set (else a popular fallback is shown). */
  availableReactions?: string[];
  /** OPTIONAL: popularity order for the reaction strip. */
  topReactions?: string[];
  /** OPTIONAL: enter multi-select mode (falls back to a "coming soon" toast). */
  onSelect?: (msg: TgMessage) => void;
  /** OPTIONAL: report the message (falls back to a "coming soon" toast). */
  onReport?: (msg: TgMessage) => void;
}) {
  const actions = useTgChatActions();
  // The chat's real available reactions (Telegram's per-chat reaction set), read
  // from the peer detail. The chat header warms this query when the chat opens, so
  // this is usually a cache hit; a missing field, a loading/errored query, or the
  // "all"-reactions-allowed sentinel all fall through to the popular fallback.
  const peerReactions = (
    useTgPeer(accountId ?? null, chatId ?? null).data as
      | { availableReactions?: string[] | "all" | null }
      | undefined
  )?.availableReactions;
  const chatReactions = Array.isArray(peerReactions) ? peerReactions : undefined;
  const mine = msg.out;
  const text = msg.text;
  const media = msg.media ?? null;
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });
  const [pickerAt, setPickerAt] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // offsetWidth/Height are the untransformed layout box — measuring these keeps
    // the clamp accurate while the open animation scales the element.
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const pad = 8;
    let left = mine ? x - width : x;
    let top = y;
    if (left + width + pad > window.innerWidth) left = window.innerWidth - width - pad;
    if (left < pad) left = pad;
    if (top + height + pad > window.innerHeight) top = Math.max(pad, y - height);
    if (top < pad) top = pad;
    setPos({ left, top });
  }, [x, y, mine]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const canDownload = !!media && media.type !== "location" && media.downloadable !== false;
  const linkUrl =
    media?.type === "webpage"
      ? (media.url ?? null)
      : media?.type === "location"
        ? null
        : media
          ? mediaUrl
          : null;
  // Own text messages are editable (captions on own media too).
  const canEdit = mine && (!!text || !!media);
  // A photo can be copied to the clipboard where the browser supports it.
  const canCopyImage =
    media?.type === "photo" &&
    typeof ClipboardItem !== "undefined" &&
    typeof navigator.clipboard?.write === "function";
  const editTime = msg.editDate ? formatEditTime(msg.editDate) : null;

  // ── quick-reaction strip (data-driven; chevron opens the full picker) ──────
  const chosen = (msg.reactions ?? []).filter((r) => r.chosen).map((r) => r.emoji);
  const chosenSet = new Set(chosen);
  const source = resolveAvailableReactions(msg, availableReactions ?? chatReactions, topReactions);
  // chosen-but-unlisted reactions go first so the highlighted one is always shown
  const fullReactions = uniq([...chosen.filter((e) => !source.includes(e)), ...source]);
  // the strip fits one extra when that avoids showing a "show more" for a single item
  const stripReactions =
    fullReactions.length === REACTIONS_AMOUNT + 1
      ? fullReactions
      : fullReactions.slice(0, REACTIONS_AMOUNT);
  const withMore = stripReactions.length < fullReactions.length;

  const toggleReaction = (emoji: string) => actions.react(msg, chosenSet.has(emoji) ? null : emoji);
  const handleCopyImage = async () => {
    try {
      await copyImageToClipboard(mediaUrl);
      pushMenuToast(tr("copied", "Nusxalandi"), tr("copyImage", "Rasmni nusxalash"));
    } catch {
      pushMenuToast(tr("error", "Xatolik"), tr("copyImageFailed", "Rasmni nusxalab bo'lmadi"));
    }
  };
  const handleSelect = () =>
    onSelect ? onSelect(msg) : pushMenuToast(tr("comingSoon", "Tez orada"), tr("select", "Tanlash"));
  const handleReport = () =>
    onReport
      ? onReport(msg)
      : pushMenuToast(tr("comingSoon", "Tez orada"), tr("report", "Shikoyat qilish"));

  // "Show more" → the full searchable reaction picker replaces the menu (as in
  // the reference, opening the picker closes the context menu).
  if (pickerAt) {
    return (
      <TgReactionPicker
        x={pickerAt.x}
        y={pickerAt.y}
        mine={mine}
        tr={tr}
        onPick={(emoji) => {
          toggleReaction(emoji);
          onClose();
        }}
        onClose={onClose}
      />
    );
  }

  return createPortal(
    <div
      className="tg-surface fixed inset-0 z-[60]"
      onMouseDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={ref}
        style={{ left: pos.left, top: pos.top }}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          "Menu compact in-portal MessageContextMenu fluid with-reactions",
          mine ? "from-right" : "from-left",
        )}
      >
        {/* quick-reaction pill — the reference ReactionSelector, floating on top */}
        <div className={cn("ReactionSelector", !mine && "mirror")}>
          <div className="ReactionSelector__bubble-small" />
          <div className="ReactionSelector__items-wrapper">
            <div className="ReactionSelector__bubble-big" />
            <div className="ReactionSelector__items">
              <div className="ReactionSelector__reactions scrollable" role="menu">
                {stripReactions.map((emoji, i) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={emoji}
                    className={cn("ReactionSelectorReaction appear", chosenSet.has(emoji) && "chosen")}
                    style={
                      { "--tg-reaction-delay": `${(REACTIONS_AMOUNT - i) * FADE_IN_DELAY}ms` } as React.CSSProperties
                    }
                    onClick={run(() => toggleReaction(emoji))}
                  >
                    {emoji}
                  </button>
                ))}
                {withMore && (
                  <button
                    type="button"
                    className="ReactionSelector__show-more"
                    aria-label={tr("reactionsMore", "Ko'proq reaksiyalar")}
                    onClick={(e) => {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setPickerAt({ x: mine ? r.right : r.left, y: r.bottom });
                    }}
                  >
                    <ChevronDown />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* the menu card */}
        <div className="bubble menu-container custom-scroll">
          <div className="MessageContextMenu_items scrollable-content custom-scroll">
            <MenuItem icon={CornerUpLeft} onClick={run(() => actions.reply(msg))}>
              {tr("reply", "Javob berish")}
            </MenuItem>
            {canEdit && (
              <MenuItem icon={Pencil} onClick={run(() => actions.edit(msg))}>
                {tr("edit", "Tahrirlash")}
              </MenuItem>
            )}
            {text && (
              <MenuItem icon={Copy} onClick={run(() => void navigator.clipboard?.writeText(text))}>
                {tr("copy", "Nusxalash")}
              </MenuItem>
            )}
            {canCopyImage && (
              <MenuItem icon={ImageIcon} onClick={run(() => void handleCopyImage())}>
                {tr("copyImage", "Rasmni nusxalash")}
              </MenuItem>
            )}
            {linkUrl && (
              <MenuItem icon={LinkIcon} onClick={run(() => void navigator.clipboard?.writeText(linkUrl))}>
                {tr("copyLink", "Havolani nusxalash")}
              </MenuItem>
            )}
            <MenuItem
              icon={msg.pinned ? PinOff : Pin}
              onClick={run(() => actions.pin(msg))}
            >
              {msg.pinned ? tr("unpin", "Mahkamlashni bekor qilish") : tr("pin", "Mahkamlash")}
            </MenuItem>
            {canDownload && (
              <MenuItem
                icon={Download}
                onClick={run(() => void downloadTgMedia(mediaUrl, media?.name ?? "file"))}
              >
                {tr("download", "Yuklab olish")}
              </MenuItem>
            )}
            <MenuItem icon={Forward} onClick={run(() => actions.forward(msg))}>
              {tr("forward", "Yo'naltirish")}
            </MenuItem>
            <MenuItem icon={CheckSquare} onClick={run(handleSelect)}>
              {tr("select", "Tanlash")}
            </MenuItem>
            <MenuItem icon={Flag} onClick={run(handleReport)}>
              {tr("report", "Shikoyat qilish")}
            </MenuItem>
            {/* separator groups the destructive Delete apart from the rest */}
            <MenuSeparator />
            <MenuItem icon={Trash2} destructive onClick={run(() => actions.remove(msg))}>
              {tr("delete", "O'chirish")}
            </MenuItem>
            {/* info section — "last edited" timestamp (LastEditTimeMenuItem) */}
            {editTime && (
              <>
                <MenuSeparator />
                <MenuItem icon={Clock} disabled title={editTime.full}>
                  {tr("editedAt", "Tahrirlangan")} · {editTime.short}
                </MenuItem>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A single `.MenuItem` row — Telegram Web A's compact menu item (icon + label).
 *  `disabled` renders a non-interactive info row (e.g. the "last edited" line);
 *  `title` sets the native hover tooltip. */
function MenuItem({
  icon: Icon,
  children,
  onClick,
  destructive,
  disabled,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <div
      role="menuitem"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      title={title}
      className={cn("MenuItem compact", destructive && "destructive", disabled && "disabled")}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <Icon className="icon" />
      {children}
    </div>
  );
}

/** A `.MenuSeparator` divider between menu-item groups (ui/MenuSeparator). */
function MenuSeparator() {
  return <div role="separator" className="MenuSeparator" />;
}

// ── group sender profile popover (TG sender info, not an AIBA user) ────────────

export function SenderCard({
  x,
  y,
  id,
  name,
  tr,
  onClose,
}: {
  x: number;
  y: number;
  id: number | null;
  name: string;
  tr: Tr;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y + 8;
    if (left + width + pad > window.innerWidth) left = window.innerWidth - width - pad;
    if (left < pad) left = pad;
    if (top + height + pad > window.innerHeight) top = Math.max(pad, y - height - 8);
    if (top < pad) top = pad;
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60]" onMouseDown={onClose}>
      <div
        ref={ref}
        style={{ left: pos.left, top: pos.top }}
        onMouseDown={(e) => e.stopPropagation()}
        className="msg-menu-in absolute w-64 max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-border bg-popover p-4 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.4)]"
      >
        <div className="flex items-center gap-3">
          <ChatAvatar seed={String(id ?? name)} name={name || "?"} size={48} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold leading-tight">
              {name || tr("unknownSender", "Noma'lum")}
            </div>
            {id != null && (
              <div className="truncate text-xs text-muted-foreground">
                {tr("tgId", "TG ID")}: <span className="tabular-nums">{id}</span>
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {tr("senderHint", "Bu Telegram foydalanuvchisi, AIBA hisobi emas.")}
        </p>
      </div>
    </div>,
    document.body,
  );
}
