// Telegram corporate ACCOUNTS admin panel — content of the admin surface the
// caller wraps in a Sheet/Dialog (a ready <Dialog> wrapper is also exported).
// Two views: the connected-accounts LIST (with delete + inline confirm) and the
// QR ADD flow (start → poll status → optional 2FA password → done). Admin-only;
// the caller is expected to gate access. All copy is inline-defaulted Uzbek.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertCircle, ArrowLeft, CheckCircle2, KeyRound, Loader2, Plus, QrCode,
  RefreshCw, Smartphone, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import {
  TG_ACCOUNTS_KEY, tgQrPassword, tgQrStart, tgQrStatus, useDeleteTgAccount,
  useTgAccounts, type QrStatus, type TgAccount,
} from "./api";

const POLL_MS = 2000;

// ── status dot ────────────────────────────────────────────────────────────────
/** Colour a small dot by the account's textual status. Anything that reads
 *  "active"/"ok"/"online"/"connected" is green; empty/unknown falls back grey. */
function statusTone(status: string): { dot: string; label: string } {
  const s = (status || "").toLowerCase();
  if (["active", "ok", "online", "connected", "ready", "authorized"].some((k) => s.includes(k)))
    return { dot: "bg-success", label: status };
  if (["error", "fail", "banned", "revoked", "expired"].some((k) => s.includes(k)))
    return { dot: "bg-destructive", label: status };
  if (!s) return { dot: "bg-muted-foreground/40", label: "—" };
  return { dot: "bg-warning", label: status };
}

