// Autotasks inside Project settings: recurring templates that mint cards on a
// schedule. Two flavours share this screen —
//   • Regular — a fixed calendar rule (daily / weekly / monthly / yearly).
//   • AI      — reads a source, analyses context, then decides what to create.
//               Not built yet; the tab explains what is coming (AI Studio).
//
// Templates are COMPANY-scoped and each names its target project, so this one
// list covers every board. The whole section is gated on the `autotask`
// permission by its caller.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot, CalendarClock, Check, Clock, Loader2, Pencil, Play, Plus, Sparkles, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/shared/lib/utils";
import { useTasksStore } from "./store";
import { PRIORITIES } from "./model";
import {
  type Autotask, type AutotaskKind, type ScheduleType,
  useAutotaskRuns, useAutotasks, useDeleteAutotask, useRunAutotask, useSaveAutotask,
} from "../autotasks-api";

const uid = () => `at${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** ISO weekday order, Monday first — matches the engine's 1…7. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

function blank(projectId: string): Autotask {
  return {
    id: uid(),
    projectId,
    columnId: null,
    name: "",
    kind: "regular",
    enabled: true,
    schedule: { type: "weekly", time: "09:00", weekdays: [1, 2, 3, 4, 5] },
    card: { title: "", description: "", priority: "medium", labels: [], dueInDays: null },
    utcOffsetMin: 300,
  };
}

export function AutotasksSection({
  companyId,
  projectId,
}: {
  companyId: number;
  /** The project whose settings we came from — the default target for a new template. */
  projectId: string;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.tasks.autotasks.${k}`, { defaultValue: d });
  const [tab, setTab] = useState<AutotaskKind>("regular");

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{tr("title", "Avtotasklar")}</h3>
        <p className="text-sm text-muted-foreground">
          {tr("hint", "Jadval bo'yicha o'zi vazifa yaratadigan shablonlar. Yaratilgan har bir vazifa «autotask» tegi bilan belgilanadi.")}
        </p>
      </div>

      {/* Regular ⇄ AI */}
      <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
        {([
          { k: "regular" as const, Icon: CalendarClock, label: tr("regular", "Oddiy") },
          { k: "ai" as const, Icon: Sparkles, label: tr("ai", "AI") },
        ]).map(({ k, Icon, label }) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
            {k === "ai" && (
              <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px]">
                {tr("soon", "Tez orada")}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {tab === "regular"
        ? <RegularTab companyId={companyId} projectId={projectId} />
        : <AiTab />}
    </div>
  );
}

// ── Regular ───────────────────────────────────────────────────────────────────
function RegularTab({ companyId, projectId }: { companyId: number; projectId: string }) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.tasks.autotasks.${k}`, { defaultValue: d });
  const list = useAutotasks(companyId);
  const del = useDeleteAutotask(companyId);
  const run = useRunAutotask(companyId);
  const [editing, setEditing] = useState<Autotask | null>(null);

  const projects = useTasksStore((s) => s.projects);
  const items = (list.data ?? []).filter((a) => a.kind === "regular");

  if (editing) {
    return <Editor companyId={companyId} value={editing} onClose={() => setEditing(null)} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing(blank(projectId))}>
          <Plus className="mr-1.5 size-4" /> {tr("new", "Yangi shablon")}
        </Button>
      </div>

      {list.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {tr("loading", "Yuklanmoqda…")}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <CalendarClock className="mx-auto mb-2 size-7 text-muted-foreground opacity-60" />
          <div className="text-sm font-medium">{tr("emptyTitle", "Hali shablon yo'q")}</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {tr("emptyHint", "Masalan: har dushanba soat 09:00 da «Haftalik hisobot» vazifasini yaratish.")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <Row
              key={a.id}
              a={a}
              projectName={projects.find((p) => p.id === a.projectId)?.name ?? a.projectId}
              onEdit={() => setEditing(a)}
              onDelete={() => { if (window.confirm(tr("confirmDelete", "Shablon o'chirilsinmi?"))) del.mutate(a.id); }}
              onRun={() => run.mutate(a.id)}
              running={run.isPending && run.variables === a.id}
              companyId={companyId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  a, projectName, onEdit, onDelete, onRun, running, companyId,
}: {
  a: Autotask;
  projectName: string;
  onEdit: () => void;
  onDelete: () => void;
  onRun: () => void;
  running: boolean;
  companyId: number;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.tasks.autotasks.${k}`, { defaultValue: d });
  const save = useSaveAutotask(companyId);
  const [showRuns, setShowRuns] = useState(false);
  const runs = useAutotaskRuns(companyId, showRuns ? a.id : null);

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-3 p-3">
        <Switch
          checked={a.enabled}
          onCheckedChange={(v) => save.mutate({ ...a, enabled: v })}
          aria-label={tr("enabled", "Yoqilgan")}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{a.name || a.card.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {describe(a, tr)} · {projectName}
          </div>
        </div>
        {a.nextRunAt && a.enabled && (
          <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-muted-foreground sm:inline-flex">
            <Clock className="size-3" />
            {new Date(a.nextRunAt).toLocaleString()}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={() => setShowRuns((s) => !s)}>
          {tr("runs", "Tarix")}
        </Button>
        <Button variant="ghost" size="icon" onClick={onRun} disabled={running} title={tr("runNow", "Hozir ishga tushirish")}>
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onEdit} title={tr("edit", "Tahrirlash")}>
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} title={tr("delete", "O'chirish")}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>

      {showRuns && (
        <div className="border-t px-3 py-2">
          {runs.isLoading ? (
            <div className="py-3 text-center text-xs text-muted-foreground">…</div>
          ) : (runs.data ?? []).length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground">
              {tr("noRuns", "Hali ishga tushmagan")}
            </div>
          ) : (
            <ul className="space-y-1">
              {(runs.data ?? []).map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  {r.status === "created"
                    ? <Check className="size-3 text-emerald-600" />
                    : <X className="size-3 text-destructive" />}
                  <span className="text-muted-foreground">
                    {r.slot ? new Date(r.slot).toLocaleString() : "—"}
                  </span>
                  <span className="truncate">
                    {r.error ? r.error : r.cardTitle ?? r.cardId ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** "Har dushanba, chorshanba 09:00" — a one-line summary of the rule. */
function describe(a: Autotask, tr: (k: string, d: string) => string): string {
  const s = a.schedule;
  const at = s.time || "09:00";
  switch (s.type) {
    case "daily":
      return `${tr("everyDay", "Har kuni")} ${at}`;
    case "weekly": {
      const days = (s.weekdays ?? []).map((d) => tr(`wd.${d}`, String(d))).join(", ");
      return days ? `${days} · ${at}` : `${tr("everyDay", "Har kuni")} ${at}`;
    }
    case "monthly":
      return `${tr("everyMonthDay", "Har oyning")} ${s.day ?? 1}-${tr("dayOf", "kuni")} ${at}`;
    case "yearly":
      return `${s.day ?? 1}.${String(s.month ?? 1).padStart(2, "0")} · ${at}`;
    default:
      return at;
  }
}

// ── editor ────────────────────────────────────────────────────────────────────
function Editor({
  companyId, value, onClose,
}: {
  companyId: number;
  value: Autotask;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.tasks.autotasks.${k}`, { defaultValue: d });
  const save = useSaveAutotask(companyId);
  const [a, setA] = useState<Autotask>(value);
  const [err, setErr] = useState<string | null>(null);

  const projects = useTasksStore((s) => s.projects);
  const allColumns = useTasksStore((s) => s.columns);
  // Columns are only in the store for boards that have been opened; for any
  // other target we let the server fall back to the project's first column.
  const columns = useMemo(
    () => allColumns.filter((c) => c.projectId === a.projectId).sort((x, y) => x.order - y.order),
    [allColumns, a.projectId],
  );

  const set = (patch: Partial<Autotask>) => setA((p) => ({ ...p, ...patch }));
  const setSched = (patch: Partial<Autotask["schedule"]>) =>
    setA((p) => ({ ...p, schedule: { ...p.schedule, ...patch } }));
  const setCard = (patch: Partial<Autotask["card"]>) =>
    setA((p) => ({ ...p, card: { ...p.card, ...patch } }));

  const toggleDay = (d: number) => {
    const cur = a.schedule.weekdays ?? [];
    setSched({ weekdays: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() });
  };

  const submit = async () => {
    setErr(null);
    const title = (a.card.title ?? "").trim();
    if (!title && !a.name.trim()) {
      setErr(tr("needTitle", "Nom yoki vazifa sarlavhasi kerak"));
      return;
    }
    try {
      await save.mutateAsync(a);
      onClose();
    } catch (e) {
      setErr(String((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? e));
    }
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <Field label={tr("name", "Shablon nomi")}>
        <Input value={a.name} onChange={(e) => set({ name: e.target.value })}
               placeholder={tr("namePh", "Masalan: Haftalik hisobot")} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("project", "Loyiha")}>
          <Select value={a.projectId} onValueChange={(v) => set({ projectId: v, columnId: null })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={tr("column", "Ustun")}>
          {columns.length ? (
            <Select value={a.columnId ?? "__first"} onValueChange={(v) => set({ columnId: v === "__first" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__first">{tr("firstColumn", "Birinchi ustun")}</SelectItem>
                {columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <p className="pt-2 text-xs text-muted-foreground">
              {tr("firstColumnHint", "Vazifa loyihaning birinchi ustunida yaratiladi.")}
            </p>
          )}
        </Field>
      </div>

      {/* schedule */}
      <div className="rounded-lg border p-3">
        <div className="mb-3 text-sm font-medium">{tr("schedule", "Jadval")}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("repeat", "Takrorlanish")}>
            <Select value={a.schedule.type} onValueChange={(v) => setSched({ type: v as ScheduleType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{tr("daily", "Har kuni")}</SelectItem>
                <SelectItem value="weekly">{tr("weekly", "Haftalik")}</SelectItem>
                <SelectItem value="monthly">{tr("monthly", "Oylik")}</SelectItem>
                <SelectItem value="yearly">{tr("yearly", "Yillik")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={tr("time", "Vaqt")}>
            <Input type="time" value={a.schedule.time}
                   onChange={(e) => setSched({ time: e.target.value })} />
          </Field>
        </div>

        {a.schedule.type === "weekly" && (
          <div className="mt-3">
            <div className="mb-1.5 text-xs text-muted-foreground">{tr("weekdays", "Hafta kunlari")}</div>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => {
                const on = (a.schedule.weekdays ?? []).includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={cn(
                      "size-9 rounded-lg text-xs font-medium transition-colors",
                      on ? "bg-primary text-primary-foreground shadow-sm"
                         : "bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/10",
                    )}
                  >
                    {tr(`wdShort.${d}`, String(d))}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {(a.schedule.type === "monthly" || a.schedule.type === "yearly") && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {a.schedule.type === "yearly" && (
              <Field label={tr("month", "Oy")}>
                <Input type="number" min={1} max={12} value={a.schedule.month ?? 1}
                       onChange={(e) => setSched({ month: Number(e.target.value) })} />
              </Field>
            )}
            <Field label={tr("dayOfMonth", "Oyning kuni")}>
              <Input type="number" min={1} max={31} value={a.schedule.day ?? 1}
                     onChange={(e) => setSched({ day: Number(e.target.value) })} />
              <p className="mt-1 text-xs text-muted-foreground">
                {tr("clampHint", "31 qo'yilsa, qisqa oylarda oxirgi kunga tushadi.")}
              </p>
            </Field>
          </div>
        )}
      </div>

      {/* card template */}
      <div className="rounded-lg border p-3">
        <div className="mb-3 text-sm font-medium">{tr("cardTpl", "Yaratiladigan vazifa")}</div>
        <div className="space-y-3">
          <Field label={tr("cardTitle", "Sarlavha")}>
            <Input value={a.card.title ?? ""} onChange={(e) => setCard({ title: e.target.value })}
                   placeholder={a.name || tr("cardTitlePh", "Vazifa sarlavhasi")} />
          </Field>
          <Field label={tr("cardDesc", "Tavsif")}>
            <Textarea rows={3} value={a.card.description ?? ""}
                      onChange={(e) => setCard({ description: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tr("priority", "Muhimlik")}>
              <Select value={a.card.priority ?? "medium"} onValueChange={(v) => setCard({ priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`modules.tasks.priority.${p}`, { defaultValue: p })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={tr("dueInDays", "Muddat (kun)")}>
              <Input
                type="number" min={0}
                value={a.card.dueInDays ?? ""}
                placeholder={tr("noDue", "yo'q")}
                onChange={(e) => setCard({ dueInDays: e.target.value === "" ? null : Number(e.target.value) })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {tr("dueHint", "Yaratilgan kundan boshlab necha kun.")}
              </p>
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {tr("labelNote", "Har bir vazifaga «autotask» tegi avtomatik qo'shiladi.")}
          </p>
        </div>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>{tr("cancel", "Bekor qilish")}</Button>
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          {tr("save", "Saqlash")}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// ── AI (not built yet) ────────────────────────────────────────────────────────
function AiTab() {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.tasks.autotasks.aiSoon.${k}`, { defaultValue: d });
  const steps: [string, string][] = [
    [tr("s1", "Manba"), tr("s1d", "Hujjatlar, pochta, bank yoki boshqa modul — nimani kuzatish kerakligini tanlaysiz.")],
    [tr("s2", "Tahlil"), tr("s2d", "AI kelgan ma'lumot kontekstini o'qiydi va nima qilish kerakligini aniqlaydi.")],
    [tr("s3", "Harakat"), tr("s3d", "Kerak bo'lsagina vazifa yaratadi — kimga, qaysi muddatga ekanini o'zi belgilaydi.")],
  ];
  return (
    <div className="rounded-xl border border-dashed p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-violet-500 to-fuchsia-600 text-white">
          <Bot className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{tr("title", "AI avtotasklar")}</h4>
            <Badge variant="secondary" className="text-[10px]">{tr("badge", "Tez orada")}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {tr("lead", "Oddiy avtotask jadval bo'yicha ishlaydi. AI avtotask esa manbani kuzatib, kontekstni tahlil qilib, kerak bo'lgandagina vazifa yaratadi.")}
          </p>
        </div>
      </div>

      <ol className="mt-5 space-y-3">
        {steps.map(([title, desc], i) => (
          <li key={i} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-xs font-semibold">
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium">{title}</div>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
        {tr("studio", "Keyinchalik bu «AI Studio» ga aylanadi — workflow avtomatlashtirish uchun konstruktor.")}
      </p>
    </div>
  );
}
