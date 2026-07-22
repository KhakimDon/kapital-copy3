// ─────────────────────────────────────────────────────────────────────────────
// Reports view for the local-first Tasks module — a Jira-board-style analytics
// surface (Cumulative flow, Burnup/Burndown, Velocity, Throughput, Cycle time,
// Created-vs-resolved, Average age, Distribution, Recent). Everything is derived
// from the cards themselves plus the in-memory history log; NO external chart
// library is used — the charts are hand-rolled responsive inline SVG.
//
// History is client-side only (see store.ts) and can be empty/sparse after a
// reload, so EVERY report degrades to a snapshot computed from card fields:
// a card currently in a done-category column is treated as resolved at its
// `columnEnteredAt` (fallback `updatedAt`) and created at `createdAt`; a card's
// category timeline always ends at its CURRENT column even when the moves that
// got it there were never recorded (see buildStat → synthetic trailing state).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity, BarChart3, History, Hourglass, Layers, LineChart, PieChart, Timer,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useUrlState } from "@/shared/hooks/use-url-state";
import {
  CATEGORY_META, PRIORITY_META,
  type Card, type Column, type ColumnCategory, type Member, type Project,
} from "./model";
import { useTasksStore } from "./store";
import { cardKey, colorFor, MemberAvatar, parseDay, relTime, resolveMember } from "./util";

// ── report registry ───────────────────────────────────────────────────────────

export type ReportKey =
  | "cfd" | "velocity" | "throughput"
  | "cycletime" | "createdresolved" | "age" | "distribution" | "recent";

type ReportDef = { key: ReportKey; icon: LucideIcon; titleKey: string; title: string; descKey: string; desc: string };

const REPORTS: ReportDef[] = [
  { key: "cfd", icon: Layers, titleKey: "modules.tasks.reports.cfd.title", title: "Kumulyativ oqim", descKey: "modules.tasks.reports.cfd.desc", desc: "Vaqt bo'yicha holatlar kesimida vazifalar soni" },
  { key: "velocity", icon: BarChart3, titleKey: "modules.tasks.reports.velocity.title", title: "Tezlik", descKey: "modules.tasks.reports.velocity.desc", desc: "Har haftada bajarilgan vazifalar soni" },
  { key: "throughput", icon: Activity, titleKey: "modules.tasks.reports.throughput.title", title: "O'tkazuvchanlik", descKey: "modules.tasks.reports.throughput.desc", desc: "Haftalik bajarilgan vazifalar va o'rtacha chiziq" },
  { key: "cycletime", icon: Timer, titleKey: "modules.tasks.reports.cycletime.title", title: "Sikl vaqti", descKey: "modules.tasks.reports.cycletime.desc", desc: "Har bir vazifaning bajarilish muddati (kun)" },
  { key: "createdresolved", icon: LineChart, titleKey: "modules.tasks.reports.createdresolved.title", title: "Yaratilgan va bajarilgan", descKey: "modules.tasks.reports.createdresolved.desc", desc: "Tanlangan davr uchun jamlanma taqqoslash" },
  { key: "age", icon: Hourglass, titleKey: "modules.tasks.reports.age.title", title: "O'rtacha yosh", descKey: "modules.tasks.reports.age.desc", desc: "Ochiq vazifalarning ustunlar bo'yicha o'rtacha yoshi" },
  { key: "distribution", icon: PieChart, titleKey: "modules.tasks.reports.distribution.title", title: "Taqsimot", descKey: "modules.tasks.reports.distribution.desc", desc: "Ochiq vazifalar turli kesimlar bo'yicha" },
  { key: "recent", icon: History, titleKey: "modules.tasks.reports.recent.title", title: "So'nggi harakatlar", descKey: "modules.tasks.reports.recent.desc", desc: "So'nggi yaratilgan va bajarilgan vazifalar" },
];

// ── category colours (todo=slate, inprogress=blue, done=green) ─────────────────
const CAT_COLOR: Record<ColumnCategory, string> = {
  todo: "#64748b",
  inprogress: "#3b82f6",
  done: "#22c55e",
};

const DAY_MS = 24 * 60 * 60 * 1000;

// ── per-card derived stats (the analytical spine of every report) ──────────────

