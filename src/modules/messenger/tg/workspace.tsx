// Telegram workspace — the messenger's "TG" mode. A corporate TG account
// (connected by an admin via QR) is browsed here: the account's dialogs on the
// left, the selected chat on the right (messages carry a "who wrote it" AIBA
// author badge). Admins get account + group-access (ACL) management. A user only
// sees the TG groups they've been granted.
//
// The left column is a faithful Telegram Web A LeftColumn: a hamburger ("☰")
// menu + search pill + folder tabs + dialog rows. All the AIBA-specific chrome
// (the Internal⇄Telegram switch, account picker, admin panels, appearance
// settings) hangs off that hamburger menu — exactly where Telegram keeps its
// main menu — so the surface reads as the real client.
import { startTransition, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, KeyRound, Menu, MessageSquare, Plus, Settings, ShieldCheck } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import "./theme.css";
import "./icons.css";
import "./settings.css";
import "./tgweb-menu.css";
import "./tg-anim.css";
import { useUrlState } from "@/shared/hooks/use-url-state";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ChatAvatar } from "../avatar";
import { useTgAccounts, type TgAccount } from "./api";
import { TgChatList } from "./chat-list";
import { TgChatPane } from "./chat-pane";
import { TgAccountsAdmin } from "./accounts-admin";
import { TgGrantsAdmin } from "./grants-admin";
import { TgSettings } from "./settings";
import { useTgSettings } from "./settings-store";

type Tr = (k: string, d: string) => string;
type TgPanel = "accounts" | "grants" | "settings";

export type MsgMode = "internal" | "tg";

/** Segmented Ichki / Telegram toggle — still exported for the internal surface's
 *  own top-of-list switcher (see page.tsx / the internal chat list). */
export function TgSwitcher({ mode, onMode }: { mode: MsgMode; onMode: (m: MsgMode) => void }) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
      {(["internal", "tg"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onMode(m)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m === "internal" ? t("modules.messenger.tg.internal", { defaultValue: "Ichki" }) : "Telegram"}
        </button>
      ))}
    </div>
  );
}

