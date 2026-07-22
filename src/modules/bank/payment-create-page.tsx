// Full-page "Yangi to'lov" form. Mirrors cloud
// apps/aiba_bank/templates/transactions.php (#tx-payment) +
// js/transactions.js (openPaymentPanel / submitPayment) — same sections,
// sender + receiver + amount + purpose + Ipak purpose-code, same
// validation rules, same toggle (Hisobga / Kartaga) gated on the sender bank.
//
// Replaces the previous PaymentForm Dialog on the payments list page —
// PaymentsView is now a thin CTA + status strip that navigates here.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, Building2, CheckCircle2, CreditCard,
  Loader2, Search, Send, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCompany } from "@/shared/store/company";
import { useBankAccounts } from "./api";
import type { BankAccount } from "./types";
import {
  useBankBranches, useCreateCardPayment, useCreatePayment, useSubscriptions,
  errMessage, type BankBranch,
} from "./payments-api";

type PayType = "account" | "card";

// Account balance arrives in tiyin (minor units) — divide by 100, 2 decimals.
const money = (v?: string | number | null) => {
  if (v == null || v === "") return "0";
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return (n / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const WAIT_MESSAGE_KEYS = [
  "modules.bank.paymentCreate.wait.0",
  "modules.bank.paymentCreate.wait.1",
  "modules.bank.paymentCreate.wait.2",
  "modules.bank.paymentCreate.wait.3",
  "modules.bank.paymentCreate.wait.4",
  "modules.bank.paymentCreate.wait.5",
  "modules.bank.paymentCreate.wait.6",
  "modules.bank.paymentCreate.wait.7",
];

export function PaymentCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;

  const { data: acc, isLoading } = useBankAccounts(companyId);
  const accounts = useMemo(() => acc?.items ?? [], [acc]);
  const { data: subsData } = useSubscriptions(companyId);

  const [payType, setPayType] = useState<PayType>("account");
  const [senderNumber, setSenderNumber] = useState("");
  const [receiverInn, setReceiverInn] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverAccount, setReceiverAccount] = useState("");
  const [mfoSearch, setMfoSearch] = useState("");
  const [mfoCode, setMfoCode] = useState("");
  const [mfoOpen, setMfoOpen] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardPinfl, setCardPinfl] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [purposeCode, setPurposeCode] = useState(""); // Ipak only
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [waitMsg, setWaitMsg] = useState("");
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const createPayment = useCreatePayment(companyId);
  const createCard = useCreateCardPayment(companyId);
  const submitting = createPayment.isPending || createCard.isPending;

  // Rotating wait messages while submitting (cloud parity — bank can stall up to 2min).
  useEffect(() => {
    if (!submitting) { setWaitMsg(""); return; }
    let i = 0;
    setWaitMsg(t(WAIT_MESSAGE_KEYS[0]));
    const timer = setInterval(() => { i = (i + 1) % WAIT_MESSAGE_KEYS.length; setWaitMsg(t(WAIT_MESSAGE_KEYS[i])); }, 4000);
    return () => clearInterval(timer);
  }, [submitting, t]);

  const picked = accounts.find((a) => a.number === senderNumber);
  const senderType = String(picked?.bank_type || "").toLowerCase();
  const isIpak = senderType.includes("ipak");
  const isKapital = senderType.includes("kapital");
  const hasKapital = accounts.some((a) => String(a.bank_type || "").toLowerCase().includes("kapital"));
  const showCardToggle = hasKapital && !isIpak;

  // Ipak forces account mode (no card payments).
  useEffect(() => { if (isIpak && payType === "card") setPayType("account"); }, [isIpak, payType]);

  // Debounced MFO branch search.
  const { data: branchData } = useBankBranches(companyId, mfoSearch);
  const branches: BankBranch[] = branchData?.items ?? [];

  const resolveMfo = (): string => {
    if (/^\d{5}$/.test(mfoCode)) return mfoCode;
    const m = mfoSearch.trim().match(/^(\d{5})/);
    return m ? m[1] : mfoSearch.trim();
  };

  // Ipak subscription id — server resolves bank_type; we pass it for the v2 endpoint.
  const ipakSubId = useMemo(() => {
    const sub = (subsData?.items ?? []).find((s) => String(s.bank_type || "").toLowerCase().includes("ipak"));
    return sub?.id;
  }, [subsData]);

  const reset = () => {
    setSuccess(null); setFormError("");
    setReceiverInn(""); setReceiverName(""); setReceiverAccount("");
    setMfoSearch(""); setMfoCode(""); setCardNumber(""); setCardPinfl("");
    setAmount(""); setPurpose(""); setPurposeCode("");
  };

  const validate = (): string | null => {
    if (!senderNumber) return t("modules.bank.paymentCreate.errors.fillAll");
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) return t("modules.bank.paymentCreate.errors.amountRequired");
    if (!purpose.trim()) return t("modules.bank.paymentCreate.errors.fillAll");
    if (payType === "card") {
      if (!/^\d{16}$/.test(cardNumber.trim())) return t("modules.bank.paymentCreate.errors.cardLength");
      if (!/^\d{14}$/.test(cardPinfl.trim())) return t("modules.bank.paymentCreate.errors.pinflLength");
      if (!receiverName.trim()) return t("modules.bank.paymentCreate.errors.fillAll");
      return null;
    }
    // account mode
    const inn = receiverInn.trim();
    if (!/^\d{9}$/.test(inn) && !/^\d{14}$/.test(inn)) return t("modules.bank.paymentCreate.errors.innLength");
    if (!receiverName.trim()) return t("modules.bank.paymentCreate.errors.fillAll");
    if (!/^\d{20}$/.test(receiverAccount.trim())) return t("modules.bank.paymentCreate.errors.accountLength");
    if (!/^\d{5}$/.test(resolveMfo())) return t("modules.bank.paymentCreate.errors.mfoLength");
    if (isIpak && !/^\d{6}$/.test(purposeCode.trim())) return t("modules.bank.paymentCreate.errors.ipakCode");
    // Kapital rejects an empty paymentPurposeCode (400) — require a 2-6 digit code (e.g. 00207).
    if (isKapital && payType === "account" && !/^\d{2,6}$/.test(purposeCode.trim()))
      return t("modules.bank.paymentCreate.errors.purposeCodeRequired", { defaultValue: "To'lov maqsadi kodini kiriting (masalan 00207)" });
    return null;
  };

  const onSubmit = () => {
    const err = validate();
    if (err) { setFormError(err); return; }
    setFormError("");
    const senderBranch = picked?.branch || "";
    const amt = parseInt(amount, 10);

    const onError = (e: unknown) => {
      const msg = errMessage(e);
      setFormError(msg);
      setToast({ msg: t("modules.bank.paymentCreate.toast.failed", { defaultValue: "To'lov yaratilmadi" }) + (msg ? `: ${msg}` : ""), kind: "err" });
    };
    const onOk = (resp: Record<string, unknown>) => {
      const data = (resp?.data ?? resp) as Record<string, unknown>;
      const num = (data?.payment_number ?? data?.number ?? "") as string | number;
      setToast({
        msg: num
          ? t("modules.bank.paymentCreate.toast.created", { number: num, defaultValue: `Qoralama yaratildi №${num}` })
          : t("modules.bank.paymentCreate.toast.createdNoNum", { defaultValue: "Qoralama yaratildi" }),
        kind: "ok",
      });
      setSuccess(String(num || ""));
    };

    if (payType === "card") {
      createCard.mutate(
        {
          senderBranch, senderAccountNumber: senderNumber,
          cardNumber: cardNumber.trim(), receiverName: receiverName.trim(),
          receiverInnOrPinfl: cardPinfl.trim(), paymentPurpose: purpose.trim(), amount: amt,
        },
        { onSuccess: onOk, onError },
      );
    } else {
      createPayment.mutate(
        {
          senderBranch, senderAccountNumber: senderNumber,
          receiverBranch: resolveMfo(), receiverAccountNumber: receiverAccount.trim(),
          receiverName: receiverName.trim(), receiverInnOrPinfl: receiverInn.trim(),
          paymentPurpose: purpose.trim(), amount: amt,
          ...(isIpak
            ? { sender_is_ipak: true, paymentPurposeCode: purposeCode.trim(), subscription_id: ipakSubId }
            : isKapital
              ? { paymentPurposeCode: purposeCode.trim() }
              : {}),
        },
        { onSuccess: onOk, onError },
      );
    }
  };

  // ── No company guard ───────────────────────────────────────────────────────
  if (!companyId) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        {t("modules.bank.paymentCreate.pickCompany")}
      </div>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (success !== null) {
    return (
      <div className="-m-6 flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/40 p-8">
        <div className="max-w-md space-y-4 rounded-lg border border-border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <div>
            <div className="text-lg font-semibold">
              {success
                ? t("modules.bank.paymentCreate.success.withNumber", { number: success })
                : t("modules.bank.paymentCreate.success.title")}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {t("modules.bank.paymentCreate.success.desc")}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={reset}>
              <Send className="mr-1 size-4" /> {t("modules.bank.paymentCreate.success.createMore")}
            </Button>
            <Button onClick={() => navigate("/bank")}>
              {t("modules.bank.paymentCreate.backToList")}
            </Button>
          </div>
        </div>
        {toast && <Toast msg={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="-m-6 flex min-h-[calc(100vh-4rem)] flex-col bg-muted/40">
      {/* Sticky header — Back + title */}
      <div className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-6 py-4">
          <Link
            to="/bank"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {t("modules.bank.title")}
          </Link>
          <h1 className="text-lg font-semibold">{t("modules.bank.payments.newPayment")}</h1>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-6 py-6">
        <Reveal
          loading={isLoading}
          skeleton={
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          }
        >
        {accounts.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center">
            <Wallet className="mx-auto size-10 text-muted-foreground" />
            <div className="mt-3 text-base font-medium">{t("modules.bank.paymentCreate.noAccount.title")}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {t("modules.bank.paymentCreate.noAccount.desc")}
            </div>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/bank")}>
              {t("modules.bank.paymentCreate.backToList")}
            </Button>
          </div>
        ) : (
          <>
            {/* Type toggle — only if Kapital is present and selected sender is not Ipak */}
            {showCardToggle && (
              <div className="flex justify-end">
                <div className="inline-flex rounded-md border border-border bg-card p-0.5">
                  {([
                    ["account", t("modules.bank.paymentCreate.payType.account"), <Building2 className="size-4" key="a" />],
                    ["card", t("modules.bank.paymentCreate.payType.card"), <CreditCard className="size-4" key="c" />],
                  ] as [PayType, string, React.ReactNode][]).map(([k, lbl, icon]) => (
                    <Button
                      key={k}
                      type="button"
                      variant="ghost"
                      onClick={() => setPayType(k)}
                      className={`inline-flex h-auto items-center gap-1.5 rounded px-3 py-1.5 text-sm font-normal transition-colors ${
                        payType === k
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                          : "text-muted-foreground hover:bg-transparent hover:text-foreground"
                      }`}
                    >
                      {icon}{lbl}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Sender section */}
            <Section title={t("modules.bank.paymentCreate.senderSection")}>
              <Field label={t("modules.bank.paymentCreate.fields.senderAccount")}>
                <Select value={senderNumber} onValueChange={(v) => setSenderNumber(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("modules.bank.paymentCreate.placeholders.pickAccount")} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a: BankAccount) => (
                      <SelectItem key={a.id} value={a.number || a.id}>
                        <span className="font-medium">
                          {String(a.bank_type || "").toUpperCase() || a.bank_name}
                        </span>
                        {" · "}<span className="tabular-nums text-xs">{a.number}</span>
                        {" · "}<span className="text-muted-foreground">{money(a.current_balance)} {t("modules.bank.txDetail.som")}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Section>

            {/* Receiver section */}
            <Section title={t("modules.bank.paymentCreate.receiverSection")}>
              {payType === "card" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={t("modules.bank.paymentCreate.fields.cardNumber")}>
                    <Input
                      inputMode="numeric"
                      maxLength={16}
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, ""))}
                      placeholder="8600…"
                    />
                  </Field>
                  <Field label={t("modules.bank.paymentCreate.fields.cardPinfl")}>
                    <Input
                      inputMode="numeric"
                      maxLength={14}
                      value={cardPinfl}
                      onChange={(e) => setCardPinfl(e.target.value.replace(/\D/g, ""))}
                      placeholder="3..."
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label={t("modules.bank.paymentCreate.fields.receiverName")}>
                      <Input
                        value={receiverName}
                        onChange={(e) => setReceiverName(e.target.value)}
                        placeholder={t("modules.bank.paymentCreate.placeholders.fio")}
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={t("modules.bank.paymentCreate.fields.receiverInn")}>
                    <Input
                      inputMode="numeric"
                      maxLength={14}
                      value={receiverInn}
                      onChange={(e) => setReceiverInn(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456789"
                    />
                  </Field>
                  <Field label={t("modules.bank.paymentCreate.fields.receiverName")}>
                    <Input
                      value={receiverName}
                      onChange={(e) => setReceiverName(e.target.value)}
                      placeholder={t("modules.bank.paymentCreate.placeholders.orgName")}
                    />
                  </Field>
                  <Field label={t("modules.bank.paymentCreate.fields.receiverAccount")}>
                    <Input
                      inputMode="numeric"
                      maxLength={20}
                      value={receiverAccount}
                      onChange={(e) => setReceiverAccount(e.target.value.replace(/\D/g, ""))}
                      placeholder="2020…"
                    />
                  </Field>
                  <Field label={t("modules.bank.paymentCreate.fields.mfo")}>
                    <MfoPicker
                      search={mfoSearch}
                      setSearch={(v) => { setMfoSearch(v); setMfoCode(""); }}
                      code={mfoCode}
                      setCode={setMfoCode}
                      open={mfoOpen}
                      setOpen={setMfoOpen}
                      branches={branches}
                    />
                  </Field>
                </div>
              )}
            </Section>

            {/* Amount + purpose */}
            <Section title={t("modules.bank.paymentCreate.detailsSection")}>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={t("modules.bank.paymentCreate.fields.amount")}>
                  <Input
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                    placeholder="0"
                  />
                </Field>
                {(isIpak || isKapital) && payType === "account" && (
                  <Field label={t("modules.bank.paymentCreate.fields.purposeCode")}>
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      value={purposeCode}
                      onChange={(e) => setPurposeCode(e.target.value.replace(/\D/g, ""))}
                      placeholder={isKapital ? "00207" : "00000"}
                    />
                  </Field>
                )}
              </div>
              <div className="mt-3">
                <Field label={t("modules.bank.paymentCreate.fields.purpose")}>
                  <Textarea
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    rows={3}
                    placeholder={t("modules.bank.paymentCreate.placeholders.purpose")}
                    className="resize-y"
                  />
                </Field>
              </div>
            </Section>

            {formError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="size-4 shrink-0" /> {formError}
              </div>
            )}
          </>
        )}
        </Reveal>
      </div>

      {/* Sticky footer — Bekor / Yaratish */}
      <div className="sticky bottom-0 border-t border-border bg-card">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-6 py-3">
          <Button
            variant="ghost"
            onClick={() => navigate("/bank")}
            disabled={submitting}
          >
            {t("modules.bank.actions.cancel")}
          </Button>
          <Button
            className="ml-auto"
            onClick={onSubmit}
            disabled={submitting || accounts.length === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {waitMsg || t("modules.bank.paymentCreate.creating")}
              </>
            ) : (
              <>
                <Send className="mr-2 size-4" /> {t("modules.bank.paymentCreate.submit")}
              </>
            )}
          </Button>
        </div>
      </div>
      {toast && <Toast msg={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────--
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// Tiny inline toast (same pattern as the autopay module).
function Toast({ msg, kind, onDone }: { msg: string; kind: "ok" | "err"; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 5000);
    return () => clearTimeout(id);
  }, [msg, onDone]);
  const ok = kind === "ok";
  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ${
        ok
          ? "border-success/40 bg-success/15 text-success"
          : "border-destructive/40 bg-destructive/15 text-destructive"
      }`}
    >
      {ok ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
      <span>{msg}</span>
    </div>
  );
}

function MfoPicker({
  search, setSearch, code, setCode, open, setOpen, branches,
}: {
  search: string; setSearch: (v: string) => void; code: string; setCode: (v: string) => void;
  open: boolean; setOpen: (v: boolean) => void; branches: BankBranch[];
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [setOpen]);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={t("modules.bank.paymentCreate.placeholders.mfoSearch")}
          className="pl-8"
        />
      </div>
      {code && /^\d{5}$/.test(code) && (
        <div className="mt-1 text-[11px] text-success">{t("modules.bank.paymentCreate.mfoSelected", { code })}</div>
      )}
      {open && search.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {branches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">{t("modules.bank.paymentCreate.noBranches")}</div>
          ) : (
            branches.map((b) => (
              <Button
                key={b.code}
                type="button"
                variant="ghost"
                className="flex h-auto w-full items-center justify-start gap-2 rounded-none px-3 py-2 text-left text-sm font-normal hover:bg-accent"
                onClick={() => {
                  setCode(b.code);
                  setSearch(`${b.code} — ${b.name}`);
                  setOpen(false);
                }}
              >
                <span className="shrink-0 tabular-nums text-xs">{b.code}</span>
                <span className="truncate text-muted-foreground">{b.name}</span>
              </Button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