type CardStat = {
  card: Card;
  createdAt: Date;
  currentCategory: ColumnCategory;
  /** Ordered category states; always ends at the card's CURRENT category. */
  timeline: { at: number; category: ColumnCategory }[];
  /** When it entered its final done-run — null unless currently in a done column. */
  resolvedAt: Date | null;
  resolvedIso: string | null;
  /** First moment it entered an in-progress column (fallback: createdAt). */
  startedAt: Date | null;
  /** resolvedAt − startedAt in whole days (>= 0), null if not resolved. */
  cycleDays: number | null;
};

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Build the full derived stat for one card, replaying history over card fields. */
function buildStat(
  card: Card,
  moves: { at: number; category: ColumnCategory | null }[],
  catById: Map<string, ColumnCategory>,
): CardStat {
  const createdAt = parseDay(card.createdAt) ?? new Date(card.createdAt);
  const currentCategory = catById.get(card.columnId) ?? "todo";

  // States start in "todo" at creation, then apply each recorded move whose
  // target column name resolved to a known category.
  const timeline: { at: number; category: ColumnCategory }[] = [
    { at: createdAt.getTime(), category: "todo" },
  ];
  let startedAt: Date | null = null;
  for (const mv of moves) {
    if (!mv.category) continue;
    timeline.push({ at: mv.at, category: mv.category });
    if (mv.category === "inprogress" && !startedAt) startedAt = new Date(mv.at);
  }
  timeline.sort((a, b) => a.at - b.at);

  // Snapshot fallback: if the recorded trail doesn't already end at the card's
  // real current category, append a synthetic transition when it entered the
  // current column (best available signal), so sparse history still lands the
  // card in the right band.
  const lastCat = timeline[timeline.length - 1].category;
  if (lastCat !== currentCategory) {
    const enteredAt = parseDay(card.columnEnteredAt)?.getTime()
      ?? parseDay(card.updatedAt)?.getTime()
      ?? createdAt.getTime();
    timeline.push({ at: Math.max(enteredAt, createdAt.getTime()), category: currentCategory });
    if (currentCategory === "inprogress" && !startedAt) startedAt = new Date(enteredAt);
  }

  // Resolved = the start of the trailing run of "done" states (only if the card
  // is currently in a done column).
  let resolvedAt: Date | null = null;
  if (currentCategory === "done") {
    let r = timeline[timeline.length - 1].at;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].category === "done") r = timeline[i].at;
      else break;
    }
    resolvedAt = new Date(r);
  }

  const start = startedAt ?? createdAt;
  const cycleDays = resolvedAt
    ? Math.max(0, Math.round((resolvedAt.getTime() - start.getTime()) / DAY_MS))
    : null;

  return {
    card,
    createdAt,
    currentCategory,
    timeline,
    resolvedAt,
    resolvedIso: resolvedAt ? resolvedAt.toISOString() : null,
    startedAt: startedAt ?? null,
    cycleDays,
  };
}

/** Category of a card at (the end of) a given day, or null if not yet created. */
function categoryAt(timeline: { at: number; category: ColumnCategory }[], endMs: number): ColumnCategory | null {
  if (endMs < timeline[0].at - (DAY_MS - 1)) return null;
  let cat: ColumnCategory | null = null;
  for (const s of timeline) {
    if (s.at <= endMs) cat = s.category;
    else break;
  }
  return cat;
}

// ── week helpers (Monday-first, matching the calendar util) ────────────────────
function startOfWeek(ms: number): number {
  const d = new Date(ms);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow));
}
function lastWeeks(n: number): number[] {
  const cur = startOfWeek(Date.now());
  return Array.from({ length: n }, (_, i) => cur - (n - 1 - i) * 7 * DAY_MS);
}

