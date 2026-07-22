import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Send, Plus, Trash2, CheckCircle2, AlertTriangle, Loader2,
  Eye, EyeOff, Building2, ArrowLeft, ShieldCheck, Settings,
} from "lucide-react";
import { SubSettingsModal } from "./sub-settings-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  useConnectBanks, useSubscriptions, useValidateLogin, useConfirmOtp, useSubscribe,
  useDeleteSubscription, asBanks, classifySub, dotColor, bankLabel, fmtTashkent,
  errMessage, type ConnectBank, type BankSubscription,
} from "./payments-api";

// ─────────────────────────────────────────────────────────────────────────────
export function PaymentsView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [connectOpen, setConnectOpen] = useState(false);
  const [presetBankType, setPresetBankType] = useState<string | null>(null);

  const openConnect = (bankType?: string) => {
    setPresetBankType(bankType ?? null);
    setConnectOpen(true);
  };

  return (
    <div className="space-y-4">
      <BankStatusStrip companyId={companyId} onConnect={() => openConnect()} onReconnect={(bt) => openConnect(bt)} />

      {/* "Yangi to'lov" CTA — replaces the in-list PaymentForm Dialog with a
          navigation to the full-page payment-create route (cloud parity:
          a separate /bank/payments/new page, not a modal). */}
      <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Send className="size-4 text-muted-foreground" />
          <span className="font-medium">{t("modules.bank.payments.cta.title")}</span>
          <span className="text-muted-foreground">{t("modules.bank.payments.cta.hint")}</span>
        </div>
        <Button onClick={() => navigate("/bank/payments/new")}>
          <Send className="size-4 mr-1.5" /> {t("modules.bank.payments.newPayment")}
        </Button>
      </div>

      <ConnectWizard
        companyId={companyId}
        open={connectOpen}
        presetBankType={presetBankType}
        onClose={() => setConnectOpen(false)}
      />
    </div>
  );
}

// Reusable connect/manage panel = Bank holati strip + Connect wizard with its
// own open-state. Exported so the Hisoblar (accounts) tab can host bank
// add ("Bank ulash") + delete (🗑) + reconnect too — its natural home.
export function BankConnectPanel({ companyId }: { companyId: number }) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [presetBankType, setPresetBankType] = useState<string | null>(null);
  const openConnect = (bankType?: string) => {
    setPresetBankType(bankType ?? null);
    setConnectOpen(true);
  };
  return (
    <>
      <BankStatusStrip companyId={companyId} onConnect={() => openConnect()} onReconnect={(bt) => openConnect(bt)} />
      <ConnectWizard
        companyId={companyId}
        open={connectOpen}
        presetBankType={presetBankType}
        onClose={() => setConnectOpen(false)}
      />
    </>
  );
}

