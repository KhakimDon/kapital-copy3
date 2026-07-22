/**
 * Entry detail drawer — mirrors cloud `#aiba-av-detail` (right-side Sheet).
 *
 * Three modes share the same drawer:
 *   - "view"    — title chips, key fields, provodka lines, matched-1C dump.
 *   - "confirm" — inline form to overwrite Dt/Kt/amount/notes and flip
 *                 has_provodka=1. Re-uses the existing confirm endpoint.
 *   - "reject"  — inline form to stamp `_reject_reason` + flip
 *                 has_provodka=0. Re-uses the existing reject endpoint.
 *
 * The "Save & send to 1C" action lives in the classify-result modal — not
 * here; this drawer is the post-classify review surface.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cpu, FileText, Calendar, Building2, Hash, ArrowRightLeft,
  AlertCircle, CheckCircle2, XCircle, Send, Pencil, Loader2, Copy, Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useCompany } from "@/shared/store/company";
import {
  type AvEntry, fmtDate, fmtDateTime, money,
  ONEC_TYPE_LABEL, SOURCE_META, STATUS_META,
  useAvEntry, useConfirmEntry, useConfirmSourceProvodka, useRejectEntry, useSendEntry,
  useDocumentHtml,
} from "./api";

type Mode = "view" | "confirm" | "reject";

export function AvDetailDrawer({
  entryId,
  fallback,
  open: openProp,
  initialMode = "view",
  onClose,
  sys = "1C",
}: {
  entryId: number | null;
  fallback?: AvEntry;
  /**
   * Whether the drawer is open. Separate from `entryId` because live rows have
   * id 0 — openness cannot be inferred from having an id.
   */
  open?: boolean;
  initialMode?: Mode;
  onClose: () => void;
  /** Accounting system name every "1C …" label switches on ("1C" | "1UZ"). */
  sys?: string;
}) {
  const { t } = useTranslation();
  const { data: fresh, isLoading } = useAvEntry(entryId);
  const entry = fresh ?? fallback ?? null;
  const open = openProp ?? entryId != null;

  const companyId = useCompany((s) => s.current)?.id ?? 0;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<string | null>(null);
  const [docOpen, setDocOpen] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setBanner(null);
  }, [entryId, initialMode]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Cpu className="size-5 text-primary" /> Avtoprovodka tafsiloti
          </SheetTitle>
        </SheetHeader>

        <Reveal
          loading={!entry}
          className="flex-1 overflow-y-auto"
          skeleton={
            <div className="space-y-3 p-5">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          }
        >
          {entry && (
          <div className="p-5 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={SOURCE_META[entry.source_type].variant}>
                {SOURCE_META[entry.source_type].label}
              </Badge>
              <Badge variant={STATUS_META[entry.status].variant}>
                {STATUS_META[entry.status].label}
              </Badge>
              {entry.confirmed_at && (
                <span className="text-[11px] text-success">
                  Tasdiqlangan: {fmtDateTime(entry.confirmed_at)}
                </span>
              )}
              {entry.sent_at && (
                <span className="text-[11px] text-info">
                  Yuborilgan: {fmtDateTime(entry.sent_at)}
                </span>
              )}
              {entry.rejected_at && (
                <span className="text-[11px] text-destructive">
                  Rad etilgan: {fmtDateTime(entry.rejected_at)}
                </span>
              )}
              {isLoading && fresh == null && (
                <span className="text-xs text-muted-foreground">yangilanmoqda…</span>
              )}
            </div>

            {entry.source_type === "document"
              && (entry.didox_id || entry.doc_id || entry.source_id) && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setDocOpen(true)}
              >
                <FileText className="size-4" /> Hujjatni ko'rish
              </Button>
            )}

            {entry.reject_reason && (
              <Notice tone="danger" icon={<AlertCircle className="size-4" />}>
                <div className="text-xs uppercase tracking-wide mb-0.5">
                  Rad etish sababi
                </div>
                <div>{entry.reject_reason}</div>
              </Notice>
            )}

            {entry.matched_onec?._dispatcher_note && entry.status === "sent" && (
              <Notice tone="warning" icon={<AlertCircle className="size-4" />}>
                <span>{entry.matched_onec._dispatcher_note}</span>
              </Notice>
            )}

            {banner && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                <span>{banner}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setBanner(null)}
                  className="size-5 text-muted-foreground hover:text-foreground"
                  aria-label="Yopish"
                >
                  ×
                </Button>
              </div>
            )}

            {mode === "view" && (
              <ActionBar
                entry={entry}
                companyId={companyId}
                sys={sys}
                onConfirm={() => { setMode("confirm"); setBanner(null); }}
                onReject={() => { setMode("reject"); setBanner(null); }}
                onSent={(note) =>
                  setBanner(note ? `${sys} ga yuborildi (${note})` : `${sys} ga yuborildi`)}
                onDone={(msg) => setBanner(msg)}
                onError={() => setBanner(t("modules.avtoprovodka.detailDrawer.bannerFailed"))}
              />
            )}

            {mode === "confirm" && (
              <ConfirmForm
                entry={entry}
                onCancel={() => setMode("view")}
                onDone={() => { setMode("view"); setBanner(t("modules.avtoprovodka.detailDrawer.bannerSaved")); }}
              />
            )}

            {mode === "reject" && (
              <RejectForm
                entry={entry}
                onCancel={() => setMode("view")}
                onDone={() => { setMode("view"); setBanner(t("modules.avtoprovodka.detailDrawer.bannerRejected")); }}
              />
            )}

            <dl className="space-y-3 text-sm">
              <Field
                icon={<FileText className="size-4" />}
                label={t("modules.avtoprovodka.detailDrawer.metaDocNumber")}
                value={entry.onec_number || entry.source_id}
                mono
              />
              <Field
                icon={<Calendar className="size-4" />}
                label={t("modules.avtoprovodka.detailDrawer.metaDocDate")}
                value={fmtDate(entry.onec_date)}
              />
              <Field
                icon={<Building2 className="size-4" />}
                label={t("modules.avtoprovodka.detailDrawer.metaCounterparty")}
                value={
                  entry.counterparty_name || entry.counterparty_inn
                    ? `${entry.counterparty_name ?? "—"}${entry.counterparty_inn ? ` (${entry.counterparty_inn})` : ""}`
                    : null
                }
              />
              <Field
                icon={<Hash className="size-4" />}
                label={t("modules.avtoprovodka.detailDrawer.metaSourceId")}
                value={entry.source_id}
                mono
              />
              {entry.onec_type && (
                <Field
                  icon={<ArrowRightLeft className="size-4" />}
                  label={t("modules.avtoprovodka.detailDrawer.metaOpType", { sys })}
                  value={ONEC_TYPE_LABEL[entry.onec_type] || entry.onec_type}
                />
              )}
              <Field
                icon={<Calendar className="size-4" />}
                label={t("modules.avtoprovodka.detailDrawer.metaLastCheck")}
                value={fmtDateTime(entry.last_checked_at)}
              />
            </dl>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                {t("modules.avtoprovodka.detailDrawer.provLines")}{" "}
                <span className="text-foreground">({entry.entries_count})</span>
              </div>
              {entry.entries.length === 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  <AlertCircle className="size-4" />
                  AI klassifikatsiyasi mavjud emas.
                </div>
              ) : (
                <div className="space-y-2">
                  {entry.entries.map((line, i) => (
                    <div
                      key={i}
                      className="space-y-1.5 rounded-md border border-border bg-card p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                            Дт {line.debit_account || "—"}
                          </span>
                          <ArrowRightLeft className="size-3 text-muted-foreground" />
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                            Кт {line.credit_account || "—"}
                          </span>
                        </div>
                        <div className="font-semibold tabular-nums">
                          {money(line.amount)}
                        </div>
                      </div>
                      {(line.debit_account_name || line.credit_account_name) && (
                        <div className="space-y-0.5 text-xs text-muted-foreground">
                          {line.debit_account_name && (
                            <div>
                              <span className="mr-1 font-mono">Дт:</span>
                              {line.debit_account_name}
                            </div>
                          )}
                          {line.credit_account_name && (
                            <div>
                              <span className="mr-1 font-mono">Кт:</span>
                              {line.credit_account_name}
                            </div>
                          )}
                        </div>
                      )}
                      {line.description && (
                        <div className="text-xs text-foreground">{line.description}</div>
                      )}
                      {line.period && (
                        <div className="text-xs text-muted-foreground">
                          Davr: {fmtDate(line.period)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Onec1CBlock entry={entry} sys={sys} />
          </div>
          )}
        </Reveal>

        {entry && (
          <DocumentDialog
            companyId={companyId}
            docId={entry.didox_id || entry.doc_id || entry.source_id}
            open={docOpen}
            onClose={() => setDocOpen(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DocumentDialog({
  companyId, docId, open, onClose,
}: {
  companyId: number;
  docId?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useDocumentHtml(companyId, docId ?? null, open);
  const html = data?.html ?? "";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" /> Hujjat
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden bg-white">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" /> Yuklanmoqda…
            </div>
          ) : isError || !html ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground animate-in fade-in-0 duration-300">
              Hujjatni yuklab bo'lmadi
            </div>
          ) : (
            <iframe
              title="Hujjat"
              srcDoc={html}
              className="h-full w-full border-0 animate-in fade-in-0 duration-300"
              sandbox="allow-same-origin"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActionBar({
  entry, companyId, sys, onConfirm, onReject, onSent, onDone, onError,
}: {
  entry: AvEntry;
  companyId: number;
  sys: string;
  onConfirm: () => void;
  onReject: () => void;
  onSent: (note?: string | null) => void;
  onDone: (msg: string) => void;
  onError: () => void;
}) {
  const send = useSendEntry();
  const confirmSource = useConfirmSourceProvodka(companyId);
  const isNonDoc = entry.source_type === "bank_txn" || entry.source_type === "fiscal_cheque";
  // Already posted to 1C (matched or sent) → the provodka is final; confirm /
  // reject / edit no longer apply. A reversal would be a 1C storno, not here.
  if (entry.status === "imported" || entry.in_onec) {
    return (
      <div className="text-xs italic text-muted-foreground">
        Bu hujjat allaqachon {sys}da — tasdiqlash/rad etish amallari mavjud emas.
      </div>
    );
  }
  // Bank / cheque confirm the whole displayed provodka as-is (multi-line) into
  // km.avtoprov_provodka; to EDIT lines the user opens the classify modal from
  // the row menu. 1C send for these sources is a separate follow-up.
  const confirmNonDoc = () =>
    confirmSource.mutate(
      {
        source_type: entry.source_type,
        source_id: entry.source_id,
        raw: entry.raw ?? {},
        entries: entry.entries.map((l, i) => ({
          line: i + 1,
          debit_account: String(l.debit_account ?? ""),
          credit_account: String(l.credit_account ?? ""),
          amount: Number(l.amount) || 0,
          description: String(l.description ?? ""),
        })),
      },
      { onSuccess: () => onDone("Provodka tasdiqlandi ✓"), onError },
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isNonDoc ? (
        entry.has_provodka && (
          <Button size="sm" disabled={confirmSource.isPending} onClick={confirmNonDoc}>
            {confirmSource.isPending
              ? <Loader2 className="mr-1.5 size-4 animate-spin" />
              : <CheckCircle2 className="mr-1.5 size-4" />}
            Tasdiqlash
          </Button>
        )
      ) : !entry.has_provodka || entry.reject_reason ? (
        <Button size="sm" onClick={onConfirm}>
          <CheckCircle2 className="mr-1.5 size-4" />
          Tasdiqlash
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={onConfirm}>
          <Pencil className="mr-1.5 size-4" />
          Tahrirlash
        </Button>
      )}
      {entry.has_provodka && !entry.in_onec && entry.source_type === "document" && (
        <Button
          size="sm"
          disabled={send.isPending}
          onClick={() =>
            send.mutate(
              { id: entry.id },
              {
                onSuccess: (res) => onSent(res?.note ?? null),
                onError,
              },
            )
          }
        >
          {send.isPending
            ? <Loader2 className="mr-1.5 size-4 animate-spin" />
            : <Send className="mr-1.5 size-4" />}
          {sys} ga yuborish
        </Button>
      )}
      {!entry.rejected_at && entry.source_type === "document" && (
        <Button size="sm" variant="outline" onClick={onReject}>
          <XCircle className="mr-1.5 size-4 text-destructive" />
          Rad etish
        </Button>
      )}
    </div>
  );
}

function ConfirmForm({
  entry, onCancel, onDone,
}: {
  entry: AvEntry;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const first = entry.entries[0] || {};
  const [dt, setDt] = useState<string>(String(first.debit_account ?? entry.first_entry_debit ?? ""));
  const [kt, setKt] = useState<string>(String(first.credit_account ?? entry.first_entry_credit ?? ""));
  const [amount, setAmount] = useState<string>(
    first.amount != null ? String(first.amount) : (entry.amount != null ? String(entry.amount) : ""),
  );
  const [notes, setNotes] = useState<string>(String(first.description ?? ""));
  const [err, setErr] = useState<string | null>(null);
  const m = useConfirmEntry();

  const submit = () => {
    setErr(null);
    const amt = amount.trim() === "" ? null : Number(amount);
    if (amt != null && !Number.isFinite(amt)) {
      setErr(t("modules.avtoprovodka.detailDrawer.errSumIsNumber"));
      return;
    }
    m.mutate(
      {
        id: entry.id,
        payload: {
          dt: dt.trim() || null,
          kt: kt.trim() || null,
          amount: amt,
          notes: notes.trim() || null,
        },
      },
      {
        onSuccess: onDone,
        onError: (e: unknown) => {
          const ax = e as { response?: { data?: { detail?: string } } };
          setErr(ax.response?.data?.detail ?? t("modules.avtoprovodka.detailDrawer.errSendFailed"));
        },
      },
    );
  };

  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CheckCircle2 className="size-4 text-primary" />
        Provodkani tasdiqlash
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Dt (debet)</span>
          <Input value={dt} onChange={(e) => setDt(e.target.value)} maxLength={32} placeholder="4010" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Kt (kredit)</span>
          <Input value={kt} onChange={(e) => setKt(e.target.value)} maxLength={32} placeholder="6010" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Summa</span>
        <Input
          type="number" inputMode="decimal" step="0.01"
          value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Izoh</span>
        <Input
          value={notes} onChange={(e) => setNotes(e.target.value)}
          maxLength={1024} placeholder="Ixtiyoriy"
        />
      </label>
      {err && (
        <div className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-4" />{err}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={m.isPending}>
          Bekor qilish
        </Button>
        <Button size="sm" disabled={m.isPending} onClick={submit}>
          {m.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          Tasdiqlash
        </Button>
      </div>
    </div>
  );
}

function RejectForm({
  entry, onCancel, onDone,
}: {
  entry: AvEntry;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const m = useRejectEntry();

  const submit = () => {
    setErr(null);
    if (!reason.trim()) {
      setErr(t("modules.avtoprovodka.detailDrawer.errReasonEmpty"));
      return;
    }
    m.mutate(
      { id: entry.id, reason: reason.trim() },
      {
        onSuccess: onDone,
        onError: (e: unknown) => {
          const ax = e as { response?: { data?: { detail?: string } } };
          setErr(ax.response?.data?.detail ?? t("modules.avtoprovodka.detailDrawer.errRejectFailed"));
        },
      },
    );
  };

  return (
    <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <XCircle className="size-4 text-destructive" />
        Provodkani rad etish
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Sabab *</span>
        <Input
          value={reason} onChange={(e) => setReason(e.target.value)}
          maxLength={1024} placeholder="Masalan: noto'g'ri kontragent / mos kelmagan"
          autoFocus
        />
      </label>
      {err && (
        <div className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-4" />{err}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={m.isPending}>
          Bekor qilish
        </Button>
        <Button
          size="sm" variant="destructive"
          disabled={m.isPending} onClick={submit}
        >
          {m.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          Rad etish
        </Button>
      </div>
    </div>
  );
}

function Notice({
  tone, icon, children,
}: { tone: "danger" | "warning"; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = tone === "danger"
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : "border-warning/30 bg-warning/10 text-warning";
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${cls}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

function Field({
  icon, label, value, mono,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={`break-words ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</dd>
      </div>
    </div>
  );
}


/**
 * The 1C side of a reconciled document: which 1C document we matched it to, and
 * the Дт/Кт lines 1C actually posted for it.
 *
 * This replaces a `JSON.stringify(matched_onec)` dump. The numbers a buxgalter
 * needs — the 1C document number, its id, the posted lines — were all in there,
 * just spelled as raw keys.
 *
 * Three states, and the third is not the second: no match means 1C was checked
 * and hasn't got it; no verdict at all means nobody has looked yet.
 */
function Onec1CBlock({ entry, sys }: { entry: AvEntry; sys: string }) {
  const { t } = useTranslation();
  const k = (x: string) => t(`modules.avtoprovodka.detailDrawer.onec1c.${x}`, { sys });
  const m = entry.matched_onec;

  if (!m?.number && !m?.id) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        <AlertCircle className="size-4" />
        {entry.in_onec === null ? k("unchecked") : k("notFound")}
      </div>
    );
  }

  const lines = entry.entries || [];
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        {k("title")}
      </div>
      <div className="space-y-3 rounded-md border border-success/30 bg-success/5 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-xs text-muted-foreground">{k("number")}</div>
            <div className="font-mono text-lg font-semibold">{m.number || "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">{k("sum")}</div>
            <div className="text-lg font-semibold tabular-nums">{money(m.sum)}</div>
          </div>
        </div>

        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{k("type")}</dt>
          <dd>{(m.type && ONEC_TYPE_LABEL[m.type]) || m.type || "—"}</dd>
          <dt className="text-muted-foreground">{k("date")}</dt>
          <dd>{fmtDate(m.date)}</dd>
          <dt className="text-muted-foreground">{k("partner")}</dt>
          <dd>
            {m.counterparty_name || "—"}
            {m.counterparty_inn && (
              <span className="ml-1 font-mono text-xs text-muted-foreground">
                INN {m.counterparty_inn}
              </span>
            )}
          </dd>
          <dt className="text-muted-foreground">{k("id")}</dt>
          <dd className="flex items-center gap-1.5">
            <span className="break-all font-mono text-xs">{m.id || "—"}</span>
            {m.id && <CopyBtn value={m.id} />}
          </dd>
        </dl>

        {lines.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              {k("lines")} <span className="text-foreground">({lines.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-2 font-normal">{k("line")}</th>
                    <th className="py-1 pr-2 font-normal">Дт</th>
                    <th className="py-1 pr-2 font-normal">Кт</th>
                    <th className="py-1 text-right font-normal">{k("sum")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-1 pr-2 tabular-nums text-muted-foreground">
                        {l.line ?? i + 1}
                      </td>
                      <td className="py-1 pr-2">
                        <span className="font-mono">{l.debit_account || "—"}</span>
                        {l.debit_account_name && (
                          <div className="text-xs text-muted-foreground">{l.debit_account_name}</div>
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        <span className="font-mono">{l.credit_account || "—"}</span>
                        {l.credit_account_name && (
                          <div className="text-xs text-muted-foreground">{l.credit_account_name}</div>
                        )}
                      </td>
                      <td className="py-1 text-right font-medium tabular-nums">{money(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Copy-to-clipboard for the 1C id — it's a UUID nobody retypes by hand. */
function CopyBtn({ value }: { value: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(false), 1500);
    return () => window.clearTimeout(id);
  }, [done]);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6 shrink-0"
      title={t(`modules.avtoprovodka.detailDrawer.onec1c.${done ? "copied" : "copy"}`)}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => setDone(true)).catch(() => {});
      }}
    >
      {done ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
    </Button>
  );
}