// ── small formatters ───────────────────────────────────────────────────────────
const p2 = (n: number) => String(n).padStart(2, "0");
const fmtShort = (ms: number) => { const d = new Date(ms); return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}`; };

// ── chart geometry + shared axis grid ──────────────────────────────────────────
const CW = 760, CH = 300;
const M = { top: 16, right: 18, bottom: 30, left: 44 };
const IW = CW - M.left - M.right;
const IH = CH - M.top - M.bottom;

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}
function yTicks(max: number, count = 4): number[] {
  const nm = niceMax(max);
  const out: number[] = [];
  for (let i = 0; i <= count; i++) out.push(Math.round((nm / count) * i * 100) / 100);
  return [...new Set(out)];
}
function pickIdx(n: number, count = 6): number[] {
  if (n <= count) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}
const xAt = (i: number, n: number) => M.left + (n <= 1 ? IW / 2 : (i / (n - 1)) * IW);
const yAt = (v: number, max: number) => M.top + IH - (max <= 0 ? 0 : (v / max) * IH);

function Grid({ max, xLabels }: { max: number; xLabels: { i: number; n: number; label: string }[] }) {
  const ticks = yTicks(max);
  return (
    <g>
      <g className="text-border">
        {ticks.map((v) => {
          const y = yAt(v, niceMax(max));
          return <line key={v} x1={M.left} y1={y} x2={M.left + IW} y2={y} stroke="currentColor" strokeOpacity={0.5} strokeWidth={1} />;
        })}
      </g>
      <g className="fill-muted-foreground" fontSize={11} style={{ fontVariantNumeric: "tabular-nums" }}>
        {ticks.map((v) => (
          <text key={v} x={M.left - 8} y={yAt(v, niceMax(max))} textAnchor="end" dominantBaseline="middle">{Math.round(v)}</text>
        ))}
        {xLabels.map((x, k) => (
          <text key={k} x={xAt(x.i, x.n)} y={M.top + IH + 18} textAnchor="middle">{x.label}</text>
        ))}
      </g>
    </g>
  );
}

function Svg({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} className="h-auto w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

// ── chart primitives ───────────────────────────────────────────────────────────

type SeriesPoint = { label: string; values: Record<string, number> };

/** Stacked area — keys are drawn bottom→top in the given order. */
function StackedArea({ points, keys, colorOf, labelOf }: {
  points: SeriesPoint[];
  keys: string[];
  colorOf: (k: string) => string;
  labelOf: (k: string) => string;
}) {
  const n = points.length;
  const max = Math.max(1, ...points.map((p) => keys.reduce((s, k) => s + (p.values[k] || 0), 0)));
  const nm = niceMax(max);
  // running lower bound per point
  const lower = points.map(() => 0);
  const bands = keys.map((k) => {
    const seg = points.map((p, i) => {
      const y0 = lower[i];
      const y1 = y0 + (p.values[k] || 0);
      lower[i] = y1;
      return { i, y0, y1 };
    });
    const top = seg.map((s) => `${xAt(s.i, n)},${yAt(s.y1, nm)}`).join(" L ");
    const bottom = [...seg].reverse().map((s) => `${xAt(s.i, n)},${yAt(s.y0, nm)}`).join(" L ");
    return { k, d: `M ${top} L ${bottom} Z` };
  });
  const xLabels = pickIdx(n).map((i) => ({ i, n, label: points[i].label }));
  return (
    <Svg label="cumulative flow">
      <Grid max={max} xLabels={xLabels} />
      {bands.map((b) => (
        <path key={b.k} d={b.d} fill={colorOf(b.k)} fillOpacity={0.72} stroke={colorOf(b.k)} strokeOpacity={0.9} strokeWidth={1}>
          <title>{labelOf(b.k)}</title>
        </path>
      ))}
    </Svg>
  );
}

/** Multi-line chart. */
function MultiLine({ points, series }: {
  points: SeriesPoint[];
  series: { key: string; color: string; label: string }[];
}) {
  const n = points.length;
  const max = Math.max(1, ...points.flatMap((p) => series.map((s) => p.values[s.key] || 0)));
  const nm = niceMax(max);
  const xLabels = pickIdx(n).map((i) => ({ i, n, label: points[i].label }));
  return (
    <Svg label="lines">
      <Grid max={max} xLabels={xLabels} />
      {series.map((s) => {
        const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i, n)} ${yAt(p.values[s.key] || 0, nm)}`).join(" ");
        return (
          <g key={s.key}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => (
              <circle key={i} cx={xAt(i, n)} cy={yAt(p.values[s.key] || 0, nm)} r={2.2} fill={s.color}>
                <title>{`${s.label} · ${p.label}: ${p.values[s.key] || 0}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </Svg>
  );
}

/** Bar chart with an optional overlaid average/rolling line. */
function Bars({ bars, color, line, lineLabel }: {
  bars: { label: string; value: number }[];
  color: string;
  line?: (number | null)[];
  lineLabel?: string;
}) {
  const n = bars.length;
  const max = Math.max(1, ...bars.map((b) => b.value), ...(line?.map((v) => v ?? 0) ?? []));
  const nm = niceMax(max);
  const band = IW / Math.max(1, n);
  const bw = Math.min(46, band * 0.62);
  const cx = (i: number) => M.left + band * (i + 0.5);
  const xLabels = bars.map((b, i) => ({ i, n, label: b.label }));
  // reuse Grid's x-positioning by supplying custom label coords below instead.
  return (
    <Svg label="bars">
      <g className="text-border">
        {yTicks(max).map((v) => <line key={v} x1={M.left} y1={yAt(v, nm)} x2={M.left + IW} y2={yAt(v, nm)} stroke="currentColor" strokeOpacity={0.5} />)}
      </g>
      <g className="fill-muted-foreground" fontSize={11} style={{ fontVariantNumeric: "tabular-nums" }}>
        {yTicks(max).map((v) => <text key={v} x={M.left - 8} y={yAt(v, nm)} textAnchor="end" dominantBaseline="middle">{Math.round(v)}</text>)}
        {xLabels.map((x) => <text key={x.i} x={cx(x.i)} y={M.top + IH + 18} textAnchor="middle">{x.label}</text>)}
      </g>
      {bars.map((b, i) => {
        const y = yAt(b.value, nm);
        return (
          <rect key={i} x={cx(i) - bw / 2} y={y} width={bw} height={Math.max(0, M.top + IH - y)} rx={3} fill={color} fillOpacity={0.85}>
            <title>{`${b.label}: ${b.value}`}</title>
          </rect>
        );
      })}
      {line && (
        <path
          d={line
            .map((v, i) => (v == null ? null : `${i === 0 || line[i - 1] == null ? "M" : "L"} ${cx(i)} ${yAt(v, nm)}`))
            .filter(Boolean)
            .join(" ")}
          fill="none" stroke="#f97316" strokeWidth={2} strokeDasharray="1 0" strokeLinejoin="round"
        >
          {lineLabel && <title>{lineLabel}</title>}
        </path>
      )}
    </Svg>
  );
}

/** Scatter / control chart with a horizontal median line. */
function Scatter({ points, median, medianLabel }: {
  points: { t: number; y: number; label: string; color: string }[];
  median: number;
  medianLabel: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.y), median);
  const nm = niceMax(max);
  const minT = Math.min(...points.map((p) => p.t));
  const maxT = Math.max(...points.map((p) => p.t));
  const span = maxT - minT || 1;
  const px = (t: number) => M.left + ((t - minT) / span) * IW;
  const xLabels = pickIdx(5).map((k) => {
    const t = minT + (span * k) / 4;
    return { t, label: fmtShort(t) };
  });
  return (
    <Svg label="cycle time">
      <g className="text-border">
        {yTicks(max).map((v) => <line key={v} x1={M.left} y1={yAt(v, nm)} x2={M.left + IW} y2={yAt(v, nm)} stroke="currentColor" strokeOpacity={0.5} />)}
      </g>
      <g className="fill-muted-foreground" fontSize={11} style={{ fontVariantNumeric: "tabular-nums" }}>
        {yTicks(max).map((v) => <text key={v} x={M.left - 8} y={yAt(v, nm)} textAnchor="end" dominantBaseline="middle">{Math.round(v)}</text>)}
        {xLabels.map((x, k) => <text key={k} x={px(x.t)} y={M.top + IH + 18} textAnchor="middle">{x.label}</text>)}
      </g>
      <line x1={M.left} y1={yAt(median, nm)} x2={M.left + IW} y2={yAt(median, nm)} stroke="#f97316" strokeWidth={1.5} strokeDasharray="5 4">
        <title>{`${medianLabel}: ${median}`}</title>
      </line>
      {points.map((p, i) => (
        <circle key={i} cx={px(p.t)} cy={yAt(p.y, nm)} r={4} fill={p.color} fillOpacity={0.75} stroke={p.color} strokeWidth={1}>
          <title>{`${p.label}: ${p.y} kun`}</title>
        </circle>
      ))}
    </Svg>
  );
}

/** Donut / pie. */
function Donut({ slices, centerTop, centerSub }: {
  slices: { label: string; value: number; color: string }[];
  centerTop: string;
  centerSub: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 118, r = 70, cx = 150, cy = 150;
  let a = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const frac = total > 0 ? s.value / total : 0;
    const a0 = a;
    const a1 = a + Math.min(frac, 0.9999) * Math.PI * 2;
    a = a1;
    const pt = (ang: number, rad: number) => `${cx + rad * Math.cos(ang)} ${cy + rad * Math.sin(ang)}`;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = `M ${pt(a0, R)} A ${R} ${R} 0 ${large} 1 ${pt(a1, R)} L ${pt(a1, r)} A ${r} ${r} 0 ${large} 0 ${pt(a0, r)} Z`;
    return { ...s, d, frac };
  });
  return (
    <svg viewBox="0 0 300 300" className="h-auto w-full max-w-[260px]" role="img" aria-label="distribution">
      {total === 0 ? (
        <circle cx={cx} cy={cy} r={(R + r) / 2} fill="none" stroke="currentColor" className="text-border" strokeWidth={R - r} strokeOpacity={0.4} />
      ) : (
        arcs.map((s, i) => (
          <path key={i} d={s.d} fill={s.color} fillOpacity={0.85}>
            <title>{`${s.label}: ${s.value} (${Math.round(s.frac * 100)}%)`}</title>
          </path>
        ))
      )}
      <text x={cx} y={cy - 6} textAnchor="middle" className="fill-foreground" fontSize={30} fontWeight={600} style={{ fontVariantNumeric: "tabular-nums" }}>{centerTop}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" className="fill-muted-foreground" fontSize={13}>{centerSub}</text>
    </svg>
  );
}

// ── legend + empty ─────────────────────────────────────────────────────────────
function Legend({ items }: { items: { color: string; label: string; value?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2.5 rounded-[3px]" style={{ background: it.color }} />
          <span className="text-foreground">{it.label}</span>
          {it.value != null && <span className="tabular-nums">{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

function EmptyReport({ hint }: { hint: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-card/40 p-10 text-center">
      <div className="text-sm font-medium text-foreground">
        {t("modules.tasks.reports.empty", { defaultValue: "Ma'lumot yetarli emas" })}
      </div>
      <div className="max-w-xs text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

// ── the view ───────────────────────────────────────────────────────────────────

export function ReportsView({ project, cards, columns, members }: {
  project: Project;
  cards: Card[];
  columns: Column[];
  members: Member[];
}) {
  const { t } = useTranslation();
  const history = useTasksStore((s) => s.history);
  const [reportRaw, setReport] = useUrlState("report", "cfd");
  const report = (REPORTS.some((r) => r.key === reportRaw) ? reportRaw : "cfd") as ReportKey;
  const active = REPORTS.find((r) => r.key === report)!;

  // Resolve column → category, column name → category (history moves store NAMES).
  const catById = useMemo(() => new Map(columns.map((c) => [c.id, c.category] as const)), [columns]);
  const catByName = useMemo(() => new Map(columns.map((c) => [c.name, c.category] as const)), [columns]);

  // Derived per-card stats — the shared basis of every report.
  const stats = useMemo(() => {
    const cardIds = new Set(cards.map((c) => c.id));
    const movesByCard = new Map<string, { at: number; category: ColumnCategory | null }[]>();
    for (const h of history) {
      if (h.kind !== "moved" || !cardIds.has(h.cardId)) continue;
      const at = new Date(h.at).getTime();
      if (Number.isNaN(at)) continue;
      const arr = movesByCard.get(h.cardId) ?? [];
      arr.push({ at, category: (h.to && catByName.get(h.to)) || null });
      movesByCard.set(h.cardId, arr);
    }
    return cards.map((c) => buildStat(c, (movesByCard.get(c.id) ?? []).sort((a, b) => a.at - b.at), catById));
  }, [cards, history, catByName, catById]);

  const resolved = useMemo(() => stats.filter((s) => s.resolvedAt), [stats]);

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      {/* Picker — sidebar on desktop, horizontal strip on mobile */}
      <nav className="flex shrink-0 gap-1 overflow-x-auto pb-1 md:w-56 md:flex-col md:overflow-visible md:pb-0">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const on = r.key === report;
          return (
            <button
              key={r.key}
              onClick={() => setReport(r.key)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors md:w-full",
                on ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{t(r.titleKey, { defaultValue: r.title })}</span>
            </button>
          );
        })}
      </nav>

      {/* Selected report */}
      <div className="min-w-0 flex-1">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">{t(active.titleKey, { defaultValue: active.title })}</h2>
          <p className="text-sm text-muted-foreground">{t(active.descKey, { defaultValue: active.desc })}</p>
        </div>
        <ReportBody
          report={report}
          project={project}
          cards={cards}
          columns={columns}
          members={members}
          stats={stats}
          resolved={resolved}
        />
      </div>
    </div>
  );
}

// ── report bodies ──────────────────────────────────────────────────────────────

function ReportBody({ report, project, cards, columns, members, stats, resolved }: {
  report: ReportKey;
  project: Project;
  cards: Card[];
  columns: Column[];
  members: Member[];
  stats: CardStat[];
  resolved: CardStat[];
}) {
  const { t } = useTranslation();

  if (cards.length === 0) {
    return <EmptyReport hint={t("modules.tasks.reports.emptyHint", { defaultValue: "Vazifalar qo'shilgach hisobotlar shakllanadi." })} />;
  }

  switch (report) {
    case "cfd": return <CfdReport stats={stats} />;
    case "velocity": return <VelocityReport resolved={resolved} />;
    case "throughput": return <ThroughputReport resolved={resolved} />;
    case "cycletime": return <CycleTimeReport project={project} resolved={resolved} />;
    case "createdresolved": return <CreatedResolvedReport stats={stats} />;
    case "age": return <AgeReport stats={stats} columns={columns} />;
    case "distribution": return <DistributionReport stats={stats} columns={columns} members={members} />;
    case "recent": return <RecentReport project={project} members={members} stats={stats} />;
  }
}

/** Build the daily (or weekly, for long spans) sample timeline shared by the
 * time-series reports. Always at least 2 samples so an area/line renders. */
function useDayList(stats: CardStat[], windowDays?: number) {
  return useMemo(() => {
    const todayStart = startOfDay(new Date());
    let start: number;
    if (windowDays) {
      start = todayStart - (windowDays - 1) * DAY_MS;
    } else {
      const minCreated = Math.min(...stats.map((s) => startOfDay(s.createdAt)));
      start = Number.isFinite(minCreated) ? minCreated : todayStart;
    }
    let span = Math.round((todayStart - start) / DAY_MS);
    if (span < 1) { start -= DAY_MS; span = 1; }
    const step = span > 90 ? 7 : 1;
    const out: { start: number; endMs: number; label: string }[] = [];
    for (let d = start; d <= todayStart; d += step * DAY_MS) {
      out.push({ start: d, endMs: d + DAY_MS - 1, label: fmtShort(d) });
    }
    if (out[out.length - 1].start !== todayStart) {
      out.push({ start: todayStart, endMs: todayStart + DAY_MS - 1, label: fmtShort(todayStart) });
    }
    return out;
  }, [stats, windowDays]);
}

// 1 — Cumulative flow diagram
function CfdReport({ stats }: { stats: CardStat[] }) {
  const { t } = useTranslation();
  const days = useDayList(stats);
  const points: SeriesPoint[] = days.map((d) => {
    const values: Record<string, number> = { done: 0, inprogress: 0, todo: 0 };
    for (const s of stats) {
      const cat = categoryAt(s.timeline, d.endMs);
      if (cat) values[cat] += 1;
    }
    return { label: d.label, values };
  });
  const order: ColumnCategory[] = ["done", "inprogress", "todo"]; // bottom → top
  return (
    <ChartCard
      legend={(["todo", "inprogress", "done"] as ColumnCategory[]).map((c) => ({
        color: CAT_COLOR[c], label: t(CATEGORY_META[c].labelKey, { defaultValue: CATEGORY_META[c].label }),
      }))}
    >
      <StackedArea
        points={points}
        keys={order}
        colorOf={(k) => CAT_COLOR[k as ColumnCategory]}
        labelOf={(k) => t(CATEGORY_META[k as ColumnCategory].labelKey, { defaultValue: CATEGORY_META[k as ColumnCategory].label })}
      />
    </ChartCard>
  );
}

// 2 — Velocity
function VelocityReport({ resolved }: { resolved: CardStat[] }) {
  const { t } = useTranslation();
  if (resolved.length === 0) return <NoResolved />;
  const weeks = lastWeeks(8);
  const bars = weeks.map((w) => ({
    label: fmtShort(w),
    value: resolved.filter((s) => startOfWeek(s.resolvedAt!.getTime()) === w).length,
  }));
  const doneL = t("modules.tasks.reports.legend.completed", { defaultValue: "Bajarilgan" });
  return (
    <ChartCard legend={[{ color: "#22c55e", label: doneL }]}>
      <Bars bars={bars} color="#22c55e" />
    </ChartCard>
  );
}

// 5 — Throughput (weekly bars + rolling average)
function ThroughputReport({ resolved }: { resolved: CardStat[] }) {
  const { t } = useTranslation();
  if (resolved.length === 0) return <NoResolved />;
  const weeks = lastWeeks(12);
  const values = weeks.map((w) => resolved.filter((s) => startOfWeek(s.resolvedAt!.getTime()) === w).length);
  const bars = weeks.map((w, i) => ({ label: fmtShort(w), value: values[i] }));
  const roll = values.map((_, i) => {
    const from = Math.max(0, i - 2);
    const slice = values.slice(from, i + 1);
    return Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10;
  });
  const doneL = t("modules.tasks.reports.legend.completed", { defaultValue: "Bajarilgan" });
  const avgL = t("modules.tasks.reports.legend.rolling", { defaultValue: "3-haftalik o'rtacha" });
  return (
    <ChartCard legend={[{ color: "#3b82f6", label: doneL }, { color: "#f97316", label: avgL }]}>
      <Bars bars={bars} color="#3b82f6" line={roll} lineLabel={avgL} />
    </ChartCard>
  );
}

// 6 — Cycle time control chart
function CycleTimeReport({ project, resolved }: { project: Project; resolved: CardStat[] }) {
  const { t } = useTranslation();
  const usable = resolved.filter((s) => s.cycleDays != null);
  if (usable.length === 0) return <NoResolved />;
  const points = usable.map((s) => ({
    t: s.resolvedAt!.getTime(),
    y: s.cycleDays!,
    label: cardKey(project, s.card),
    color: "#6366f1",
  }));
  const sorted = [...usable.map((s) => s.cycleDays!)].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
  const medL = t("modules.tasks.reports.legend.median", { defaultValue: "Median" });
  return (
    <ChartCard legend={[{ color: "#6366f1", label: t("modules.tasks.reports.legend.cycle", { defaultValue: "Vazifa" }) }, { color: "#f97316", label: `${medL}: ${median} kun` }]}>
      <Scatter points={points} median={median} medianLabel={medL} />
    </ChartCard>
  );
}

// 7 — Created vs resolved (windowed, cumulative)
function CreatedResolvedReport({ stats }: { stats: CardStat[] }) {
  const { t } = useTranslation();
  const [winRaw, setWin] = useUrlState("win", "30");
  const win = [30, 60, 90].includes(Number(winRaw)) ? Number(winRaw) : 30;
  const days = useDayList(stats, win);
  const points: SeriesPoint[] = days.map((d) => ({
    label: d.label,
    values: {
      created: stats.filter((s) => s.createdAt.getTime() <= d.endMs).length,
      resolved: stats.filter((s) => s.resolvedAt && s.resolvedAt.getTime() <= d.endMs).length,
    },
  }));
  const createdL = t("modules.tasks.reports.legend.created", { defaultValue: "Yaratilgan" });
  const resolvedL = t("modules.tasks.reports.legend.resolvedLine", { defaultValue: "Bajarilgan" });
  return (
    <ChartCard
      legend={[{ color: "#6366f1", label: createdL }, { color: "#22c55e", label: resolvedL }]}
      toolbar={
        <Pills
          value={String(win)}
          options={[30, 60, 90].map((d) => ({ value: String(d), label: t("modules.tasks.reports.window", { defaultValue: "{{n}} kun", n: d }) }))}
          onChange={setWin}
        />
      }
    >
      <MultiLine points={points} series={[{ key: "created", color: "#6366f1", label: createdL }, { key: "resolved", color: "#22c55e", label: resolvedL }]} />
    </ChartCard>
  );
}

// 8 — Average age of open issues by column
function AgeReport({ stats, columns }: { stats: CardStat[]; columns: Column[] }) {
  const { t } = useTranslation();
  const now = Date.now();
  const open = stats.filter((s) => s.currentCategory !== "done");
  const cols = columns.filter((c) => c.category !== "done");
  const bars = cols
    .map((col) => {
      const inCol = open.filter((s) => s.card.columnId === col.id);
      const avg = inCol.length
        ? Math.round(inCol.reduce((sum, s) => sum + (now - s.createdAt.getTime()) / DAY_MS, 0) / inCol.length)
        : 0;
      return { label: col.name, value: avg, color: col.color, count: inCol.length };
    })
    .filter((b) => b.count > 0);
  if (bars.length === 0) {
    return <EmptyReport hint={t("modules.tasks.reports.age.none", { defaultValue: "Ochiq vazifalar yo'q." })} />;
  }
  return (
    <ChartCard legend={[{ color: "#0ea5e9", label: t("modules.tasks.reports.age.avgDays", { defaultValue: "O'rtacha yosh (kun)" }) }]}>
      <Bars bars={bars.map((b) => ({ label: b.label, value: b.value }))} color="#0ea5e9" />
    </ChartCard>
  );
}

// 9 — Distribution donut with a dimension selector
type DistDim = "status" | "assignee" | "priority" | "type" | "label";
function DistributionReport({ stats, columns, members }: { stats: CardStat[]; columns: Column[]; members: Member[] }) {
  const { t } = useTranslation();
  const [dimRaw, setDim] = useUrlState("dist", "status");
  const dim = (["status", "assignee", "priority", "type", "label"].includes(dimRaw) ? dimRaw : "status") as DistDim;
  const open = stats.filter((s) => s.currentCategory !== "done");

  const dimLabel: Record<DistDim, string> = {
    status: t("modules.tasks.reports.dim.status", { defaultValue: "Holat" }),
    assignee: t("modules.tasks.reports.dim.assignee", { defaultValue: "Mas'ul" }),
    priority: t("modules.tasks.reports.dim.priority", { defaultValue: "Muhimlik" }),
    type: t("modules.tasks.reports.dim.type", { defaultValue: "Turi" }),
    label: t("modules.tasks.reports.dim.label", { defaultValue: "Yorliq" }),
  };

  const slices = useMemo(() => {
    const map = new Map<string, { label: string; value: number; color: string }>();
    const bump = (key: string, label: string, color: string) => {
      const cur = map.get(key);
      if (cur) cur.value += 1;
      else map.set(key, { label, value: 1, color });
    };
    for (const s of open) {
      const c = s.card;
      if (dim === "status") {
        const col = columns.find((x) => x.id === c.columnId);
        bump(c.columnId, col?.name ?? "—", col?.color ?? "#94a3b8");
      } else if (dim === "priority") {
        const meta = PRIORITY_META[c.priority] ?? PRIORITY_META.medium;
        bump(c.priority, t(meta.labelKey, { defaultValue: meta.label }), meta.color);
      } else if (dim === "type") {
        const key = c.type;
        bump(key, key === "epic" ? t("modules.tasks.reports.type.epic", { defaultValue: "Epik" }) : t("modules.tasks.reports.type.task", { defaultValue: "Vazifa" }), key === "epic" ? "#8b5cf6" : "#0ea5e9");
      } else if (dim === "assignee") {
        if (c.assigneeIds.length === 0) bump("__none__", t("modules.tasks.reports.unassigned", { defaultValue: "Biriktirilmagan" }), "#94a3b8");
        else for (const id of c.assigneeIds) {
          const m = resolveMember(members, id);
          bump(id, m?.name ?? id, m?.color || colorFor(m?.name ?? id));
        }
      } else {
        if (c.labels.length === 0) bump("__nolabel__", t("modules.tasks.reports.noLabel", { defaultValue: "Yorliqsiz" }), "#94a3b8");
        else for (const l of c.labels) bump(`l:${l}`, l, colorFor(l));
      }
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [open, dim, columns, members, t]);

  const dims: DistDim[] = ["status", "assignee", "priority", "type", "label"];
  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-4">
        <Pills value={dim} options={dims.map((d) => ({ value: d, label: dimLabel[d] }))} onChange={(v) => setDim(v)} />
      </div>
      {total === 0 ? (
        <EmptyReport hint={t("modules.tasks.reports.distribution.none", { defaultValue: "Ochiq vazifalar yo'q." })} />
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <div className="shrink-0">
            <Donut
              slices={slices}
              centerTop={String(total)}
              centerSub={t("modules.tasks.reports.openIssues", { defaultValue: "ochiq" })}
            />
          </div>
          <ul className="min-w-0 flex-1 space-y-1.5 self-stretch">
            {slices.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate text-foreground">{s.label}</span>
                <span className="tabular-nums text-muted-foreground">{s.value}</span>
                <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round((s.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// 10 — Recent created / resolved
function RecentReport({ project, members, stats }: { project: Project; members: Member[]; stats: CardStat[] }) {
  const { t } = useTranslation();
  const created = [...stats].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 10);
  const resolved = stats.filter((s) => s.resolvedAt).sort((a, b) => b.resolvedAt!.getTime() - a.resolvedAt!.getTime()).slice(0, 10);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <RecentList
        title={t("modules.tasks.reports.recentCreated", { defaultValue: "So'nggi yaratilgan" })}
        rows={created.map((s) => ({
          stat: s,
          who: s.card.reporterId,
          when: s.card.createdAt,
        }))}
        project={project}
        members={members}
      />
      <RecentList
        title={t("modules.tasks.reports.recentResolved", { defaultValue: "So'nggi bajarilgan" })}
        rows={resolved.map((s) => ({
          stat: s,
          who: s.card.assigneeIds[0] ?? s.card.reporterId,
          when: s.resolvedIso!,
        }))}
        project={project}
        members={members}
      />
    </div>
  );
}

function RecentList({ title, rows, project, members }: {
  title: string;
  rows: { stat: CardStat; who: string | null; when: string }[];
  project: Project;
  members: Member[];
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-3 py-2 text-sm font-semibold">{title}</div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">{t("modules.tasks.reports.recentEmpty", { defaultValue: "Yo'q" })}</div>
      ) : (
        <ul className="divide-y">
          {rows.map(({ stat, who, when }) => {
            const m = resolveMember(members, who);
            return (
              <li key={stat.card.id} className="flex items-center gap-2.5 px-3 py-2">
                <MemberAvatar member={m} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">{stat.card.title}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="tabular-nums">{cardKey(project, stat.card)}</span>
                    {m?.name && <span className="truncate">· {m.name}</span>}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{relTime(when, t)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── shared bits ────────────────────────────────────────────────────────────────
function ChartCard({ children, legend, toolbar }: {
  children: React.ReactNode;
  legend?: { color: string; label: string; value?: string }[];
  toolbar?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      {toolbar && <div className="mb-4">{toolbar}</div>}
      <div className="overflow-x-auto">{children}</div>
      {legend && legend.length > 0 && <div className="mt-3 border-t pt-3"><Legend items={legend} /></div>}
    </div>
  );
}

function Pills({ value, options, onChange }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs transition-colors",
            o.value === value ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NoResolved() {
  const { t } = useTranslation();
  return <EmptyReport hint={t("modules.tasks.reports.noResolved", { defaultValue: "Hali bajarilgan vazifalar yo'q." })} />;
}