// ── (1) Bank holati strip ────────────────────────────────────────────────────
function BankStatusStrip({
  companyId, onConnect, onReconnect,
}: { companyId: number; onConnect: () => void; onReconnect: (bankType: string) => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useSubscriptions(companyId);
  const del = useDeleteSubscription(companyId);
  const [confirmSub, setConfirmSub] = useState<BankSubscription | null>(null);
  // Per-sub Sozlamalar modal (reg_date / sync period). One modal instance
  // reused across cards — `settingsSub` carries which sub it's editing.
  const [settingsSub, setSettingsSub] = useState<BankSubscription | null>(null);

  const groups = useMemo(() => {
    const items = (data?.items ?? []).filter((s) => !s.is_deleted);
    const order: Record<string, number> = { reconnect: 0, error: 1, gone: 2, pending: 3, idle: 4, syncing: 5, ok: 6 };
    const byBank = new Map<string, BankSubscription>();
    for (const it of items) {
      const key = it.bank_type || "unknown";
      const cur = byBank.get(key);
      if (!cur) { byBank.set(key, it); continue; }
      if (order[classifySub(it).kind] < order[classifySub(cur).kind]) byBank.set(key, it);
    }
    return Array.from(byBank.values()).sort(
      (a, b) => order[classifySub(a).kind] - order[classifySub(b).kind],
    );
  }, [data]);

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="text-sm font-medium flex items-center gap-1.5">
          <Building2 className="size-4" /> {t("modules.bank.payments.bankStatus")}
        </div>
        <Button size="sm" variant="outline" onClick={onConnect}>
          <Plus className="size-4 mr-1" /> {t("modules.bank.payments.connectBank")}
        </Button>
      </div>

      <Reveal
        loading={isLoading}
        skeleton={<div className="flex gap-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-48" />)}</div>}
      >
        {groups.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2">
          {t("modules.bank.payments.noConnected")} <Button variant="link" onClick={onConnect} className="h-auto p-0 text-sm font-normal text-primary underline underline-offset-2">{t("modules.bank.payments.connectBank")}</Button>.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {groups.map((s) => {
            const st = classifySub(s);
            const needsAction = st.kind === "reconnect" || st.kind === "error";
            return (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 min-w-[14rem]">
                <span className={`size-2.5 rounded-full shrink-0 ${dotColor(st.kind)}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{bankLabel(s)}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    <span>{st.label}</span>
                    {s.login && <span className="tabular-nums">· {s.login}</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground/80">{t("modules.bank.payments.lastSync")}: {fmtTashkent(s.last_sync_at)}</div>
                </div>
                {needsAction && (
                  <Button
                    variant="link"
                    onClick={() => onReconnect(s.bank_type || "")}
                    className="h-auto shrink-0 p-0 text-xs font-normal text-primary underline underline-offset-2"
                  >
                    {t("modules.bank.payments.reconnect")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSettingsSub(s)}
                  className="size-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                  title={t("modules.bank.subSettings.title", "Sozlamalar")}
                >
                  <Settings className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirmSub(s)}
                  className="size-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-destructive"
                  title={t("modules.bank.payments.removeConnection")}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      </Reveal>

      <SubSettingsModal
        open={!!settingsSub}
        onClose={() => setSettingsSub(null)}
        companyId={companyId}
        subId={settingsSub?.id ?? null}
        bankLabel={settingsSub ? bankLabel(settingsSub) : ""}
      />

      <Dialog open={!!confirmSub} onOpenChange={(o) => { if (!o) setConfirmSub(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("modules.bank.payments.deleteBank.title")}</DialogTitle>
            <DialogDescription>{t("modules.bank.payments.deleteBank.confirm")}</DialogDescription>
          </DialogHeader>
          {confirmSub && <div className="text-sm font-medium">{bankLabel(confirmSub)}</div>}
          {del.isError && <div className="text-sm text-destructive">{errMessage(del.error)}</div>}
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmSub(null)} disabled={del.isPending}>{t("modules.bank.actions.cancel")}</Button>
            <Button
              variant="destructive"
              disabled={del.isPending}
              onClick={() => {
                if (!confirmSub) return;
                del.mutate(confirmSub.id, { onSuccess: () => setConfirmSub(null) });
              }}
            >
              {del.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Trash2 className="size-4 mr-1" />}
              {t("modules.bank.payments.removeConnection")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── (2) To'lov yaratish ──────────────────────────────────────────────────────
// The in-list `PaymentForm` Dialog has moved to a full-page route at
// /bank/payments/new (see modules/bank/payment-create-page.tsx) to mirror
// the cloud layout — a separate "Yangi to'lov" page, not a modal.
// `PaymentsView` now exposes a "Yangi to'lov" CTA that navigates there.

// Shared label-and-input wrapper — used by ConnectWizard below (Login / Parol /
// SMS kod). Kept here so both PaymentsView and ConnectWizard can reuse it.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ── (3) Bank ulash wizard ────────────────────────────────────────────────────
type Step = "bank" | "login" | "otp" | "done";

function ConnectWizard({
  companyId, open, presetBankType, onClose,
}: { companyId: number; open: boolean; presetBankType: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const STEPS: [Step, string][] = [
    ["bank", t("modules.bank.payments.wizard.steps.bank")],
    ["login", t("modules.bank.payments.wizard.steps.login")],
    ["otp", t("modules.bank.payments.wizard.steps.otp")],
  ];
  const { data, isLoading } = useConnectBanks(companyId, open);
  const banks = asBanks(data);
  const del = useDeleteSubscription(companyId);
  const { data: subsData } = useSubscriptions(companyId);

  const [step, setStep] = useState<Step>("bank");
  const [bank, setBank] = useState<ConnectBank | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState("");

  const validateLogin = useValidateLogin(companyId);
  const confirmOtp = useConfirmOtp(companyId);
  const subscribe = useSubscribe(companyId);

  const reset = () => {
    setStep("bank"); setBank(null); setLogin(""); setPassword("");
    setShowPw(false); setOtp(""); setSessionId(""); setError("");
  };
  useEffect(() => { if (open) setError(""); else reset(); }, [open]);

  const pickBank = async (b: ConnectBank) => {
    setBank(b); setError("");
    if (b.is_connected) {
      // Reconnect: delete the existing subscription for this bank, then login.
      const sub = (subsData?.items ?? []).find((s) => s.bank_id === b.id || s.bank_type === b.bank_type);
      if (sub) { try { await del.mutateAsync(sub.id); } catch { /* proceed to login regardless */ } }
    }
    setLogin(""); setPassword(""); setStep("login");
  };

  // Auto-select preset bank (from a "Qayta ulash" link).
  useEffect(() => {
    if (!open || !presetBankType || step !== "bank" || banks.length === 0) return;
    const match = banks.find((b) => String(b.bank_type || "").toLowerCase() === presetBankType.toLowerCase());
    if (match) void pickBank(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetBankType, banks.length]);

  const busy = validateLogin.isPending || confirmOtp.isPending || subscribe.isPending;

  // Kapitalbank auth path requires a stable per-(company, bank) device
  // UUID — upstream reads it as X-Device-Id. Mint once and persist in
  // localStorage so re-connects re-use the same registered device
  // (regenerating would force a fresh OTP flow every time). Non-Kapital
  // banks skip the header (backend passes empty → dropped).
  const deviceIdFor = (b: ConnectBank | null): string | undefined => {
    if (!b) return undefined;
    if (String(b.bank_type ?? "").toLowerCase() !== "kapitalbank") return undefined;
    const key = `bank.device_id:${companyId}:${b.id}`;
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  };

  const doSubscribe = () => {
    if (!bank) return;
    setError("");
    subscribe.mutate(
      { bank_id: bank.id, login, password, device_id: deviceIdFor(bank) },
      { onSuccess: () => setStep("done"), onError: (e) => setError(errMessage(e)) },
    );
  };

  const doLogin = () => {
    if (!bank) return;
    if (!login.trim() || !password) { setError(t("modules.bank.payments.wizard.errors.enterLogin")); return; }
    setError("");
    validateLogin.mutate(
      { bank_id: bank.id, login: login.trim(), password, device_id: deviceIdFor(bank) },
      {
        onSuccess: (resp) => {
          // OTP / captcha step first — some banks (Anor captcha) come back
          // with success:false BUT a session_id + next_step:otp, meaning
          // "one more step", not a hard failure.
          if (resp?.session_id && resp?.next_step === "otp") {
            setSessionId(resp.session_id); setOtp(""); setStep("otp");
            return;
          }
          // Hard auth failure: upstream checked the credentials and rejected
          // them (Kapitalbank/NBU/Anor validate live). Previously we ignored
          // `success` and fell through to subscribe — which created a sub
          // with unusable creds and falsely reported "ulandi". Stop here and
          // surface the bank's message.
          if (resp?.success === false) {
            setError(resp.message || t("modules.bank.payments.wizard.errors.authFailed"));
            return;
          }
          // success:true (next_step setup / syncing) → create the sub.
          doSubscribe();
        },
        onError: (e) => setError(errMessage(e)),
      },
    );
  };

  const doConfirmOtp = () => {
    if (!otp.trim()) return;
    setError("");
    confirmOtp.mutate(
      { session_id: sessionId, otp_code: otp.trim(), device_id: deviceIdFor(bank) },
      { onSuccess: () => doSubscribe(), onError: (e) => setError(errMessage(e)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-5" /> {t("modules.bank.payments.connectBank")}</DialogTitle>
          <DialogDescription>
            {t("modules.bank.payments.wizard.desc")}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        {step !== "done" && (
          <div className="flex items-center gap-2 text-xs">
            {STEPS.map(([k, lbl], i) => {
              const curIdx = STEPS.findIndex(([s]) => s === step);
              const active = step === k;
              const doneStep = curIdx > i;
              return (
                <div key={k} className="flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center size-5 rounded-full text-[11px] ${active ? "bg-primary text-primary-foreground" : doneStep ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>
                    {doneStep ? "✓" : i + 1}
                  </span>
                  <span className={active ? "font-medium" : "text-muted-foreground"}>{lbl}</span>
                  {i < STEPS.length - 1 && <span className="text-muted-foreground">›</span>}
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </div>
        )}

        {/* Step: bank */}
        {step === "bank" && (
          <Reveal
            loading={isLoading}
            skeleton={<div className="grid grid-cols-2 gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}
          >
            {banks.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">{t("modules.bank.payments.wizard.noBanks")}</div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
              {banks.filter((b) => b.id).map((b) => (
                <Button
                  key={b.id}
                  type="button"
                  variant="outline"
                  onClick={() => pickBank(b)}
                  className="flex h-auto flex-col items-start justify-start gap-1 rounded-lg border bg-card p-3 text-left font-normal hover:border-primary hover:bg-card transition-colors"
                >
                  <span className="text-sm font-medium">{b.name}</span>
                  {b.is_connected
                    ? <Badge variant="success">{t("modules.bank.payments.wizard.connectedReconnect")}</Badge>
                    : <Badge variant="muted">{t("modules.bank.payments.wizard.connect")}</Badge>}
                </Button>
              ))}
            </div>
          )}
          </Reveal>
        )}

        {/* Step: login */}
        {step === "login" && bank && (
          <div className="space-y-3">
            <div className="text-sm font-medium">{bank.name}</div>
            <Field label={t("modules.bank.payments.wizard.fields.login")}>
              <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" placeholder={t("modules.bank.payments.wizard.placeholders.login")} />
            </Field>
            <Field label={t("modules.bank.payments.wizard.fields.password")}>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  placeholder={t("modules.bank.payments.wizard.placeholders.password")}
                  className="pr-10"
                  onKeyDown={(e) => { if (e.key === "Enter") doLogin(); }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 size-6 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </Field>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => { setStep("bank"); setError(""); }} disabled={busy}>
                <ArrowLeft className="size-4 mr-1" /> {t("modules.bank.actions.back")}
              </Button>
              <Button onClick={doLogin} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin mr-1" /> : null} {t("modules.bank.actions.continue")}
              </Button>
            </div>
          </div>
        )}

        {/* Step: otp */}
        {step === "otp" && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{t("modules.bank.payments.wizard.enterOtp")}</div>
            <Field label={t("modules.bank.payments.wizard.fields.otp")}>
              <Input
                inputMode="numeric"
                value={otp}
                maxLength={bank?.otp_length || 8}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") doConfirmOtp(); }}
                placeholder="000000"
              />
            </Field>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => { setStep("login"); setError(""); }} disabled={busy}>
                <ArrowLeft className="size-4 mr-1" /> {t("modules.bank.actions.back")}
              </Button>
              <Button onClick={doConfirmOtp} disabled={busy || !otp.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin mr-1" /> : null} {t("modules.bank.actions.confirm")}
              </Button>
            </div>
          </div>
        )}

        {/* Step: done */}
        {step === "done" && (
          <div className="text-center space-y-3 py-4">
            <CheckCircle2 className="size-10 mx-auto text-success" />
            <div className="text-base font-medium">{t("modules.bank.payments.wizard.connected", { name: bank?.name ?? "" })}</div>

            <div className="text-sm text-muted-foreground">{t("modules.bank.payments.wizard.syncing")}</div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={reset}><Plus className="size-4 mr-1" /> {t("modules.bank.payments.wizard.connectAnother")}</Button>
              <Button onClick={onClose}>{t("modules.bank.actions.close")}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
