import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/shared/i18n";
import {
  TrendingUp, RefreshCw, Loader2, ChevronRight, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import { api } from "@/shared/api/client";
import { useAuth } from "@/shared/store/auth";
import {
  useCashflowSubscriptions, useCreateReport, fetchReport, reportId,
  type BankSubscription, type CashflowReport, type CashflowArticle,
} from "./cashflow-api";

// ── constants (mirror cloud cashflow.js) ─────────────────────────────────────
const SUPPORTED_BANKS = ["ipak_yoli", "nbu"];
const BANK_NAMES: Record<string, string> = {
  ipak_yoli: "Ipak Yo'li",
  nbu: "NBU",
};
const STEP_OF: Record<string, number> = {
  queued: 0, logging_in: 1, fetching_accounts: 2, fetching_statements: 3,
  classifying: 4, saving: 5, done: 5, failed: 5,
};
const TOTAL_STEPS = 5;
const STAGE_KEYS: Record<string, string> = {
  queued: "modules.bank.cashflow.stages.queued",
  logging_in: "modules.bank.cashflow.stages.logging_in",
  fetching_accounts: "modules.bank.cashflow.stages.fetching_accounts",
  fetching_statements: "modules.bank.cashflow.stages.fetching_statements",
  classifying: "modules.bank.cashflow.stages.classifying",
  saving: "modules.bank.cashflow.stages.saving",
};
const ARTICLE_LABEL_KEYS: Record<string, string> = {
  retail_terminal: "modules.bank.cashflow.articles.retail_terminal",
  customer_payment: "modules.bank.cashflow.articles.customer_payment",
  supplier_local: "modules.bank.cashflow.articles.supplier_local",
  supplier_import: "modules.bank.cashflow.articles.supplier_import",
  supplier_other: "modules.bank.cashflow.articles.supplier_other",
  bank_fees: "modules.bank.cashflow.articles.bank_fees",
  refund_to_customer: "modules.bank.cashflow.articles.refund_to_customer",
  salary: "modules.bank.cashflow.articles.salary",
  ignored_perebroska: "modules.bank.cashflow.articles.ignored_perebroska",
  unclassified: "modules.bank.cashflow.articles.unclassified",
};

// ── helpers ──────────────────────────────────────────────────────────────────
// Bank amounts arrive in tiyin (minor units) — divide by 100, 2 decimals.
const money = (v?: string | number | null) => {
  if (v == null || v === "") return "0,00";
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (Number.isNaN(n)) return "0,00";
  return (n / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const yesterdayIso = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const maskAcc = (acc?: string | null) => {
  if (!acc) return "";
  return acc.length > 10 ? `${acc.slice(0, 5)}…${acc.slice(-4)}` : acc;
};
const useArticleLabel = () => {
  const { t } = useTranslation();
  return (a: CashflowArticle) => {
    const key = a?.key ? String(a.key) : "";
    const i18nKey = ARTICLE_LABEL_KEYS[key];
    if (i18nKey) return t(i18nKey);
    return a?.label || key || "—";
  };
};
const cpCount = (a: CashflowArticle) =>
  (a.sub_buckets ?? []).reduce((n, sub) => n + (sub.counterparties ?? []).length, 0);

const isTerminal = (s?: string | null) => s === "done" || s === "failed";

export function CashflowView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const [date, setDate] = useState<string>(yesterdayIso());
  const { data: subsResp, isLoading: subsLoading } = useCashflowSubscriptions(companyId);

  const subs = useMemo<BankSubscription[]>(() => {
    const items = subsResp?.items ?? [];
    return items.filter(
      (s) =>
        !s.is_deleted &&
        ["active", "running", "pending"].includes(String(s.status)) &&
        SUPPORTED_BANKS.includes(String(s.bank_type))
    );
  }, [subsResp]);

  // Any section has a rendered (done) report → show the Refresh (force) button.
  const [anyDone, setAnyDone] = useState(false);
  const canGenerate = !!date && subs.length > 0;
  const genRef = useRef<{ generate: (force: boolean) => void }>({ generate: () => {} });

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-border bg-card p-3">
        <h2 className="text-base font-semibold flex items-center gap-2 mr-2">
          <TrendingUp className="size-5 text-primary" /> {t("modules.bank.cashflow.title")}
        </h2>
        <DatePicker
          value={date}
          onChange={(v) => setDate(v)}
          className="w-44 h-9"
        />
        <Button
          disabled={!canGenerate}
          onClick={() => genRef.current.generate(false)}
          className="h-9"
        >
          {t("modules.bank.cashflow.createReport")}
        </Button>
        {anyDone && (
          <Button
            variant="outline"
            size="icon"
            title={t("modules.bank.cashflow.refreshFromBank")}
            onClick={() => genRef.current.generate(true)}
            className="h-9 w-9"
          >
            <RefreshCw className="size-4" />
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {subs.length > 0
            ? t("modules.bank.cashflow.banksCount", { count: subs.length })
            : t("modules.bank.cashflow.noSupportedBank")}
        </span>
      </div>

      <Reveal
        loading={subsLoading}
        skeleton={
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        }
      >
        {subs.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
            {t("modules.bank.cashflow.emptySubs")}
          </div>
        ) : (
          <Sections
            companyId={companyId}
            subs={subs}
            date={date}
            genRef={genRef}
            onAnyDone={setAnyDone}
          />
        )}
      </Reveal>
    </div>
  );
}

// Wires the shared generate() (fired by the top-bar buttons) to every section.
function Sections({
  companyId, subs, date, genRef, onAnyDone,
}: {
  companyId: number;
  subs: BankSubscription[];
  date: string;
  genRef: React.MutableRefObject<{ generate: (force: boolean) => void }>;
  onAnyDone: (v: boolean) => void;
}) {
  // Each section registers its own trigger here, keyed by subscription id.
  const triggers = useRef<Record<string, (force: boolean) => void>>({});
  const doneState = useRef<Record<string, boolean>>({});

  genRef.current.generate = (force: boolean) => {
    Object.values(triggers.current).forEach((fn) => fn(force));
  };

  const reportDone = (id: string, done: boolean) => {
    doneState.current[id] = done;
    onAnyDone(Object.values(doneState.current).some(Boolean));
  };

  return (
    <div className="space-y-4">
      {subs.map((sub) => (
        <BankSection
          key={sub.id}
          companyId={companyId}
          sub={sub}
          date={date}
          registerTrigger={(fn) => {
            triggers.current[sub.id] = fn;
          }}
          onDoneChange={(done) => reportDone(sub.id, done)}
        />
      ))}
    </div>
  );
}

type SectionPhase = "idle" | "lookup" | "progress" | "result" | "error";

function BankSection({
  companyId, sub, date, registerTrigger, onDoneChange,
}: {
  companyId: number;
  sub: BankSubscription;
  date: string;
  registerTrigger: (fn: (force: boolean) => void) => void;
  onDoneChange: (done: boolean) => void;
}) {
  const { t } = useTranslation();
  const bankName = BANK_NAMES[String(sub.bank_type)] || sub.bank_name || String(sub.bank_type);
  const [phase, setPhase] = useState<SectionPhase>("idle");
  const [report, setReport] = useState<CashflowReport | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");
  const createReport = useCreateReport(companyId);

  const stopRef = useRef<(() => void) | null>(null);
  const genTokenRef = useRef(0);

  const stopStream = () => {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }
  };

  // ── cached lookup whenever (company, sub, date) changes ────────────────────
  useEffect(() => {
    let cancelled = false;
    stopStream();
    setReport(null);
    setErrMsg("");
    onDoneChange(false);
    setPhase("lookup");
    const token = ++genTokenRef.current;

    api_findCached(companyId, sub.id, date)
      .then((row) => {
        if (cancelled || token !== genTokenRef.current) return;
        if (row && row.status === "done" && row.payload) {
          setReport(row);
          setPhase("result");
          onDoneChange(true);
        } else if (row && (row.status === "running" || row.status === "queued")) {
          setReport(row);
          setPhase("progress");
          beginStream(reportId(row));
        } else {
          setPhase("idle");
        }
      })
      .catch(() => {
        if (cancelled || token !== genTokenRef.current) return;
        setPhase("idle");
      });

    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, sub.id, date]);

  // ── progress consumption: SSE first, polling fallback ──────────────────────
  const beginStream = (id: string | null) => {
    if (!id) return;
    stopStream();
    const token = genTokenRef.current;

    const onProgress = (row: CashflowReport) => {
      if (token !== genTokenRef.current) return;
      setReport((prev) => ({ ...(prev || {}), ...row }));
    };
    const onTerminal = (row: CashflowReport) => {
      if (token !== genTokenRef.current) return;
      stopStream();
      if (row.status === "done" && row.payload) {
        setReport(row);
        setPhase("result");
        onDoneChange(true);
      } else {
        setErrMsg(row.error_message || t("modules.bank.cashflow.errors.failed"));
        setPhase("error");
        onDoneChange(false);
      }
    };
    const onFail = (msg: string) => {
      if (token !== genTokenRef.current) return;
      // SSE died before terminal — fall back to polling.
      startPolling(id, token, onProgress, onTerminal, msg);
    };

    stopRef.current = startSse(companyId, id, onProgress, onTerminal, onFail);
  };

  const startPolling = (
    id: string,
    token: number,
    onProgress: (r: CashflowReport) => void,
    onTerminal: (r: CashflowReport) => void,
    fallbackMsg: string
  ) => {
    let stopped = false;
    let tries = 0;
    const tick = async () => {
      if (stopped || token !== genTokenRef.current) return;
      try {
        const row = await fetchReport(companyId, id);
        if (stopped || token !== genTokenRef.current) return;
        onProgress(row);
        if (isTerminal(row.status)) {
          onTerminal(row);
          return;
        }
      } catch {
        tries++;
        if (tries > 8) {
          setErrMsg(fallbackMsg || t("modules.bank.cashflow.errors.connectionLost"));
          setPhase("error");
          return;
        }
      }
      if (++tries > 100) {
        setErrMsg(t("modules.bank.cashflow.errors.tooLong"));
        setPhase("error");
        return;
      }
      setTimeout(tick, 1200);
    };
    stopRef.current = () => {
      stopped = true;
    };
    tick();
  };

  // ── generate (one POST), wired to the top-bar buttons ──────────────────────
  const generate = (force: boolean) => {
    if (!date) return;
    stopStream();
    setErrMsg("");
    onDoneChange(false);
    setPhase("progress");
    setReport({ status: "queued", stage: "queued" });
    const token = ++genTokenRef.current;

    createReport.mutate(
      { subscription_id: sub.id, date, force },
      {
        onSuccess: (row) => {
          if (token !== genTokenRef.current) return;
          if (row.status === "done" && row.payload && !force) {
            setReport(row);
            setPhase("result");
            onDoneChange(true);
            return;
          }
          setReport((prev) => ({ ...(prev || {}), ...row }));
          beginStream(reportId(row));
        },
        onError: (e: unknown) => {
          if (token !== genTokenRef.current) return;
          const detail =
            (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            t("modules.bank.cashflow.errors.cannotStart");
          setErrMsg(String(detail));
          setPhase("error");
        },
      }
    );
  };

  useEffect(() => {
    registerTrigger(generate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dispDate = date ? date.split("-").reverse().join(".") : "";

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <span className="size-2 rounded-full bg-success" />
        <span className="font-semibold">{bankName}</span>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">{dispDate}</span>
      </header>

      {phase === "lookup" && (
        <div className="p-4 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {phase === "idle" && (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground animate-in fade-in-0 duration-300">
          {t("modules.bank.cashflow.idleHint")}
        </div>
      )}

      {phase === "progress" && <ProgressStrip report={report} />}

      {phase === "error" && (
        <div className="px-4 py-6 flex flex-col items-center gap-3 animate-in fade-in-0 duration-300">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4" /> {errMsg || t("modules.bank.cashflow.errors.failed")}
          </div>
          <Button variant="outline" size="sm" onClick={() => generate(false)}>
            {t("modules.bank.cashflow.retry")}
          </Button>
        </div>
      )}

      {phase === "result" && report?.payload && (
        <div className="animate-in fade-in-0 duration-300">
          <ResultTable report={report} />
        </div>
      )}
    </section>
  );
}

function ProgressStrip({ report }: { report: CashflowReport | null }) {
  const { t } = useTranslation();
  const stage = String(report?.stage || "queued");
  const step = STEP_OF[stage] ?? 0;
  const stepLabel = step ? t("modules.bank.cashflow.stepOf", { step, total: TOTAL_STEPS }) : "";
  const stageKey = STAGE_KEYS[stage];
  const label = stageKey ? t(stageKey) : t("modules.bank.cashflow.stages.queued");
  let hint = "";
  if (stage === "fetching_statements" && report?.accounts_total) {
    const done = report.accounts_done || 0;
    const acc = report.current_account ? ` · ${maskAcc(report.current_account)}` : "";
    hint = `${done}/${report.accounts_total}${acc}`;
  }
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <div className="px-4 py-5 space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin text-primary" />
        {stepLabel && (
          <span className="text-xs font-medium tracking-wide text-muted-foreground">
            {stepLabel}
          </span>
        )}
        <span className="font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground ml-auto tabular-nums">{hint}</span>}
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ResultTable({ report }: { report: CashflowReport }) {
  const { t } = useTranslation();
  const payload = report.payload || {};
  const totals = payload.totals || {};
  const articles = payload.articles || [];
  const perebroska = payload.perebroska;

  return (
    <div>
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border-b border-border">
        <SummaryCell label={t("modules.bank.cashflow.totals.opening")} value={money(totals.opening)} />
        <SummaryCell label={t("modules.bank.cashflow.totals.closing")} value={money(totals.closing)} />
        <SummaryCell label={t("modules.bank.cashflow.totals.income")} value={money(totals.income)} tone="in" />
        <SummaryCell label={t("modules.bank.cashflow.totals.expense")} value={money(totals.expense)} tone="out" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-semibold">{t("modules.bank.cashflow.cols.article")}</th>
              <th className="px-4 py-2 font-semibold w-24">{t("modules.bank.cashflow.cols.code")}</th>
              <th className="px-4 py-2 font-semibold text-right w-40">{t("modules.bank.cashflow.cols.income")}</th>
              <th className="px-4 py-2 font-semibold text-right w-40">{t("modules.bank.cashflow.cols.expense")}</th>
            </tr>
          </thead>
          {articles.map((art, i) => (
            <ArticleBody key={art.key || i} art={art} />
          ))}
          <tbody>
            {articles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  {t("modules.bank.cashflow.noData")}
                </td>
              </tr>
            )}
            <tr className="border-t-2 border-border bg-muted/60 font-semibold sticky bottom-0">
              <td className="px-4 py-2.5">{t("modules.bank.cashflow.totalRow")}</td>
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5 text-right tabular-nums text-success">
                {money(totals.income)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-destructive">
                {money(totals.expense)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {!!perebroska?.count && (
        <p className="px-4 py-2.5 text-xs text-muted-foreground border-t border-border">
          {t("modules.bank.cashflow.internalExcluded", { amount: money(perebroska.total), count: perebroska.count })}
        </p>
      )}
    </div>
  );
}

function SummaryCell({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: "in" | "out";
}) {
  const color =
    tone === "in"
      ? "text-success"
      : tone === "out"
        ? "text-destructive"
        : "";
  return (
    <div className="bg-card px-4 py-2.5">
      <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

function ArticleBody({ art }: { art: CashflowArticle }) {
  const { t } = useTranslation();
  const articleLabel = useArticleLabel();
  const [open, setOpen] = useState(false);
  const dirIn = art.direction === "in";
  const dirOut = art.direction === "out";
  const count = cpCount(art);

  return (
    <tbody className="border-b border-border last:border-b-0">
      <tr
        className="cursor-pointer bg-muted/30 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <ChevronRight
              className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
            />
            {articleLabel(art)}
            <span className="text-xs text-muted-foreground font-normal">· {t("modules.bank.cashflow.itemsCount", { count })}</span>
          </span>
        </td>
        <td className="px-4 py-2.5" />
        <td className="px-4 py-2.5 text-right tabular-nums text-success">
          {dirIn ? money(art.total) : ""}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-destructive">
          {dirOut ? money(art.total) : ""}
        </td>
      </tr>
      {open &&
        (art.sub_buckets ?? []).map((sub, si) =>
          (sub.counterparties ?? []).map((cp, ci) => {
            const code = sub.purpose_code && sub.purpose_code !== "—" ? sub.purpose_code : "";
            return (
              <tr key={`${si}-${ci}`} className="text-[13px] hover:bg-muted/40">
                <td className="px-4 py-2 pl-9">
                  <div className="font-medium" title={cp.name || ""}>
                    {cp.name || "—"}
                  </div>
                  {cp.inn && (
                    <div className="text-xs text-muted-foreground tabular-nums">INN {cp.inn}</div>
                  )}
                  {cp.fx_amount && cp.fx_currency && (
                    <div className="text-xs text-info font-medium">
                      {money(cp.fx_amount)} {cp.fx_currency}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 tabular-nums text-xs text-muted-foreground">{code}</td>
                <td className="px-4 py-2 text-right tabular-nums text-success">
                  {dirIn ? money(cp.amount) : ""}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-destructive">
                  {dirOut ? money(cp.amount) : ""}
                </td>
              </tr>
            );
          })
        )}
    </tbody>
  );
}

// ── transport: cached lookup (axios) + fetch-based SSE reader ─────────────────
async function api_findCached(
  companyId: number,
  subscriptionId: string,
  date: string
): Promise<CashflowReport | null> {
  const resp = await api.get(`/bank/companies/${companyId}/cashflow/reports`, {
    params: { subscription_id: subscriptionId, date },
  });
  return (resp.data?.report ?? null) as CashflowReport | null;
}

// fetch-based EventSource replacement so we can send auth headers.
// Returns a stop() function. On any pre-terminal failure, calls onFail(msg).
function startSse(
  companyId: number,
  id: string,
  onProgress: (r: CashflowReport) => void,
  onTerminal: (r: CashflowReport) => void,
  onFail: (msg: string) => void
): () => void {
  const controller = new AbortController();
  let terminal = false;
  let stopped = false;

  const { token } = useAuth.getState();
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  if (token) headers["X-AIBA-Token"] = token;

  const url = `/api/v2/bank/companies/${companyId}/cashflow/reports/${encodeURIComponent(id)}/stream`;

  (async () => {
    try {
      const resp = await fetch(url, { headers, signal: controller.signal });
      if (!resp.ok || !resp.body) {
        if (!stopped) onFail(i18n.t("modules.bank.cashflow.errors.streamOpenFailed"));
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          parseSseChunk(chunk, {
            onData: onProgress,
            onTerminal: (r) => {
              terminal = true;
              onTerminal(r);
            },
            onError: (msg) => {
              if (!terminal && !stopped) onFail(msg);
            },
          });
          if (terminal) {
            controller.abort();
            return;
          }
        }
      }
      // Stream ended without a terminal event → fall back.
      if (!terminal && !stopped) onFail(i18n.t("modules.bank.cashflow.errors.streamInterrupted"));
    } catch (e) {
      if (stopped || terminal) return;
      if ((e as Error)?.name === "AbortError") return;
      onFail(i18n.t("modules.bank.cashflow.errors.streamError"));
    }
  })();

  return () => {
    stopped = true;
    controller.abort();
  };
}

function parseSseChunk(
  chunk: string,
  cb: {
    onData: (r: CashflowReport) => void;
    onTerminal: (r: CashflowReport) => void;
    onError: (msg: string) => void;
  }
) {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of chunk.split("\n")) {
    if (line.startsWith(":")) continue; // keepalive comment
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return;
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    return;
  }
  if (event === "terminal") cb.onTerminal(data as CashflowReport);
  else if (event === "error") cb.onError((data.detail as string) || i18n.t("modules.bank.cashflow.errors.generic"));
  else if (event === "timeout") cb.onError(i18n.t("modules.bank.cashflow.errors.tooLong"));
  else cb.onData(data as CashflowReport); // "data" / default
}
