// No-code automations inside Project settings (Jira Automation model):
// QACHON (trigger) → AGAR (conditions) → UNDA (actions). Rules are stored
// server-side and evaluated by the backend on every board mutation; this is
// purely the rule builder UI. Builder expands inline (no nested dialog).
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight, CheckCircle2, Copy, CornerDownRight, Filter, Loader2, Pencil,
  Plus, Trash2, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PRIORITY_META, type Priority } from "./model";
import { useTasksStore } from "./store";
import {
  type AutomationAction,
  type AutomationCond,
  type AutomationCondField,
  type AutomationCondOp,
  type AutomationRule,
  type AutomationTrigger,
  type AutomationTriggerType,
  useAutomations,
  useDeleteAutomation,
  useSaveAutomation,
} from "../automations-api";

// Radix Select can't hold an empty-string item — sentinel for "any / not set".
const ANY = "__any__";

const TRIGGER_TYPES: AutomationTriggerType[] = ["created", "moved", "assigned", "priority", "commented"];
const COND_FIELDS: AutomationCondField[] = ["priority", "column", "type", "assignee", "label", "title"];
const COND_OPS: AutomationCondOp[] = ["is", "not", "empty", "not_empty", "contains"];
const ACTION_TYPES: AutomationAction["type"][] = [
  "move", "assign", "priority", "label_add", "label_remove", "due_shift", "comment", "notify_watchers", "telegram",
];
/** Backend trigger/action contract uses these 4 (no "lowest"). */
const RULE_PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

// Uzbek-Latin fallbacks (defaultValue) — real strings live in the locale files.
const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  created: "Vazifa yaratilganda",
  moved: "Boshqa ustunga ko'chirilganda",
  assigned: "Mas'ul tayinlanganda",
  priority: "Muhimlik o'zgarganda",
  commented: "Izoh yozilganda",
};
const FIELD_LABELS: Record<AutomationCondField, string> = {
  priority: "Muhimlik",
  column: "Ustun",
  type: "Turi",
  assignee: "Mas'ul",
  label: "Yorliq",
  title: "Sarlavha",
};
const OP_LABELS: Record<AutomationCondOp, string> = {
  is: "teng",
  not: "teng emas",
  empty: "bo'sh",
  not_empty: "bo'sh emas",
  contains: "o'z ichiga oladi",
};
const ACTION_LABELS: Record<AutomationAction["type"], string> = {
  move: "Ustunga ko'chirish",
  assign: "Mas'ul tayinlash",
  priority: "Muhimlikni o'zgartirish",
  label_add: "Yorliq qo'shish",
  label_remove: "Yorliqni olib tashlash",
  due_shift: "Muddatni surish",
  comment: "Izoh yozish",
  notify_watchers: "Kuzatuvchilarga xabar",
  telegram: "Telegram xabari",
};

type Draft = {
  id: string | null;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCond[];
  actions: AutomationAction[];
  position: number;
};

const emptyDraft = (position: number): Draft => ({
  id: null,
  name: "",
  enabled: true,
  trigger: { type: "created" },
  conditions: [],
  actions: [],
  position,
});

