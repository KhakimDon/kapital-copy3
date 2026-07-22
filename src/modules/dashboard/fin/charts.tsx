// Переиспользуемые графики финансового дашборда (recharts), стиль Kapitalbank.
import {
  ResponsiveContainer, ComposedChart, BarChart, AreaChart,
  Bar, Line, Area, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ReferenceLine,
} from "recharts";
import { fmtAxis, fmtFull, fmtMoney, type MonthPoint } from "./data";

const AX = { fontSize: 11, fill: "#9DA4A8" } as const;
const GRID = "#EEF0F2";
// Аналитический блок банка (страница «Эквайринг»): белая карточка, мягкая тень,
// крупное скругление, паддинг 32px, без бордера.
const CARD = "rounded-3xl bg-white p-8 shadow-[0_6px_28px_rgba(68,83,113,0.06)]";
const yearTicks = (d: MonthPoint[]) => d.filter((p) => p.label).map((p) => p.date);

// recharts v3 передаёт content-компоненту нестрого типизированные пропсы.
function MoneyTip(props: { active?: boolean; payload?: any[]; label?: React.ReactNode }) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[#EDEEF0] bg-white px-3 py-2 shadow-[0_8px_24px_rgba(68,83,113,0.14)]">
      <div className="mb-1 text-[12px] font-semibold text-[#101010]">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-[12px]">
          <span className="size-2 rounded-full" style={{ background: p.color as string }} />
          <span className="text-[#83888B]">{p.name}:</span>
          <span className="font-medium tabular-nums text-[#101010]">{fmtFull(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

/** Заголовок секции банка: жирный тайтл + серый период-суффикс + слот справа. */
export function SectionHead({ title, suffix, right }: { title: string; suffix?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-[20px] font-bold leading-tight text-[#101010]">
        {title}{suffix && <span className="ml-1.5 font-bold text-[#9DA4A8]">{suffix}</span>}
      </h3>
      {right}
    </div>
  );
}

/** Карточка-обёртка графика (белый аналитический блок «Эквайринг»). */
export function ChartCard({
  title, subtitle, height = 240, wide, right, children,
}: {
  title: string; subtitle?: string; height?: number; wide?: boolean;
  right?: React.ReactNode; children: React.ReactElement;
}) {
  return (
    <div className={`${CARD} ${wide ? "md:col-span-2" : ""}`}>
      <SectionHead title={title} suffix={subtitle} right={right} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

/** KPI-плитка: крупное значение + мини-график (area/line/bar). */
export function KpiCard({
  label, value, data, dataKey, kind = "area", color = "#2F6BFF",
}: {
  label: string; value: string; data: MonthPoint[]; dataKey: keyof MonthPoint;
  kind?: "area" | "line" | "bar"; color?: string;
}) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-[0_6px_28px_rgba(68,83,113,0.06)]">
      <div className="text-[24px] font-bold tabular-nums text-[#101010]">{value}</div>
      <div className="text-[14px] text-[#83888B]">{label}</div>
      <div className="mt-3 h-12">
        <ResponsiveContainer width="100%" height="100%">
          {kind === "bar" ? (
            <BarChart data={data}><Bar dataKey={dataKey} fill={color} radius={1} isAnimationActive={false} /></BarChart>
          ) : kind === "line" ? (
            <AreaChart data={data}>
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
            </AreaChart>
          ) : (
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`kg-${String(dataKey)}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#kg-${String(dataKey)})`} isAnimationActive={false} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Ранжированные бары в стиле «Лидеры продаж»: подпись · светло-фиолетовый бар · % · сумма. */
export function MoneyBalance({ items }: { items: { label: string; value: number; pct: number; color: string }[] }) {
  const maxPct = Math.max(...items.map((i) => i.pct));
  return (
    <div className={CARD}>
      <SectionHead title="Финансовый баланс" suffix="за 2021–2025" />
      <div className="-my-1">
        {items.map((i, idx) => (
          <div key={i.label}
               className={`grid grid-cols-[150px_1fr_auto] items-center gap-4 py-3.5 ${idx ? "border-t border-[#F0F1F3]" : ""}`}>
            <span className="truncate text-[14px] font-medium text-[#101010]">{i.label}</span>
            <div className="flex items-center gap-2.5">
              <div className="relative h-3.5 flex-1 rounded-full bg-[#F3F4F6]">
                {(() => { const w = Math.max(3, (i.pct / maxPct) * 100); return (<>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-[#EDE7FF]" style={{ width: `${w}%` }} />
                  <div className="absolute inset-y-0 w-[3px] rounded-full bg-[#7000FF]" style={{ left: `calc(${w}% - 3px)` }} />
                </>); })()}
              </div>
              <span className="w-10 shrink-0 text-[14px] font-semibold tabular-nums text-[#101010]">{i.pct}%</span>
            </div>
            <span className="text-right text-[14px] font-semibold tabular-nums text-[#101010]">{fmtMoney(i.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Scatter точки над градиентной областью (Sof foyda / EBITDA / Operatsion foyda …). */
export function ScatterArea({ title, subtitle, data, dataKey, color = "#09B849", height = 240 }: {
  title: string; subtitle?: string; data: MonthPoint[]; dataKey: keyof MonthPoint; color?: string; height?: number;
}) {
  return (
    <ChartCard title={title} subtitle={subtitle} height={height}>
      <ComposedChart data={data}>
        <defs>
          <linearGradient id={`sa-${String(dataKey)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" ticks={yearTicks(data)} tickFormatter={(v) => v.slice(0, 4)} tick={AX} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtAxis} tick={AX} axisLine={false} tickLine={false} width={54} />
        <ReferenceLine y={0} stroke="#D6D9DC" />
        <Tooltip content={<MoneyTip />} />
        <Area type="monotone" dataKey={dataKey} stroke="none" fill={`url(#sa-${String(dataKey)})`} isAnimationActive={false} />
        <Scatter dataKey={dataKey} fill={color} line={{ stroke: color, strokeWidth: 1 }} isAnimationActive={false} />
      </ComposedChart>
    </ChartCard>
  );
}

/** Комбо: бары «Выручка» + линия второй метрики (Sotuvdan tushumlar & X). */
export function ComboRevenue({ title, data, secondKey, secondLabel, secondColor = "#09B849", height = 260 }: {
  title: string; data: MonthPoint[]; secondKey: keyof MonthPoint; secondLabel: string; secondColor?: string; height?: number;
}) {
  return (
    <ChartCard title={title} height={height} wide>
      <ComposedChart data={data}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" ticks={yearTicks(data)} tickFormatter={(v) => v.slice(0, 4)} tick={AX} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtAxis} tick={AX} axisLine={false} tickLine={false} width={54} />
        <ReferenceLine y={0} stroke="#D6D9DC" />
        <Tooltip content={<MoneyTip />} />
        <Bar name="Выручка" dataKey="revenue" fill="#22C7E0" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        <Line name={secondLabel} type="monotone" dataKey={secondKey} stroke={secondColor} strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ChartCard>
  );
}

/** Вертикальные бары для топ-10 (категории/контрагенты). */
export function TopBar({ title, data, color = "#09B849", height = 260 }: {
  title: string; data: { name: string; value: number }[]; color?: string; height?: number;
}) {
  return (
    <ChartCard title={title} height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={{ ...AX, fontSize: 10 }} interval={0} axisLine={false} tickLine={false}
               tickFormatter={(v: string) => (v.length > 6 ? v.slice(0, 6) + "…" : v)} />
        <YAxis tickFormatter={fmtAxis} tick={AX} axisLine={false} tickLine={false} width={54} />
        <Tooltip content={<MoneyTip />} cursor={{ fill: "#F8F2FF" }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
          {data.map((_, i) => <Cell key={i} fill={color} />)}
        </Bar>
      </BarChart>
    </ChartCard>
  );
}

/** Плавная линия/область (Soliq, Dividendlar). */
export function SmoothLine({ title, subtitle, data, dataKey, color = "#09B849", height = 240 }: {
  title: string; subtitle?: string; data: MonthPoint[]; dataKey: keyof MonthPoint; color?: string; height?: number;
}) {
  return (
    <ChartCard title={title} subtitle={subtitle} height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`sl-${String(dataKey)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" ticks={yearTicks(data)} tickFormatter={(v) => v.slice(0, 4)} tick={AX} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtAxis} tick={AX} axisLine={false} tickLine={false} width={54} />
        <Tooltip content={<MoneyTip />} />
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#sl-${String(dataKey)})`} isAnimationActive={false} />
      </AreaChart>
    </ChartCard>
  );
}

/** Бары денежных потоков (in/out) c балансом-линией. */
export function CashCombo({ title, data, height = 260 }: { title: string; data: MonthPoint[]; height?: number }) {
  return (
    <ChartCard title={title} height={height} wide>
      <ComposedChart data={data}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" ticks={yearTicks(data)} tickFormatter={(v) => v.slice(0, 4)} tick={AX} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtAxis} tick={AX} axisLine={false} tickLine={false} width={54} />
        <ReferenceLine y={0} stroke="#D6D9DC" />
        <Tooltip content={<MoneyTip />} />
        <Bar name="Поступления" dataKey="cfIn" fill="#22C7E0" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        <Bar name="Выплаты" dataKey="cfOut" fill="#09B849" radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </ComposedChart>
    </ChartCard>
  );
}

export { fmtMoney };