export function TgWorkspace({
  isAdmin,
  onMode,
}: {
  isAdmin: boolean;
  /** Switch the messenger surface (Internal ⇄ Telegram) — lives in the hamburger. */
  onMode: (m: MsgMode) => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.tg.${k}`, { defaultValue: d });
  const accounts = useTgAccounts();
  const [accRaw, setAcc] = useUrlState("tgacc", "");
  const [tgChatRaw, setTgChat] = useUrlState("tgchat", "");
  const [panel, setPanel] = useState<null | "accounts" | "grants" | "settings">(null);

  // Appearance settings (per-browser) — stamped onto the `.tg-surface` roots so
  // settings.css can apply the chosen wallpaper + message text size.
  const wallpaper = useTgSettings((s) => s.wallpaper);
  const bubbleTextSize = useTgSettings((s) => s.bubbleTextSize);
  const animationLevel = useTgSettings((s) => s.animationLevel);

  const accList = accounts.data ?? [];
  const accountId = accRaw ? Number(accRaw) : accList[0]?.id ?? null;
  const chatId = tgChatRaw ? Number(tgChatRaw) : null;
  const activeAcc = accList.find((a) => a.id === accountId) ?? null;

  // The hamburger menu — Telegram's main menu, carrying the AIBA-specific actions.
  const hamburger: ReactNode = (
    <HamburgerMenu
      tr={tr}
      activeAcc={activeAcc}
      accList={accList}
      accountId={accountId}
      isAdmin={isAdmin}
      onPickAccount={(id) => {
        setAcc(String(id));
        setTgChat("");
      }}
      onMode={onMode}
      onPanel={setPanel}
    />
  );

  return (
    <>
      {/* LEFT — Telegram LeftColumn (hamburger + search + folders + dialogs) */}
      <aside
        data-tg-wallpaper={wallpaper}
        data-tg-textsize={bubbleTextSize}
        data-tg-anim={animationLevel}
        className={cn(
          "tg-surface relative z-10 flex w-[26rem] max-w-full shrink-0 flex-col border-r border-[var(--color-borders)] bg-[var(--color-background)]",
          "max-md:w-full max-md:border-r-0",
          chatId && "max-md:hidden",
        )}
      >
        {accList.length === 0 ? (
          <>
            <div className="left-header flex h-14 items-center px-3">{hamburger}</div>
            <div className="grid flex-1 place-items-center p-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <span className="grid size-14 place-items-center rounded-2xl bg-[var(--color-background-secondary)]">
                  <KeyRound className="size-6 text-[var(--color-text-secondary)]" />
                </span>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {tr("noAccounts", "Hali Telegram akkaunt ulanmagan")}
                </p>
                {isAdmin && (
                  <Button size="sm" className="gap-1.5" onClick={() => setPanel("accounts")}>
                    <Plus className="size-4" /> {tr("addAccount", "Akkaunt qo'shish")}
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : accountId != null ? (
          <TgChatList
            accountId={accountId}
            activeChatId={chatId}
            onSelect={(id) => startTransition(() => setTgChat(String(id)))}
            headerLeading={hamburger}
          />
        ) : null}
      </aside>

      {/* MIDDLE — the selected TG chat */}
      <main
        data-tg-wallpaper={wallpaper}
        data-tg-textsize={bubbleTextSize}
        data-tg-anim={animationLevel}
        className={cn("tg-surface tg-wallpaper relative flex min-w-0 flex-1 flex-col", !chatId && "max-md:hidden")}
      >
        {accountId != null && chatId != null ? (
          <TgChatPane
            accountId={accountId}
            chatId={chatId}
            onBack={() => setTgChat("")}
            onOpenChat={(id) => startTransition(() => setTgChat(String(id)))}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <span className="tg-pill shadow-sm">{tr("pickChat", "Suhbatni tanlang")}</span>
          </div>
        )}
      </main>

      {/* Admin sheets */}
      <Sheet open={panel === "accounts"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent className="w-[26rem] max-w-full overflow-y-auto p-4 sm:max-w-md">
          <TgAccountsAdmin onClose={() => setPanel(null)} />
        </SheetContent>
      </Sheet>
      <Sheet open={panel === "grants"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent className="w-[30rem] max-w-full overflow-y-auto p-4 sm:max-w-lg">
          <TgGrantsAdmin onClose={() => setPanel(null)} />
        </SheetContent>
      </Sheet>

      {/* Settings — appearance + local prefs, open to everyone. */}
      <Sheet open={panel === "settings"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent hideClose className="w-[24rem] max-w-full p-0 sm:max-w-sm">
          <TgSettings onClose={() => setPanel(null)} />
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── the ☰ main menu ────────────────────────────────────────────────────────────
// Telegram Web A's LeftMainHeader hamburger + the DropdownMenu it opens, ported
// to a custom popover: the ☰ button below, plus a portaled `.Menu.main-menu`
// bubble anchored under it. It carries the AIBA main-menu contract — the account
// header, the account picker, the Internal⇄Telegram switch, the admin panels and
// Settings — as faithful `.MenuItem` rows. Closes on outside-click / Escape / item
// click (matching TgBubbleMenu in message-menu.tsx).
function HamburgerMenu({
  tr,
  activeAcc,
  accList,
  accountId,
  isAdmin,
  onPickAccount,
  onMode,
  onPanel,
}: {
  tr: Tr;
  activeAcc: TgAccount | null;
  accList: TgAccount[];
  accountId: number | null;
  isAdmin: boolean;
  onPickAccount: (id: number) => void;
  onMode: (m: MsgMode) => void;
  onPanel: (p: TgPanel) => void;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const open = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ x: r.left, y: r.bottom });
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (anchor ? setAnchor(null) : open())}
        data-state={anchor ? "open" : "closed"}
        className="mr-1.5 grid size-10 shrink-0 place-items-center rounded-full text-[var(--color-text-secondary)] outline-none transition-colors hover:bg-[var(--color-chat-hover)] data-[state=open]:bg-[var(--color-chat-hover)]"
        aria-label={tr("menu", "Menyu")}
        aria-haspopup="menu"
        aria-expanded={anchor ? true : false}
      >
        <Menu className="size-[1.375rem]" />
      </button>
      {anchor && (
        <HamburgerPopover
          anchor={anchor}
          tr={tr}
          activeAcc={activeAcc}
          accList={accList}
          accountId={accountId}
          isAdmin={isAdmin}
          onPickAccount={onPickAccount}
          onMode={onMode}
          onPanel={onPanel}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
}

function HamburgerPopover({
  anchor,
  tr,
  activeAcc,
  accList,
  accountId,
  isAdmin,
  onPickAccount,
  onMode,
  onPanel,
  onClose,
}: {
  anchor: { x: number; y: number };
  tr: Tr;
  activeAcc: TgAccount | null;
  accList: TgAccount[];
  accountId: number | null;
  isAdmin: boolean;
  onPickAccount: (id: number) => void;
  onMode: (m: MsgMode) => void;
  onPanel: (p: TgPanel) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.x, top: anchor.y + 6 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // offsetWidth/Height are the untransformed layout box — measuring these keeps
    // the clamp accurate while the open animation scales the element.
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const pad = 8;
    let left = anchor.x;
    let top = anchor.y + 6;
    if (left + width + pad > window.innerWidth) left = window.innerWidth - width - pad;
    if (left < pad) left = pad;
    if (top + height + pad > window.innerHeight) top = Math.max(pad, window.innerHeight - height - pad);
    if (top < pad) top = pad;
    setPos({ left, top });
  }, [anchor]);

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

  return createPortal(
    <div className="tg-surface fixed inset-0 z-[60]" onMouseDown={onClose}>
      <div
        ref={ref}
        role="menu"
        style={{ left: pos.left, top: pos.top }}
        onMouseDown={(e) => e.stopPropagation()}
        className="Menu compact main-menu in-portal fluid"
      >
        <div className="bubble">
          {activeAcc && (
            <div className="menu-account">
              <span className="title">{activeAcc.title}</span>
              {activeAcc.phone && <span className="subtitle">{activeAcc.phone}</span>}
            </div>
          )}

          {accList.length > 1 && (
            <>
              <div className="MenuSeparator" />
              <div className="menu-caption">{tr("pickAccount", "Akkaunt tanlang")}</div>
              {accList.map((a) => (
                <div
                  key={a.id}
                  role="menuitemradio"
                  aria-checked={a.id === accountId}
                  tabIndex={0}
                  className="MenuItem compact account-item"
                  onClick={run(() => onPickAccount(a.id))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      run(() => onPickAccount(a.id))();
                    }
                  }}
                >
                  <ChatAvatar seed={String(a.id)} name={a.title} size={26} className="avatar" />
                  <span className="menu-item-name">{a.title}</span>
                  {a.id === accountId && <Check className="check" />}
                </div>
              ))}
            </>
          )}

          <div className="MenuSeparator" />
          <MenuRow icon={MessageSquare} onClick={run(() => onMode("internal"))}>
            {tr("switchInternal", "Ichki messenger")}
          </MenuRow>

          {isAdmin && (
            <>
              <div className="MenuSeparator" />
              <MenuRow icon={KeyRound} onClick={run(() => onPanel("accounts"))}>
                {tr("accounts", "Akkauntlar")}
              </MenuRow>
              <MenuRow icon={ShieldCheck} onClick={run(() => onPanel("grants"))}>
                {tr("access", "Dostup")}
              </MenuRow>
            </>
          )}

          <div className="MenuSeparator" />
          <MenuRow icon={Settings} onClick={run(() => onPanel("settings"))}>
            {tr("settings", "Sozlamalar")}
          </MenuRow>

          <div className="footer">AIBA Messenger</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A single `.MenuItem` row — Telegram Web A's compact menu item (icon + label). */
function MenuRow({
  icon: Icon,
  children,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      role="menuitem"
      tabIndex={0}
      className="MenuItem compact"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <Icon className="icon" />
      <span className="menu-item-name">{children}</span>
    </div>
  );
}