export function AutomationSection({ companyId, projectId }: { companyId: number; projectId: string }) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.tasks.automation.${k}`, { defaultValue: d });

  const allColumns = useTasksStore((s) => s.columns);
  const members = useTasksStore((s) => s.members);
  const columns = useMemo(
    () => allColumns.filter((c) => c.projectId === projectId).sort((a, b) => a.order - b.order),
    [allColumns, projectId],
  );
  const doneColumn = useMemo(() => columns.find((c) => c.category === "done"), [columns]);

  const rulesQ = useAutomations(companyId, projectId);
  const save = useSaveAutomation(companyId, projectId);
  const del = useDeleteAutomation(companyId, projectId);
  const rules = useMemo(
    () => [...(rulesQ.data ?? [])].sort((a, b) => a.position - b.position),
    [rulesQ.data],
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const colName = (id?: string) => columns.find((c) => c.id === id)?.name ?? id ?? "";
  const memberName = (id?: string) => members.find((m) => m.id === id)?.name ?? id ?? "";
  const prioLabel = (p?: string) => {
    const meta = PRIORITY_META[p as Priority];
    return meta ? t(meta.labelKey, { defaultValue: meta.label }) : (p ?? "");
  };
  const triggerLabel = (type: AutomationTriggerType) => tr(`trigger.${type}`, TRIGGER_LABELS[type]);
  const fieldLabel = (f: AutomationCondField) => tr(`cond.${f}`, FIELD_LABELS[f]);
  const opLabel = (o: AutomationCondOp) => tr(`op.${o}`, OP_LABELS[o]);
  const actionTypeLabel = (type: AutomationAction["type"]) => tr(`action.${type}`, ACTION_LABELS[type]);

  // Human-readable "when …" clause for a trigger.
  const whenText = (trig: AutomationTrigger) => {
    const head = triggerLabel(trig.type);
    if (trig.type === "moved") {
      const from = trig.from ? colName(trig.from) : tr("anyColumn", "har qanday ustun");
      const to = trig.to ? colName(trig.to) : tr("anyColumn", "har qanday ustun");
      return `${head} (${from} ${"→"} ${to})`;
    }
    if (trig.type === "created" && trig.to) return `${head} (${colName(trig.to)})`;
    if (trig.type === "priority" && trig.to) return `${head} (${prioLabel(trig.to)})`;
    return head;
  };

  // Human-readable "if …" clause for a single condition.
  const condText = (c: AutomationCond) => {
    if (c.op === "empty" || c.op === "not_empty") return `${fieldLabel(c.field)} ${opLabel(c.op)}`;
    const val = c.field === "column" ? colName(c.value)
      : c.field === "priority" ? prioLabel(c.value)
        : c.field === "assignee" ? memberName(c.value)
          : c.value;
    return `${fieldLabel(c.field)} ${opLabel(c.op)} ${val || "…"}`;
  };

  // Human-readable "then …" clause for a single action.
  const actText = (a: AutomationAction) => {
    switch (a.type) {
      case "move": return `${actionTypeLabel("move")}: ${colName(a.columnId) || "…"}`;
      case "assign":
        return a.who === "unassign"
          ? tr("action.assignUnassign", "Mas'ulni olib tashlash")
          : a.who === "reporter"
            ? tr("action.assignReporter", "Muallifni mas'ul qilish")
            : `${actionTypeLabel("assign")}: ${memberName(a.username) || "…"}`;
      case "priority": return `${actionTypeLabel("priority")}: ${prioLabel(a.value) || "…"}`;
      case "label_add": return `${actionTypeLabel("label_add")}: ${a.value || "…"}`;
      case "label_remove": return `${actionTypeLabel("label_remove")}: ${a.value || "…"}`;
      case "due_shift": return `${actionTypeLabel("due_shift")}: +${a.days} ${tr("days", "kun")}`;
      default: return actionTypeLabel(a.type);
    }
  };

  // Full plain-language sentence: "When … · if … · then …".
  const summarize = (r: Pick<AutomationRule, "trigger" | "conditions" | "actions">) => {
    const parts = [`${tr("sentence.when", "Qachon")} ${whenText(r.trigger)}`];
    if (r.conditions.length) {
      parts.push(`${tr("sentence.if", "agar")} ${r.conditions.map(condText).join(` ${tr("sentence.and", "va")} `)}`);
    }
    parts.push(`${tr("sentence.then", "unda")} ${r.actions.length ? r.actions.map(actText).join(", ") : "…"}`);
    return parts.join(" · ");
  };

  const validDraft =
    !!draft &&
    draft.name.trim().length > 0 &&
    draft.actions.length > 0 &&
    draft.actions.every((a) =>
      a.type === "move" ? !!a.columnId
        : a.type === "assign" ? (a.who !== "user" || !!a.username)
          : a.type === "priority" ? !!a.value
            : true,
    );

  const openNew = () => { setErr(null); setConfirmDelId(null); setDraft(emptyDraft(rules.length)); };
  const openEdit = (r: AutomationRule) => {
    setErr(null);
    setConfirmDelId(null);
    setDraft({
      id: r.id, name: r.name, enabled: r.enabled,
      trigger: { ...r.trigger },
      conditions: r.conditions.map((c) => ({ ...c })),
      actions: r.actions.map((a) => ({ ...a })),
      position: r.position,
    });
  };
  // Duplicate = open the editor pre-filled as a NEW rule (no backend concept added).
  const openDuplicate = (r: AutomationRule) => {
    setErr(null);
    setConfirmDelId(null);
    setDraft({
      id: null,
      name: `${r.name} ${tr("copySuffix", "(nusxa)")}`,
      enabled: r.enabled,
      trigger: { ...r.trigger },
      conditions: r.conditions.map((c) => ({ ...c })),
      actions: r.actions.map((a) => ({ ...a })),
      position: rules.length,
    });
  };

  const submit = async () => {
    if (!draft || !validDraft) return;
    setErr(null);
    try {
      await save.mutateAsync({
        id: draft.id ?? `rule${Date.now().toString(36)}`,
        name: draft.name.trim(),
        enabled: draft.enabled,
        trigger: draft.trigger,
        conditions: draft.conditions,
        actions: draft.actions,
        position: draft.position,
      });
      setDraft(null);
    } catch (e) {
      setErr(String((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? e));
    }
  };

  const toggleRule = (r: AutomationRule, enabled: boolean) =>
    save.mutate({ ...r, enabled });

  // Prebuilt starter rules for the empty state.
  const templates: { key: string; name: string; desc: string; make: () => Draft }[] = [
    {
      key: "autoAssign",
      name: tr("template.autoAssign.name", "Ko'chirishda avto-tayinlash"),
      desc: tr("template.autoAssign.desc", "Vazifa ko'chirilganda uni muallifga mas'ul qilib qo'yadi."),
      make: () => ({
        ...emptyDraft(rules.length),
        name: tr("template.autoAssign.name", "Ko'chirishda avto-tayinlash"),
        trigger: { type: "moved" },
        actions: [{ type: "assign", who: "reporter" }],
      }),
    },
    {
      key: "notifyDone",
      name: tr("template.notifyDone.name", "Tugatilganda xabar berish"),
      desc: tr("template.notifyDone.desc", "Vazifa tugatilganda kuzatuvchilarga bildirishnoma yuboradi."),
      make: () => ({
        ...emptyDraft(rules.length),
        name: tr("template.notifyDone.name", "Tugatilganda xabar berish"),
        trigger: { type: "moved", to: doneColumn?.id },
        actions: [{ type: "notify_watchers" }],
      }),
    },
    {
      key: "dueOnCreate",
      name: tr("template.dueOnCreate.name", "Yaratishda muddat qo'yish"),
      desc: tr("template.dueOnCreate.desc", "Yangi vazifaga avtomatik 3 kunlik muddat belgilaydi."),
      make: () => ({
        ...emptyDraft(rules.length),
        name: tr("template.dueOnCreate.name", "Yaratishda muddat qo'yish"),
        trigger: { type: "created" },
        actions: [{ type: "due_shift", days: 3 }],
      }),
    },
  ];

  const columnSelect = (value: string | undefined, onChange: (v: string | undefined) => void, anyLabel?: string) => (
    <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? undefined : v)}>
      <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{anyLabel ?? tr("anyColumn", "Har qanday ustun")}</SelectItem>
        {columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const prioritySelect = (value: string | undefined, onChange: (v: string | undefined) => void, withAny: boolean) => (
    <Select value={value ?? (withAny ? ANY : "")} onValueChange={(v) => onChange(v === ANY ? undefined : v)}>
      <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue placeholder={tr("choosePh", "Tanlang…")} /></SelectTrigger>
      <SelectContent>
        {withAny && <SelectItem value={ANY}>{tr("any", "Har qanday")}</SelectItem>}
        {RULE_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{prioLabel(p)}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const memberSelect = (value: string | undefined, onChange: (v: string) => void) => (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue placeholder={tr("choosePh", "Tanlang…")} /></SelectTrigger>
      <SelectContent>
        {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const setCond = (i: number, patch: Partial<AutomationCond>) =>
    setDraft((d) => d && ({
      ...d,
      conditions: d.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    }));

  const setAction = (i: number, next: AutomationAction) =>
    setDraft((d) => d && ({ ...d, actions: d.actions.map((a, j) => (j === i ? next : a)) }));

  // A fresh action of the given type with sensible params.
  const blankAction = (type: AutomationAction["type"]): AutomationAction => {
    switch (type) {
      case "move": return { type, columnId: columns[0]?.id ?? "" };
      case "assign": return { type, who: "user", username: members[0]?.id };
      case "priority": return { type, value: "medium" };
      case "label_add": return { type, value: "" };
      case "label_remove": return { type, value: "" };
      case "due_shift": return { type, days: 1 };
      case "comment": return { type, template: "" };
      case "telegram": return { type, template: "" };
      case "notify_watchers": return { type };
    }
  };

  const condValueControl = (c: AutomationCond, i: number) => {
    if (c.op === "empty" || c.op === "not_empty") return null;
    if (c.field === "column") return columnSelect(c.value || undefined, (v) => setCond(i, { value: v ?? "" }), tr("choosePh", "Tanlang…"));
    if (c.field === "priority") return prioritySelect(c.value || undefined, (v) => setCond(i, { value: v ?? "" }), false);
    if (c.field === "assignee") return memberSelect(c.value || undefined, (v) => setCond(i, { value: v }));
    return (
      <Input
        value={c.value}
        onChange={(e) => setCond(i, { value: e.target.value })}
        className="h-9 flex-1 text-xs"
        placeholder={tr("valuePh", "Qiymat")}
      />
    );
  };

  const actionParams = (a: AutomationAction, i: number) => {
    switch (a.type) {
      case "move":
        return (
          <Select value={a.columnId || ""} onValueChange={(v) => setAction(i, { type: "move", columnId: v })}>
            <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue placeholder={tr("choosePh", "Tanlang…")} /></SelectTrigger>
            <SelectContent>
              {columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "assign":
        return (
          <>
            <Select
              value={a.who}
              onValueChange={(v) => setAction(i, {
                type: "assign",
                who: v as "user" | "reporter" | "unassign",
                username: v === "user" ? (a.username ?? members[0]?.id) : undefined,
              })}
            >
              <SelectTrigger className="h-9 w-40 shrink-0 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">{tr("who.user", "Aniq foydalanuvchi")}</SelectItem>
                <SelectItem value="reporter">{tr("who.reporter", "Vazifa muallifi")}</SelectItem>
                <SelectItem value="unassign">{tr("who.unassign", "Mas'ulni olib tashlash")}</SelectItem>
              </SelectContent>
            </Select>
            {a.who === "user" && memberSelect(a.username, (v) => setAction(i, { type: "assign", who: "user", username: v }))}
          </>
        );
      case "priority":
        return prioritySelect(a.value, (v) => setAction(i, { type: "priority", value: v ?? "medium" }), false);
      case "label_add":
      case "label_remove":
        return (
          <Input
            value={a.value}
            onChange={(e) => setAction(i, { type: a.type, value: e.target.value })}
            className="h-9 flex-1 text-xs"
            placeholder={tr("labelPh", "Yorliq nomi")}
          />
        );
      case "due_shift":
        return (
          <div className="flex flex-1 items-center gap-1.5">
            <Input
              type="number"
              value={String(a.days)}
              onChange={(e) => setAction(i, { type: "due_shift", days: Number(e.target.value) || 0 })}
              className="h-9 w-24 text-xs"
            />
            <span className="text-xs text-muted-foreground">{tr("days", "kun")}</span>
          </div>
        );
      case "comment":
      case "telegram":
        return (
          <Input
            value={a.template}
            onChange={(e) => setAction(i, { type: a.type, template: e.target.value })}
            className="h-9 flex-1 text-xs"
            placeholder={tr("templateHint", "Matn — masalan: {{title}} tayyor")}
          />
        );
      case "notify_watchers":
        return <span className="flex-1 text-xs text-muted-foreground">{tr("noParams", "Qo'shimcha sozlama talab qilmaydi.")}</span>;
    }
  };

  // ── Section header block used inside the editor (When / If / Then) ──
  const stepBlock = (
    step: number,
    Icon: typeof Zap,
    tone: string,
    title: string,
    help: string,
    optional: boolean,
    children: ReactNode,
  ) => (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2.5 flex items-start gap-2.5">
        <div className={`flex size-7 shrink-0 items-center justify-center rounded-md ${tone}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {tr("stepLabel", "Qadam")} {step}
            </span>
            <span className="text-sm font-medium">{title}</span>
            {optional && (
              <Badge variant="muted" className="px-1.5 py-0 text-[10px] font-normal">
                {tr("optional", "ixtiyoriy")}
              </Badge>
            )}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{help}</p>
        </div>
      </div>
      <div className="space-y-2 pl-0 sm:pl-[38px]">{children}</div>
    </div>
  );

  const editing = !!draft;

  return (
    <div className="space-y-3">
      {/* header */}
      <div className="flex items-start gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
          <Zap className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{tr("title", "Avtomatlashtirish")}</div>
          <p className="text-xs leading-snug text-muted-foreground">
            {tr("intro", "Qoidalar vazifalar bilan ishlashni avtomatlashtiradi: hodisa yuz berganda (masalan, vazifa ustunga ko'chirilganda) tizim o'zi kerakli amalni bajaradi.")}
          </p>
        </div>
        {!editing && rules.length > 0 && (
          <Button size="sm" className="h-8 shrink-0 text-xs" onClick={openNew}>
            <Plus className="size-3.5" /> {tr("newRule", "Yangi qoida")}
          </Button>
        )}
      </div>

      {/* loading */}
      {rulesQ.isLoading && (
        <div className="flex items-center gap-2 rounded-lg border p-4 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> {tr("loading", "Yuklanmoqda…")}
        </div>
      )}

      {/* empty state with templates */}
      {!rulesQ.isLoading && rules.length === 0 && !editing && (
        <div className="rounded-lg border border-dashed p-5 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
            <Zap className="size-5" />
          </div>
          <div className="mt-3 text-sm font-medium">{tr("empty.title", "Hali avtomatlashtirish qoidasi yo'q")}</div>
          <p className="mx-auto mt-1 max-w-md text-xs leading-snug text-muted-foreground">
            {tr("empty.body", "Birinchi qoidangizni yarating yoki quyidagi tayyor namunalardan birini tanlang — keyin uni o'zingizga moslashtirasiz.")}
          </p>
          <Button size="sm" className="mt-3 h-8 text-xs" onClick={openNew}>
            <Plus className="size-3.5" /> {tr("newRule", "Yangi qoida")}
          </Button>

          <div className="mt-5 text-left">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {tr("templates.label", "Tayyor namunalar")}
            </div>
            <div className="space-y-1.5">
              {templates.map((tpl) => (
                <button
                  key={tpl.key}
                  type="button"
                  onClick={() => { setErr(null); setDraft(tpl.make()); }}
                  className="group flex w-full items-center gap-3 rounded-md border bg-background p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-primary">
                    <Zap className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium">{tpl.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{tpl.desc}</div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* rules list */}
      {!editing && rules.length > 0 && (
        <div className="space-y-1.5">
          {rules.map((r) => (
            <div
              key={r.id}
              className="flex items-start gap-3 rounded-lg border bg-background px-3 py-2.5"
            >
              <Switch checked={r.enabled} onCheckedChange={(v) => toggleRule(r, v)} className="mt-0.5" />
              <button
                type="button"
                onClick={() => openEdit(r)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  {!r.enabled && (
                    <Badge variant="muted" className="px-1.5 py-0 text-[10px] font-normal">
                      {tr("paused", "to'xtatilgan")}
                    </Badge>
                  )}
                </div>
                <div className="truncate text-[11px] leading-snug text-muted-foreground">{summarize(r)}</div>
              </button>
              {confirmDelId === r.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm" variant="destructive" className="h-7 px-2 text-[11px]"
                    disabled={del.isPending}
                    onClick={() => del.mutate(r.id, { onSettled: () => setConfirmDelId(null) })}
                  >
                    {del.isPending ? <Loader2 className="size-3 animate-spin" /> : tr("confirmDelete", "O'chirilsinmi?")}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setConfirmDelId(null)}>
                    {tr("cancel", "Bekor qilish")}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={tr("edit", "Tahrirlash")}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openDuplicate(r)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={tr("duplicate", "Nusxa olish")}
                  >
                    <Copy className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelId(r.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title={tr("delete", "O'chirish")}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* guided editor */}
      {draft && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {draft.id ? tr("editor.editTitle", "Qoidani tahrirlash") : tr("editor.newTitle", "Yangi qoida")}
            </span>
          </div>

          {/* name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{tr("nameLabel", "Qoida nomi")}</label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })}
              className="h-9 text-sm"
              placeholder={tr("namePh", "Masalan: Done'ga ko'chirilganda xabar ber")}
            />
          </div>

          {/* live plain-language summary */}
          <div className="rounded-lg border bg-background p-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {tr("summaryLabel", "Qoida nima qiladi")}
            </div>
            <div className="text-xs leading-snug">{summarize(draft)}</div>
          </div>

          {/* STEP 1 — trigger */}
          {stepBlock(
            1, Zap, "bg-amber-500/15 text-amber-500",
            tr("when", "Qachon"),
            tr("whenHelp", "Qoidani ishga tushiradigan hodisani tanlang."),
            false,
            <>
              <Select
                value={draft.trigger.type}
                onValueChange={(v) =>
                  setDraft((d) => d && { ...d, trigger: { type: v as AutomationTriggerType } })}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((tt) => (
                    <SelectItem key={tt} value={tt}>{triggerLabel(tt)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {draft.trigger.type === "moved" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-full text-[11px] text-muted-foreground sm:w-auto">{tr("fromCol", "Qayerdan")}</span>
                  {columnSelect(draft.trigger.from, (v) =>
                    setDraft((d) => d && { ...d, trigger: { ...d.trigger, from: v } }))}
                  <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
                  <span className="w-full text-[11px] text-muted-foreground sm:w-auto">{tr("toCol", "Qayerga")}</span>
                  {columnSelect(draft.trigger.to, (v) =>
                    setDraft((d) => d && { ...d, trigger: { ...d.trigger, to: v } }))}
                </div>
              )}
              {draft.trigger.type === "created" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{tr("inColumn", "Qaysi ustunda (ixtiyoriy)")}</span>
                  {columnSelect(draft.trigger.to, (v) =>
                    setDraft((d) => d && { ...d, trigger: { ...d.trigger, to: v } }))}
                </div>
              )}
              {draft.trigger.type === "priority" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{tr("toPriority", "Yangi muhimlik (ixtiyoriy)")}</span>
                  {prioritySelect(draft.trigger.to, (v) =>
                    setDraft((d) => d && { ...d, trigger: { ...d.trigger, to: v } }), true)}
                </div>
              )}
            </>,
          )}

          {/* STEP 2 — conditions */}
          {stepBlock(
            2, Filter, "bg-sky-500/15 text-sky-500",
            tr("if", "Agar"),
            tr("ifHelp", "Amallar faqat shu shartlar bajarilganda ishlaydi. Bo'sh qoldirsangiz — har doim ishlaydi."),
            true,
            <>
              {draft.conditions.length === 0 && (
                <div className="rounded-md border border-dashed px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  {tr("noConditions", "Shart yo'q — qoida har doim ishlaydi.")}
                </div>
              )}
              {draft.conditions.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  <Select
                    value={c.field}
                    onValueChange={(v) => setCond(i, { field: v as AutomationCondField, value: "" })}
                  >
                    <SelectTrigger className="h-9 w-32 shrink-0 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COND_FIELDS.map((f) => (
                        <SelectItem key={f} value={f}>{fieldLabel(f)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={c.op} onValueChange={(v) => setCond(i, { op: v as AutomationCondOp })}>
                    <SelectTrigger className="h-9 w-36 shrink-0 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COND_OPS.map((o) => (
                        <SelectItem key={o} value={o}>{opLabel(o)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {condValueControl(c, i)}
                  <button
                    type="button"
                    onClick={() => setDraft((d) => d && { ...d, conditions: d.conditions.filter((_, j) => j !== i) })}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title={tr("remove", "Olib tashlash")}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost" size="sm"
                className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
                onClick={() => setDraft((d) => d && ({
                  ...d,
                  conditions: [...d.conditions, { field: "priority", op: "is", value: "medium" }],
                }))}
              >
                <Plus className="size-3.5" /> {tr("addCond", "Shart qo'shish")}
              </Button>
            </>,
          )}

          {/* STEP 3 — actions */}
          {stepBlock(
            3, CornerDownRight, "bg-emerald-500/15 text-emerald-500",
            tr("then", "Unda"),
            tr("thenHelp", "Hodisa yuz berganda bajariladigan amallarni tanlang. Kamida bitta amal kerak."),
            false,
            <>
              {draft.actions.length === 0 && (
                <div className="rounded-md border border-dashed px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  {tr("noActions", "Hali amal qo'shilmagan. Kamida bitta amal qo'shing.")}
                </div>
              )}
              {draft.actions.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  <Select
                    value={a.type}
                    onValueChange={(v) => setAction(i, blankAction(v as AutomationAction["type"]))}
                  >
                    <SelectTrigger className="h-9 w-48 shrink-0 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map((at) => (
                        <SelectItem key={at} value={at}>{actionTypeLabel(at)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {actionParams(a, i)}
                  <button
                    type="button"
                    onClick={() => setDraft((d) => d && { ...d, actions: d.actions.filter((_, j) => j !== i) })}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title={tr("remove", "Olib tashlash")}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost" size="sm"
                className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
                onClick={() => setDraft((d) => d && { ...d, actions: [...d.actions, blankAction("move")] })}
              >
                <Plus className="size-3.5" /> {tr("addAction", "Amal qo'shish")}
              </Button>
              {(draft.actions.some((a) => a.type === "comment" || a.type === "telegram")) && (
                <div className="rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
                  {tr("templateNote", "Matnda o'rniga qo'yiladigan belgilar: {{title}} — sarlavha, {{actor}} — bajaruvchi, {{priority}} — muhimlik.")}
                </div>
              )}
            </>,
          )}

          {err && <div className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{err}</div>}

          {/* footer */}
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={draft.enabled}
                onCheckedChange={(v) => setDraft((d) => d && { ...d, enabled: v })}
              />
              {tr("enabled", "Qoida yoqilgan")}
            </label>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setDraft(null)}>
                {tr("cancel", "Bekor qilish")}
              </Button>
              <Button size="sm" className="h-9 gap-1.5 text-xs" disabled={!validDraft || save.isPending} onClick={submit}>
                {save.isPending
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <CheckCircle2 className="size-3.5" />}
                {draft.id ? tr("save", "Saqlash") : tr("create", "Qoidani yaratish")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
