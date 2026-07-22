/**
 * AI classification result modal — mirrors cloud `#aiba-av-modal`.
 *
 * Two modes (derived from the row in `page.tsx`):
 *  - live  (row "AI klassifikatsiya", row has NO provodka yet): calls
 *    POST /avtoprovodka/companies/{cid}/classify on open and shows the
 *    engine result (source / confidence / reasoning / validation) + the
 *    editable Дт/Кт lines it produced.
 *  - review (row "1C ga yuborish", row already has provodka): shows the
 *    row's existing entries for confirm + send.
 *
 * "Save & send to 1C" writes the (edited) first line via the confirm
 * endpoint (flips has_provodka=1) then the send endpoint.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Cpu, Loader2, AlertCircle, Plus, Trash2, ArrowRightLeft, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import {
  type AvEntry, type ProvodkaLine, type ClassifyResult, money,
  useConfirmEntry, useConfirmProvodka, useSendEntry, useSendToOnec, useClassify,
  useConfirmSourceProvodka,
} from "./api";

type EditableLine = ProvodkaLine & { _id: string };

const SOURCE_LABEL: Record<string, string> = {
  operator_confirmed: "Tasdiqlangan shablon",
  learned_pattern: "Tarixiy shablon",
  mxik_pattern: "MXIK bo'yicha",
  rule: "NSBU qoidasi",
  gemini_pro: "AI",
  gemini_pro_judged: "AI + tekshiruv",
  no_rule: "Qoida topilmadi",
  error: "Tizim xatosi",
  skip: "Provodka kerak emas",
};

// Validation kodlari → o'zbekcha (inglizcha kod ko'rinmasligi uchun).
const VALIDATION_UZ: Record<string, string> = {
  EMPTY_ENTRIES: "Provodka qatorlari bo'sh",
  MISSING_VAT_ENTRY: "QQS qatori yetishmaydi",
  ENGINE_ERROR: "AI dvigatel xatosi",
  BALANCE_MISMATCH: "Дт va Кт teng emas",
  INVALID_ACCOUNT: "Noto'g'ri hisob kodi",
  INVALID_COMBINATION: "Дт/Кт mos kelmaydi",
  NEGATIVE_AMOUNT: "Summa manfiy",
  AMOUNT_EXCEEDS_DOCUMENT: "Summa hujjat summasidan oshiq",
  COUNTERPARTY_INACTIVE: "Kontragent faol emas",
  VAT_AMOUNT_MISMATCH: "QQS summasi mos emas",
};

function toLines(rows: ProvodkaLine[], fallbackAmount?: number | null): EditableLine[] {
  const src = rows && rows.length > 0
    ? rows
    : [{ debit_account: "", credit_account: "", amount: fallbackAmount ?? 0, description: "" }];
  return src.map((r, i) => ({
    ...r,
    amount: r.amount == null ? null : Number(r.amount),
    _id: `l-${i}`,
  }));
}

export function ClassifyResultModal({
  entry, open, onClose, companyId, live = false, infobaseId = "", sys = "1C",
}: {
  entry: AvEntry | null;
  open: boolean;
  onClose: () => void;
  companyId: number;
  live?: boolean;
  /** Selected 1C base (route_key) — forwarded to the send step. */
  infobaseId?: string;
  /** Accounting system name every "1C …" label switches on ("1C" | "1UZ"). */
  sys?: string;
}) {
  const classifyM = useClassify(companyId);
  const confirmM = useConfirmEntry();
  const confirmLiveM = useConfirmProvodka(companyId);
  const confirmSourceM = useConfirmSourceProvodka(companyId);
  const sendOnecM = useSendToOnec(companyId);
  const sendM = useSendEntry();
  const isNonDoc =
    entry?.source_type === "bank_txn" || entry?.source_type === "fiscal_cheque";

  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // On open: reset, and either run a live classify or load existing lines.
  useEffect(() => {
    if (!open || !entry) return;
    setBanner(null);
    setErr(null);
    setResult(null);
    if (live) {
      setLines([]);
      // Bank/cheque feed the whole raw upstream row to the engine (the payment
      // purpose / method is the signal). Documents pass just the id — the
      // backend re-fetches the didox detail.
      const sd: Record<string, unknown> = isNonDoc
        ? { ...(entry.raw ?? {}), id: entry.source_id }
        : { id: entry.didox_id || entry.doc_id || entry.source_id };
      if (entry.direction && entry.direction !== "all") sd.direction = entry.direction;
      if (entry.amount != null) sd.amount = entry.amount;
      if (entry.counterparty_inn) sd.counterparty_inn = entry.counterparty_inn;
      classifyM.mutate(
        { source_type: entry.source_type, source_data: sd },
        {
          onSuccess: (res) => {
            setResult(res);
            setLines(toLines(res.entries ?? [], entry.amount));
          },
          onError: (e: unknown) => {
            const ax = e as { response?: { data?: { detail?: string } } };
            setErr(ax.response?.data?.detail ?? "Klassifikatsiya bajarilmadi");
            setLines(toLines([], entry.amount));
          },
        },
      );
    } else {
      setLines(toLines(entry.entries ?? [], entry.amount));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id, live]);

  const classifying = live && classifyM.isPending && !result;
  const pending = confirmM.isPending || confirmLiveM.isPending || confirmSourceM.isPending || sendOnecM.isPending || sendM.isPending;

  const update = (id: string, patch: Partial<EditableLine>) =>
    setLines((cur) => cur.map((l) => (l._id === id ? { ...l, ...patch } : l)));
  const addLine = () =>
    setLines((cur) => [
      ...cur,
      { _id: `l-${Date.now()}`, debit_account: "", credit_account: "", amount: 0, description: "" },
    ]);
  const removeLine = (id: string) =>
    setLines((cur) => cur.filter((l) => l._id !== id));

  const total = lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
  const confPct = result ? Math.round(Number(result.confidence || 0) * 100) : 0;

  const saveAndSend = () => {
    if (!entry) return;
    setErr(null);
    const first = lines[0];
    if (!first?.debit_account?.toString().trim() || !first?.credit_account?.toString().trim()) {
      setErr("Birinchi qatorda Дт va Кт majburiy");
      return;
    }
    const amt = Number(first.amount);
    if (!Number.isFinite(amt)) {
      setErr("Summa raqam bo'lishi kerak");
      return;
    }
    // Bank / cheque: confirm into km.avtoprov_provodka (no didox anchor, and no
    // 1C write step yet — that's a separate follow-up). A confirmed bank line
    // also teaches the engine the counterparty's template (T0).
    if (isNonDoc) {
      const bad = lines.find(
        (l) => !l.debit_account?.toString().trim() || !l.credit_account?.toString().trim(),
      );
      if (bad) {
        setErr("Har bir qatorda Дт va Кт bo'lishi shart");
        return;
      }
      confirmSourceM.mutate(
        {
          source_type: entry.source_type,
          source_id: entry.source_id,
          raw: entry.raw ?? {},
          entries: lines.map((l, i) => ({
            line: i + 1,
            debit_account: l.debit_account?.toString().trim(),
            credit_account: l.credit_account?.toString().trim(),
            amount: Number(l.amount) || 0,
            description: l.description?.toString().trim() || "",
          })),
        },
        {
          onSuccess: () => {
            setBanner("Saqlandi ✓ — provodka tasdiqlandi");
            window.setTimeout(onClose, 1200);
          },
          onError: (e: unknown) => {
            const ax = e as { response?: { data?: { detail?: string } } };
            setErr(ax.response?.data?.detail ?? "Saqlash bajarilmadi");
          },
        },
      );
      return;
    }
    // A live didox document (UUID id) confirms through the provodka loop:
    // all lines land on the document AND teach the engine's T0 tier. Sending
    // to 1C is a separate, later step.
    const liveDocId = entry.didox_id || entry.doc_id
      || (typeof entry.id === "string" ? entry.id : "");
    if (liveDocId && typeof liveDocId === "string" && liveDocId.includes("-")) {
      const bad = lines.find(
        (l) => !l.debit_account?.toString().trim() || !l.credit_account?.toString().trim(),
      );
      if (bad) {
        setErr("Har bir qatorda Дт va Кт bo'lishi shart");
        return;
      }
      confirmLiveM.mutate(
        {
          docId: liveDocId,
          entries: lines.map((l, i) => ({
            line: i + 1,
            debit_account: l.debit_account?.toString().trim(),
            credit_account: l.credit_account?.toString().trim(),
            amount: Number(l.amount) || 0,
            description: l.description?.toString().trim() || "",
          })),
        },
        {
          onSuccess: (res) => {
            // Confirmed and learned — now the second half of the button's
            // promise: ship it to 1C through the connector.
            setBanner(res.warning ? `Saqlandi (${res.warning}) — ${sys} ga yuborilmoqda…` : `Saqlandi — ${sys} ga yuborilmoqda…`);
            sendOnecM.mutate(
              { docId: liveDocId, infobase_id: infobaseId },
              {
                onSuccess: (sr) => {
                  if (sr.status === "sent") {
                    setBanner(`${sys} ga yozildi ✓ — shablon o'rganildi`);
                    window.setTimeout(onClose, 1400);
                  } else {
                    setBanner(null); // the stale "yuborilmoqda…" must not outlive its answer
                    setErr(`Tasdiqlandi, lekin ${sys} ga yuborilmadi: ${sr.message || "noma'lum xato"}`);
                  }
                },
                onError: (e: unknown) => {
                  const ax = e as { response?: { data?: { detail?: string } } };
                  setBanner(null);
                  setErr(`Tasdiqlandi, lekin ${sys} ga yuborilmadi: ${ax.response?.data?.detail ?? "server xatosi"}`);
                },
              },
            );
          },
          onError: (e: unknown) => {
            const ax = e as { response?: { data?: { detail?: string } } };
            setErr(ax.response?.data?.detail ?? "Saqlash bajarilmadi");
          },
        },
      );
      return;
    }
    confirmM.mutate(
      {
        id: entry.id,
        payload: {
          dt: first.debit_account?.toString().trim() || null,
          kt: first.credit_account?.toString().trim() || null,
          amount: amt,
          notes: first.description?.toString().trim() || null,
        },
      },
      {
        onSuccess: () => {
          sendM.mutate(
            { id: entry.id },
            {
              onSuccess: (res) => {
                setBanner(res?.note ? `${sys} ga yuborildi (${res.note})` : `${sys} ga yuborildi`);
                window.setTimeout(onClose, 1200);
              },
              onError: () => setErr(`${sys} ga yuborish bajarilmadi`),
            },
          );
        },
        onError: (e: unknown) => {
          const ax = e as { response?: { data?: { detail?: string } } };
          setErr(ax.response?.data?.detail ?? "Tasdiqlash bajarilmadi");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {live
              ? <Sparkles className="size-5 text-primary" />
              : <Cpu className="size-5 text-primary" />}
            {live ? "AI klassifikatsiya" : "AI provodka natijasi"}
          </DialogTitle>
        </DialogHeader>

        {!entry ? null : (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div className="font-medium">
                {entry.onec_number || entry.name || entry.source_id}
              </div>
              <div className="text-xs text-muted-foreground">
                {entry.counterparty_name || "—"}
                {entry.counterparty_inn ? ` · INN ${entry.counterparty_inn}` : ""}
                {entry.amount != null ? ` · ${money(entry.amount)}` : ""}
              </div>
            </div>

            {classifying && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                AI tahlil qilmoqda…
              </div>
            )}

            {result && (
              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 animate-in fade-in-0 duration-300">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 font-medium text-foreground">
                    {SOURCE_LABEL[result.source] ?? result.source}
                  </span>
                  {result.source !== "skip" && (
                    <>
                      <span className="text-muted-foreground">
                        Ishonch: <span className="font-medium text-foreground">{confPct}%</span>
                      </span>
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 font-medium",
                        result.requires_review
                          ? "bg-warning/15 text-warning"
                          : "bg-success/15 text-success",
                      )}>
                        {result.requires_review ? "Ko'rib chiqish kerak" : "Avto-tasdiq"}
                      </span>
                    </>
                  )}
                  {result.operation_type && (
                    <span className="font-mono text-muted-foreground">Op: {result.operation_type}</span>
                  )}
                  {result.model && <span className="text-muted-foreground">{result.model}</span>}
                  {result.duration_ms != null && (
                    <span className="text-muted-foreground">{result.duration_ms}ms</span>
                  )}
                </div>
                {result.reasoning && (
                  <p className="text-xs text-muted-foreground">{result.reasoning}</p>
                )}
                {result.validation_errors && result.validation_errors.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-destructive">
                    {result.validation_errors
                      .map((v, i) => ({ i, text: v.message || VALIDATION_UZ[v.code] || "" }))
                      .filter((x) => x.text)
                      .map((x) => (
                        <li key={x.i}>{x.text}</li>
                      ))}
                  </ul>
                )}
                {result.ambiguities && result.ambiguities.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-warning-foreground">
                    {result.ambiguities.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                )}
              </div>
            )}

            {!classifying && (
              <div className="space-y-2 animate-in fade-in-0 duration-300">
                <div className="grid grid-cols-[1fr_1fr_140px_2fr_36px] items-center gap-2 px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span>Дт</span>
                  <span>Кт</span>
                  <span className="text-right">Summa</span>
                  <span>Tavsif</span>
                  <span />
                </div>
                {lines.map((line) => (
                  <div
                    key={line._id}
                    className="grid grid-cols-[1fr_1fr_140px_2fr_36px] items-center gap-2"
                  >
                    <Input
                      value={String(line.debit_account ?? "")}
                      onChange={(e) => update(line._id, { debit_account: e.target.value })}
                      placeholder="4010"
                      className="h-9 font-mono text-xs"
                    />
                    <Input
                      value={String(line.credit_account ?? "")}
                      onChange={(e) => update(line._id, { credit_account: e.target.value })}
                      placeholder="6010"
                      className="h-9 font-mono text-xs"
                    />
                    <AmountInput
                      value={line.amount}
                      onValue={(v) => update(line._id, { amount: v })}
                    />
                    <Input
                      value={String(line.description ?? "")}
                      onChange={(e) => update(line._id, { description: e.target.value })}
                      placeholder="Ixtiyoriy izoh"
                      className="h-9 text-xs"
                    />
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => removeLine(line._id)}
                      disabled={lines.length <= 1}
                      className="h-9 w-9 p-0"
                      aria-label="Qatorni o'chirish"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <Button size="sm" variant="ghost" onClick={addLine}>
                    <Plus className="size-4" />
                    Qator qo'shish
                  </Button>
                  <div className="flex items-center gap-2 text-sm">
                    <ArrowRightLeft className="size-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Jami:</span>
                    <span className="font-semibold tabular-nums">{money(total)}</span>
                  </div>
                </div>
              </div>
            )}

            {err && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{err}</span>
              </div>
            )}
            {banner && (
              <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                {banner}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <Button variant="ghost" onClick={onClose} disabled={pending}>
                Bekor qilish
              </Button>
              <Button disabled={pending || classifying} onClick={saveAndSend}>
                {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                {isNonDoc ? "Saqlash" : `Saqlash va ${sys} ga yuborish`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Amount field with live space-grouped display (3 125 000). A plain
 * `type="number"` can't render thousand separators, so this is a text input
 * that formats what the accountant sees and hands the parent a clean number.
 *
 * It keeps a local RAW string so a decimal-in-progress ("3 125 000." then "2")
 * survives — deriving the display from the parsed number alone would drop the
 * trailing dot and fight the typist. On blur it snaps to the canonical format.
 */
function AmountInput({
  value,
  onValue,
}: {
  value?: number | null;
  onValue: (v: number | null) => void;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement | null>(null);
  // Digit count that should sit to the LEFT of the caret after reformat — the
  // only stable anchor, since regrouping shifts the spaces around it.
  const caretDigits = useRef<number | null>(null);

  const groupInt = (digits: string) =>
    digits.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  const fmt = (v: number | null | undefined) => {
    if (v == null) return "";
    const [int, dec] = String(v).split(".");
    const g = groupInt(int || "0");
    return dec != null ? `${g}.${dec}` : g;
  };

  const regroup = (s: string) => {
    const cleaned = s.replace(/[^\d.,]/g, "").replace(",", ".");
    const dot = cleaned.indexOf(".");
    if (dot === -1) return groupInt(cleaned);
    return `${groupInt(cleaned.slice(0, dot))}.${cleaned.slice(dot + 1).replace(/\D/g, "").slice(0, 2)}`;
  };

  const parse = (s: string): number | null => {
    const cleaned = s.replace(/\s/g, "").replace(",", ".");
    if (cleaned === "" || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  // After the reformatted value renders, put the caret back where the typist
  // meant it — after the same number of digits, spaces regrouped around it.
  useLayoutEffect(() => {
    const want = caretDigits.current;
    const el = ref.current;
    if (want == null || !el) return;
    caretDigits.current = null;
    let pos = 0;
    let seen = 0;
    for (const ch of el.value) {
      if (seen >= want) break;
      if (/[\d.]/.test(ch)) seen += 1;
      pos += 1;
    }
    el.setSelectionRange(pos, pos);
  });

  return (
    <Input
      ref={ref}
      inputMode="decimal"
      value={raw ?? fmt(value)}
      onChange={(e) => {
        const caret = e.target.selectionStart ?? e.target.value.length;
        // Count the digits/dot the caret sits after — the position is measured
        // in that alphabet, immune to how many spaces get inserted.
        caretDigits.current = e.target.value
          .slice(0, caret)
          .replace(/[^\d.]/g, "").length;
        const shown = regroup(e.target.value);
        setRaw(shown);
        onValue(parse(shown));
      }}
      onBlur={() => setRaw(null)}
      placeholder="0"
      className="h-9 text-right tabular-nums"
    />
  );
}
