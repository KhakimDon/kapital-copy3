import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles, MessageSquareText, History, RotateCcw, Check, X, Play, Trash2,
  Pencil, Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRules, useChangelog, useEmpAction } from "./api";
import { RULE_SECTION_LABELS, CHANGELOG_ACTION_META, type RuleRow } from "./types";

const fmtDt = (s?: string | null) => (s ? new Date(s.replace(" ", "T")).toLocaleString("ru-RU") : "—");

export function RulesView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useRules(companyId);
  const [sel, setSel] = useState<number | null>(null);
  const selected = data.find((r) => r.id === sel) ?? data[0] ?? null;

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (data.length === 0)
    return <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground animate-in fade-in-0 duration-300">{t("modules.employees.empty.noRules")}</div>;

  return (
    <div className="space-y-4 animate-in fade-in-0 duration-300">
      {/* Rule tabs — horizontal, detail gets the full content width. Long
          names truncate, so every tab carries a tooltip with the full name. */}
      <div className="flex items-center gap-1 border-b overflow-x-auto">
        {data.map((r) => (
          <Tooltip key={r.id}>
            <TooltipTrigger asChild>
              <Button variant="ghost" onClick={() => setSel(r.id)}
                className={`h-auto rounded-none gap-1.5 whitespace-nowrap max-w-72 px-3 py-2 text-sm border-b-2 -mb-px transition-colors hover:bg-transparent ${selected?.id === r.id ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Sparkles className={`size-4 shrink-0 ${selected?.id === r.id ? "text-primary" : "text-muted-foreground"}`} />
                <span className="truncate">{r.name}</span>
                {r.enabled ? <Check className="size-3.5 shrink-0 text-success" /> : <X className="size-3.5 shrink-0 text-muted-foreground" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{r.name}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      {/* Detail */}
      {selected && <RuleDetail companyId={companyId} rule={selected} />}
    </div>
  );
}

function RuleDetail({ companyId, rule }: { companyId: number; rule: RuleRow }) {
  const { t } = useTranslation();
  const action = useEmpAction();
  const [runOpen, setRunOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState(rule.source_text ?? "");
  const [logFilter, setLogFilter] = useState<"all" | "run" | "error" | "prompt">("all");
  useEffect(() => { setEditPrompt(false); setPromptDraft(rule.source_text ?? ""); }, [rule.id]); // eslint-disable-line

  const act = (path: string, label: string, opts?: { method?: "post" | "put" | "delete"; body?: unknown; onOk?: () => void }) =>
    action.mutate({ companyId, path, method: opts?.method, body: opts?.body }, {
      onSuccess: () => { alert(`${label}: ${t("modules.employees.alerts.done")}`); opts?.onOk?.(); },
      onError: (e) => alert(String((e as Error)?.message ?? e)),
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-lg font-semibold flex-1">{rule.name}</h2>
        <Button size="sm" onClick={() => setRunOpen(true)}><Play className="size-4 mr-1.5" /> {t("modules.employees.rules.runNow")}</Button>
        {/* enabled toggle */}
        <Button size="sm" variant="outline" onClick={() => act("rules/" + rule.id + "/enabled", rule.enabled ? t("modules.employees.rules.disabled") : t("modules.employees.rules.enabled"), { method: "put", body: { enabled: !rule.enabled } })}>
          {rule.enabled ? <><Check className="size-4 mr-1.5 text-success" /> {t("modules.employees.rules.enabled")}</> : <><X className="size-4 mr-1.5" /> {t("modules.employees.rules.disabled")}</>}
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive"
          onClick={() => { if (confirm(t("modules.employees.confirms.deleteGeneric", { name: rule.name }))) act("rules/" + rule.id, t("modules.employees.alerts.deleted"), { method: "delete" }); }}>
          <Trash2 className="size-4" />
        </Button>
      </div>

      {rule.section && <Badge variant="muted">{RULE_SECTION_LABELS[rule.section] ? t(RULE_SECTION_LABELS[rule.section]) : rule.section}</Badge>}
      {rule.ai_model && <Badge variant="info" className="ml-2 gap-1"><Sparkles className="size-3" />{rule.ai_model}</Badge>}

      {/* Summary */}
      {rule.explanation && (
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium mb-1">{t("modules.employees.rules.summary")}</div>
          <p className="text-sm text-muted-foreground">{rule.explanation}</p>
        </div>
      )}

      {/* Prompt (with edit) */}
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium flex items-center gap-1.5"><MessageSquareText className="size-4" /> {t("modules.employees.rules.prompt")}</div>
          {!editPrompt && <Button size="sm" variant="ghost" onClick={() => setEditPrompt(true)}><Pencil className="size-3.5 mr-1" /> {t("modules.employees.actions.edit")}</Button>}
        </div>
        {editPrompt ? <>
          <Textarea value={promptDraft} onChange={(e) => setPromptDraft(e.target.value)} rows={4}
            className="w-full rounded-md border bg-background px-2.5 py-2 text-sm" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setEditPrompt(false); setPromptDraft(rule.source_text ?? ""); }}>{t("modules.employees.actions.cancel")}</Button>
            <Button size="sm" onClick={() => act("rules/" + rule.id + "/prompt", t("modules.employees.alerts.saved"), { method: "put", body: { source_text: promptDraft }, onOk: () => setEditPrompt(false) })}>{t("modules.employees.actions.save")}</Button>
          </div>
        </> : (
          <pre className="text-sm whitespace-pre-wrap bg-muted/40 rounded-md p-2.5 italic">{rule.source_text || "—"}</pre>
        )}
        {rule.validation_status && rule.validation_status !== "valid" && (
          <Badge variant="warning">{t("modules.employees.rules.validation")}: {rule.validation_status}</Badge>
        )}
      </div>

      {/* Schedule */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium flex items-center gap-1.5"><Clock className="size-4" /> {t("modules.employees.rules.schedule")}</div>
          <Button size="sm" variant="ghost" onClick={() => setSchedOpen(true)}><Pencil className="size-3.5 mr-1" /> {t("modules.employees.actions.edit")}</Button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{t("modules.employees.rules.scheduleOff")}</p>
      </div>

      {/* Activity log + filters */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">{t("modules.employees.rules.activityLog")}</div>
          <div className="inline-flex rounded-md border p-0.5">
            {([["all", t("modules.employees.filter.all")], ["run", t("modules.employees.rules.filterRun")], ["error", t("modules.employees.rules.filterError")], ["prompt", t("modules.employees.rules.prompt")]] as const).map(([k, lbl]) => (
              <Button key={k} variant="ghost" onClick={() => setLogFilter(k)}
                className={`h-auto rounded px-2.5 py-1 text-xs font-normal ${logFilter === k ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{lbl}</Button>
            ))}
          </div>
        </div>
        <div className="text-sm text-muted-foreground text-center py-6">{t("modules.employees.rules.noActivity")}</div>
      </div>

      {/* Run-now modal */}
      <RunNowModal open={runOpen} onClose={() => setRunOpen(false)}
        onRun={(y, m) => act("rules/" + rule.id + "/run-now", t("modules.employees.rules.started"), { body: { year: y, month: m }, onOk: () => setRunOpen(false) })} />

      {/* Schedule modal */}
      <ScheduleModal open={schedOpen} onClose={() => setSchedOpen(false)}
        onSave={(body) => act("rules/" + rule.id + "/schedule", t("modules.employees.alerts.saved"), { method: "put", body, onOk: () => setSchedOpen(false) })} />
    </div>
  );
}

function RunNowModal({ open, onClose, onRun }: { open: boolean; onClose: () => void; onRun: (y: number, m: number) => void }) {
  const { t } = useTranslation();
  const MONTHS = [
    t("modules.employees.months.jan"), t("modules.employees.months.feb"), t("modules.employees.months.mar"),
    t("modules.employees.months.apr"), t("modules.employees.months.may"), t("modules.employees.months.jun"),
    t("modules.employees.months.jul"), t("modules.employees.months.aug"), t("modules.employees.months.sep"),
    t("modules.employees.months.oct"), t("modules.employees.months.nov"), t("modules.employees.months.dec"),
  ];
  const now = new Date();
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth() + 1);
  const yearOpts = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i);
  useEffect(() => { if (open) { setY(now.getFullYear()); setM(now.getMonth() + 1); } }, [open]); // eslint-disable-line
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{t("modules.employees.rules.runNow")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("modules.employees.rules.runNowDesc")}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 block"><span className="text-xs text-muted-foreground">{t("modules.employees.rules.year")}</span>
            <Select value={String(y)} onValueChange={(v) => setY(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{yearOpts.map((yy) => <SelectItem key={yy} value={String(yy)}>{yy}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="space-y-1 block"><span className="text-xs text-muted-foreground">{t("modules.employees.rules.month")}</span>
            <Select value={String(m)} onValueChange={(v) => setM(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((mn, i) => <SelectItem key={i} value={String(i + 1)}>{mn}</SelectItem>)}</SelectContent>
            </Select>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>{t("modules.employees.actions.cancel")}</Button>
          <Button onClick={() => onRun(y, m)}><Play className="size-4 mr-1.5" /> {t("modules.employees.rules.run")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const { t } = useTranslation();
  const [freq, setFreq] = useState<"off" | "daily" | "monthly">("off");
  const [dailyTime, setDailyTime] = useState("18:00");
  const [monthlyDay, setMonthlyDay] = useState("25");
  const [monthlyTime, setMonthlyTime] = useState("09:00");
  useEffect(() => { if (open) { setFreq("off"); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("modules.employees.rules.schedule")}</DialogTitle></DialogHeader>
        <RadioGroup value={freq} onValueChange={(v) => setFreq(v as "off" | "daily" | "monthly")} className="space-y-3 text-sm">
          <label htmlFor="freq-off" className="flex items-center gap-2"><RadioGroupItem value="off" id="freq-off" /> {t("modules.employees.rules.scheduleManualOnly")}</label>
          <label htmlFor="freq-daily" className="flex items-center gap-2">
            <RadioGroupItem value="daily" id="freq-daily" /> {t("modules.employees.rules.everyDayAt")}
            <Input type="time" value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} className="w-28 h-8 ml-1" disabled={freq !== "daily"} />
          </label>
          <label htmlFor="freq-monthly" className="flex items-center gap-2 flex-wrap">
            <RadioGroupItem value="monthly" id="freq-monthly" /> {t("modules.employees.rules.everyMonth")}
            <Input type="number" min={1} max={31} value={monthlyDay} onChange={(e) => setMonthlyDay(e.target.value)} className="w-16 h-8" disabled={freq !== "monthly"} />
            <span>{t("modules.employees.rules.dayAt")}</span>
            <Input type="time" value={monthlyTime} onChange={(e) => setMonthlyTime(e.target.value)} className="w-28 h-8" disabled={freq !== "monthly"} />
          </label>
        </RadioGroup>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>{t("modules.employees.actions.cancel")}</Button>
          <Button onClick={() => onSave({ frequency: freq, daily_time: dailyTime, monthly_day: Number(monthlyDay), monthly_time: monthlyTime })}>{t("modules.employees.actions.save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ChangelogView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useChangelog(companyId, 100);
  const action = useEmpAction();
  const revert = (id: number) => {
    if (!confirm(t("modules.employees.confirms.revertChange"))) return;
    action.mutate({ companyId, path: `changelog/${id}/revert` }, {
      onSuccess: () => alert(t("modules.employees.alerts.reverted")),
      onError: (e) => alert(String((e as Error)?.message ?? e)),
    });
  };
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (data.length === 0)
    return <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground animate-in fade-in-0 duration-300">{t("modules.employees.empty.changelogEmpty")}</div>;
  return (
    <div className="rounded-lg border bg-card divide-y animate-in fade-in-0 duration-300">
      {data.map((c) => {
        const meta = CHANGELOG_ACTION_META[c.action ?? ""] ?? { labelKey: "", variant: "muted" as const };
        return (
          <div key={c.id} className="flex items-start gap-3 px-4 py-2.5">
            <History className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={meta.variant}>{meta.labelKey ? t(meta.labelKey) : (c.action ?? "—")}</Badge>
                <span className="text-xs font-mono text-muted-foreground">{c.entity}</span>
              </div>
              <div className="text-sm mt-0.5">{c.summary}</div>
            </div>
            <div className="text-xs text-muted-foreground text-right shrink-0">
              <div>{c.actor}</div>
              <div>{fmtDt(c.created_at)}</div>
            </div>
            {c.reversible && (
              <Button variant="ghost" size="sm" className="shrink-0" title={t("modules.employees.actions.revert")} onClick={() => revert(c.id)}>
                <RotateCcw className="size-3.5 mr-1" /> {t("modules.employees.actions.revert")}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