// ── account row ─────────────────────────────────────────────────────────────────
function AccountRow({ acc }: { acc: TgAccount }) {
  const { t } = useTranslation();
  const del = useDeleteTgAccount();
  const [confirming, setConfirming] = useState(false);
  const tone = statusTone(acc.status);

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card/60 px-3.5 py-3 transition-colors hover:bg-accent/40">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <Smartphone className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{acc.title || t("modules.messenger.tg.untitled", { defaultValue: "Nomsiz akkaunt" })}</span>
          <span className={cn("size-2 shrink-0 rounded-full", tone.dot)} title={tone.label} />
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {acc.phone || t("modules.messenger.tg.noPhone", { defaultValue: "Telefon raqami yo'q" })}
        </div>
      </div>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="destructive"
            disabled={del.isPending}
            onClick={() => del.mutate(acc.id, { onSuccess: () => setConfirming(false) })}
          >
            {del.isPending ? <Loader2 className="size-4 animate-spin" /> : t("modules.messenger.tg.confirmDelete", { defaultValue: "O'chirish" })}
          </Button>
          <Button size="sm" variant="ghost" disabled={del.isPending} onClick={() => setConfirming(false)}>
            {t("modules.messenger.tg.cancel", { defaultValue: "Bekor" })}
          </Button>
        </div>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
          title={t("modules.messenger.tg.delete", { defaultValue: "O'chirish" })}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

// ── add-flow (QR + polling + 2FA) ────────────────────────────────────────────────
type AddPhase =
  | { kind: "starting" }
  | { kind: "qr"; loginId: string; qr: string; expires: number }
  | { kind: "password"; loginId: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

function AddAccountFlow({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<AddPhase>({ kind: "starting" });
  const [pwd, setPwd] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  // Kept in refs so the polling loop (set up once) always sees live values and
  // can be torn down without being re-created on every phase change.
  const loginIdRef = useRef<string | null>(null);
  const expiresRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  const startingRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const applyStatus = useCallback(
    (s: QrStatus) => {
      if (!aliveRef.current) return;
      switch (s.status) {
        case "pending":
          // Telegram may rotate the QR token — swap it in if a fresh one arrived.
          if (s.qr) {
            setPhase((prev) =>
              prev.kind === "qr" && loginIdRef.current
                ? { kind: "qr", loginId: loginIdRef.current, qr: s.qr!, expires: expiresRef.current }
                : prev,
            );
          }
          return;
        case "password":
          setPhase((prev) => (prev.kind === "password" ? prev : { kind: "password", loginId: loginIdRef.current! }));
          return;
        case "done":
          clearTimer();
          void qc.invalidateQueries({ queryKey: TG_ACCOUNTS_KEY });
          setPhase({ kind: "done" });
          return;
        case "error":
          clearTimer();
          setPhase({ kind: "error", message: s.message || t("modules.messenger.tg.genericError", { defaultValue: "Ulanishda xatolik yuz berdi" }) });
          return;
      }
    },
    [qc, t],
  );

  // One polling loop for the whole flow: re-arms itself via setTimeout so the
  // 2s cadence never overlaps a slow request, and stops on unmount / expiry /
  // terminal status. It runs while a login is active (qr or password phase).
  const poll = useCallback(async () => {
    const loginId = loginIdRef.current;
    if (!aliveRef.current || !loginId) return;
    if (expiresRef.current && Date.now() / 1000 > expiresRef.current) {
      clearTimer();
      setPhase({ kind: "error", message: t("modules.messenger.tg.qrExpired", { defaultValue: "QR-kod muddati tugadi. Qaytadan urinib ko'ring." }) });
      return;
    }
    try {
      const s = await tgQrStatus(loginId);
      applyStatus(s);
    } catch {
      // Transient network hiccup — keep polling; expiry/terminal handles the rest.
    }
    if (aliveRef.current && loginIdRef.current) {
      timerRef.current = setTimeout(poll, POLL_MS);
    }
  }, [applyStatus, t]);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    clearTimer();
    setPhase({ kind: "starting" });
    setPwd("");
    setPwdError(null);
    try {
      const { loginId, qr, expires } = await tgQrStart();
      if (!aliveRef.current) return;
      loginIdRef.current = loginId;
      expiresRef.current = expires;
      setPhase({ kind: "qr", loginId, qr, expires });
      timerRef.current = setTimeout(poll, POLL_MS);
    } catch {
      if (aliveRef.current)
        setPhase({ kind: "error", message: t("modules.messenger.tg.startFailed", { defaultValue: "QR-kodni boshlab bo'lmadi. Qaytadan urinib ko'ring." }) });
    } finally {
      startingRef.current = false;
    }
  }, [poll, t]);

  // Boot the flow once; tear everything down on unmount.
  useEffect(() => {
    aliveRef.current = true;
    void start();
    return () => {
      aliveRef.current = false;
      loginIdRef.current = null;
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => {
    loginIdRef.current = null;
    expiresRef.current = 0;
    void start();
  };

  const submitPassword = async () => {
    const loginId = loginIdRef.current;
    if (!loginId || !pwd.trim()) return;
    setPwdBusy(true);
    setPwdError(null);
    try {
      const s = await tgQrPassword(loginId, pwd);
      applyStatus(s);
      // If still on password (wrong pin), surface the message and keep polling.
      if (s.status === "password") {
        setPwdError(s.message || t("modules.messenger.tg.wrongPassword", { defaultValue: "Parol noto'g'ri. Qaytadan kiriting." }));
      } else if (s.status === "pending") {
        // resume polling in case the loop had nothing to do
        if (aliveRef.current && loginIdRef.current && !timerRef.current) {
          timerRef.current = setTimeout(poll, POLL_MS);
        }
      }
    } catch {
      setPwdError(t("modules.messenger.tg.passwordFailed", { defaultValue: "Parolni tekshirib bo'lmadi. Qaytadan urinib ko'ring." }));
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("modules.messenger.tg.backToList", { defaultValue: "Akkauntlar ro'yxati" })}
      </button>

      {phase.kind === "starting" && (
        <div className="grid place-items-center gap-3 rounded-2xl border bg-card/50 py-16">
          <Loader2 className="size-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {t("modules.messenger.tg.preparingQr", { defaultValue: "QR-kod tayyorlanmoqda…" })}
          </p>
        </div>
      )}

      {phase.kind === "qr" && (
        <div className="flex flex-col items-center gap-5 rounded-2xl border bg-card/50 p-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <div className="inline-flex items-center gap-2 text-sm font-medium">
              <QrCode className="size-4 text-primary" />
              {t("modules.messenger.tg.scanTitle", { defaultValue: "QR-kodni skanerlang" })}
            </div>
            <p className="max-w-xs text-xs text-muted-foreground">
              {t("modules.messenger.tg.scanHint", {
                defaultValue: "Telegram → Settings → Devices → Link Desktop Device orqali skanerlang",
              })}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm ring-1 ring-black/5">
            <QRCodeSVG value={phase.qr} size={220} level="M" marginSize={0} bgColor="#ffffff" fgColor="#0f172a" />
          </div>

          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t("modules.messenger.tg.waitingScan", { defaultValue: "Skaner kutilmoqda…" })}
          </div>
        </div>
      )}

      {phase.kind === "password" && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card/50 p-6">
          <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="size-6" />
          </div>
          <div className="text-center">
            <div className="text-sm font-medium">
              {t("modules.messenger.tg.twoFaTitle", { defaultValue: "Ikki bosqichli parol" })}
            </div>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              {t("modules.messenger.tg.twoFaHint", { defaultValue: "Bu akkauntda 2FA yoqilgan. Cloud parolni kiriting." })}
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Input
              type="password"
              autoFocus
              value={pwd}
              disabled={pwdBusy}
              placeholder={t("modules.messenger.tg.passwordPlaceholder", { defaultValue: "Cloud parol" })}
              onChange={(e) => setPwd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitPassword();
              }}
            />
            {pwdError && (
              <p className="inline-flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5" />
                {pwdError}
              </p>
            )}
            <Button className="w-full" disabled={pwdBusy || !pwd.trim()} onClick={() => void submitPassword()}>
              {pwdBusy ? <Loader2 className="size-4 animate-spin" /> : t("modules.messenger.tg.submitPassword", { defaultValue: "Tasdiqlash" })}
            </Button>
          </div>
        </div>
      )}

      {phase.kind === "done" && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card/50 py-14">
          <div className="grid size-14 place-items-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="size-8" />
          </div>
          <div className="text-center">
            <div className="text-sm font-medium">
              {t("modules.messenger.tg.doneTitle", { defaultValue: "Akkaunt ulandi!" })}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("modules.messenger.tg.doneHint", { defaultValue: "Yangi Telegram akkaunt ro'yxatga qo'shildi." })}
            </p>
          </div>
          <Button onClick={onDone}>{t("modules.messenger.tg.backToList", { defaultValue: "Akkauntlar ro'yxati" })}</Button>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 py-14">
          <div className="grid size-14 place-items-center rounded-full bg-destructive/15 text-destructive">
            <AlertCircle className="size-8" />
          </div>
          <p className="max-w-xs px-4 text-center text-sm text-destructive">{phase.message}</p>
          <Button variant="outline" onClick={retry}>
            <RefreshCw className="size-4" />
            {t("modules.messenger.tg.retry", { defaultValue: "Qaytadan urinish" })}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── main export ─────────────────────────────────────────────────────────────────
/** Content of the TG accounts admin panel. The caller wraps this in a
 *  Sheet/Dialog and is responsible for admin gating. */
export function TgAccountsAdmin({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const accounts = useTgAccounts();
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            {t("modules.messenger.tg.adminTitle", { defaultValue: "Telegram akkauntlar" })}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("modules.messenger.tg.adminSubtitle", { defaultValue: "Korporativ Telegram akkauntlarini boshqaring" })}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-muted-foreground"
          onClick={onClose}
          title={t("modules.messenger.tg.close", { defaultValue: "Yopish" })}
        >
          <X className="size-4" />
        </Button>
      </div>

      {adding ? (
        <AddAccountFlow onBack={() => setAdding(false)} onDone={() => setAdding(false)} />
      ) : (
        <>
          <Button className="w-full sm:w-auto" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            {t("modules.messenger.tg.addAccount", { defaultValue: "Akkaunt qo'shish" })}
          </Button>

          {accounts.isLoading ? (
            <div className="flex flex-col gap-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[68px] animate-pulse rounded-xl border bg-muted/40" />
              ))}
            </div>
          ) : accounts.isError ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 py-12 text-center">
              <AlertCircle className="size-7 text-destructive" />
              <p className="text-sm text-destructive">
                {t("modules.messenger.tg.loadError", { defaultValue: "Akkauntlarni yuklab bo'lmadi" })}
              </p>
              <Button variant="outline" size="sm" onClick={() => void accounts.refetch()}>
                <RefreshCw className="size-4" />
                {t("modules.messenger.tg.retry", { defaultValue: "Qaytadan urinish" })}
              </Button>
            </div>
          ) : !accounts.data || accounts.data.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/40 py-14 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                <Smartphone className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {t("modules.messenger.tg.emptyTitle", { defaultValue: "Hali TG akkaunt ulanmagan" })}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("modules.messenger.tg.emptyHint", { defaultValue: "\"Akkaunt qo'shish\" tugmasi orqali QR-kod bilan ulang" })}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto">
              {accounts.data.map((acc) => (
                <AccountRow key={acc.id} acc={acc} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── convenience Dialog wrapper ────────────────────────────────────────────────────
/** Ready-to-use dialog version, for callers that don't bring their own shell. */
export function TgAccountsAdminDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("modules.messenger.tg.adminTitle", { defaultValue: "Telegram akkauntlar" })}</DialogTitle>
        </DialogHeader>
        <TgAccountsAdmin onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
