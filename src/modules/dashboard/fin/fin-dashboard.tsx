// Финансовый аналитический дашборд (демо «Opecoil»-стиль) — 5 вкладок с графиками.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { MonthPoint } from "./data";
import {
  MONTHS, SUMMARY, FIN_BALANCE, fmtMoney,
  TOP_INCOME_CATEGORIES, TOP_BUYERS, TOP_SUPPLIERS, TOP_EXPENSE_CATEGORIES, TOP_OPEX,
} from "./data";
import {
  KpiCard, MoneyBalance, ScatterArea, ComboRevenue, TopBar, SmoothLine, CashCombo,
} from "./charts";

type TabKey = "overview" | "sales" | "expenses" | "profit" | "cashflow";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Обзор" },
  { key: "sales", label: "Продажи" },
  { key: "expenses", label: "Расходы" },
  { key: "profit", label: "Прибыль" },
  { key: "cashflow", label: "Денежный поток" },
];

const grid = "grid grid-cols-1 gap-6 md:grid-cols-2";
const PERIODS = ["Месяц", "Квартал", "Год"] as const;

// белый аналитический блок «Эквайринг»
const CARD = "rounded-3xl bg-white p-8 shadow-[0_6px_28px_rgba(68,83,113,0.06)]";

// Реальная дельта: последние 12 мес против предыдущих 12 (к пред. периоду).
function yoyDelta(pick: (p: MonthPoint) => number): number | null {
  const n = MONTHS.length;
  if (n < 24) return null;
  const last = MONTHS.slice(n - 12).reduce((a, p) => a + pick(p), 0);
  const prev = MONTHS.slice(n - 24, n - 12).reduce((a, p) => a + pick(p), 0);
  if (!prev) return null;
  return ((last - prev) / prev) * 100;
}

export function FinDashboard() {
  const nav = useNavigate();
  const [tab, setTab] = useState<TabKey>("overview");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("Год");

  return (
    <div className="space-y-6 pb-10">
      {/* Шапка-карточка */}
      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => nav("/")}
              title="Назад"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#EDEEF0] text-[#101010] transition-colors hover:bg-[#F5F6F7]"
            >
              <ArrowLeft className="size-5" />
            </button>
            <div>
              <h1 className="text-[26px] font-bold leading-tight text-[#101010]">Финансовая аналитика</h1>
              <p className="text-[14px] text-[#83888B]">ООО «BARAKA SAVDO» · 2021–2025</p>
            </div>
          </div>
          {/* Сегмент периода — активная фиолетовая */}
          <div className="flex items-center gap-2">
            {PERIODS.map((p) => (
              <button key={p} type="button" onClick={() => setPeriod(p)}
                className={cn("rounded-full px-4 py-2 text-[14px] font-semibold transition-colors",
                  period === p
                    ? "bg-[#7000FF] text-white"
                    : "border border-[#E6E7EA] bg-white text-[#101010] hover:bg-[#F5F6F7]")}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Табы — фиолетовое подчёркивание активного */}
        <div className="mt-6 flex items-center gap-7 overflow-x-auto border-b border-[#EDEEF0]">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={cn("relative -mb-px whitespace-nowrap border-b-2 pb-3 pt-1 text-[15px] font-semibold transition-colors",
                tab === t.key
                  ? "border-[#7000FF] text-[#101010]"
                  : "border-transparent text-[#83888B] hover:text-[#101010]")}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <Overview />}
      {tab === "sales" && <Sales />}
      {tab === "expenses" && <Expenses />}
      {tab === "profit" && <Profit />}
      {tab === "cashflow" && <Cashflow />}
    </div>
  );
}

// KPI-строка банка: крупное значение + цветная дельта + серая подпись.
function KpiRow({ items }: { items: { value: string; label: string; delta: number | null }[] }) {
  return (
    <div className={CARD}>
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((k) => (
          <div key={k.label}>
            <div className="text-[26px] font-bold leading-none tabular-nums text-[#101010]">{k.value}</div>
            <div className="mt-2 text-[13px] leading-snug">
              {k.delta != null && (
                <span className={cn("font-semibold", k.delta >= 0 ? "text-[#09B849]" : "text-[#F24835]")}>
                  {k.delta >= 0 ? "+" : ""}{k.delta.toFixed(0)}%{" "}
                </span>
              )}
              <span className="text-[#83888B]">{k.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Overview() {
  const kpis = [
    { value: fmtMoney(SUMMARY.revenue), label: "выручка к пред. периоду", delta: yoyDelta((p) => p.revenue) },
    { value: fmtMoney(SUMMARY.netProfit), label: "чистая прибыль к пред. периоду", delta: yoyDelta((p) => p.netProfit) },
    { value: fmtMoney(SUMMARY.expense), label: "расходы к пред. периоду", delta: yoyDelta((p) => p.cogs + p.opex + p.salary + p.tax) },
    { value: SUMMARY.salesCount.toLocaleString("ru-RU"), label: "продаж к пред. периоду", delta: yoyDelta((p) => p.salesCount) },
    { value: SUMMARY.profitability + "%", label: "рентабельность", delta: null },
  ];
  return (
    <div className="space-y-6">
      <KpiRow items={kpis} />
      <MoneyBalance items={FIN_BALANCE} />
      <div className={grid}>
        <KpiCard label="Кол-во продаж" value={SUMMARY.salesCount.toLocaleString("ru-RU")} data={MONTHS} dataKey="salesCount" kind="bar" color="#5B6EF5" />
        <KpiCard label="Выплаченные дивиденды" value={fmtMoney(SUMMARY.dividends)} data={MONTHS} dataKey="dividends" kind="line" color="#22C7E0" />
      </div>
      <CashCombo title="Поступления, выплаты и общий баланс" data={MONTHS} />
    </div>
  );
}

function Sales() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Выручка от продаж" value={fmtMoney(SUMMARY.revenue)} data={MONTHS} dataKey="revenue" kind="bar" color="#2F6BFF" />
        <KpiCard label="Валовая прибыль" value={fmtMoney(SUMMARY.grossProfit)} data={MONTHS} dataKey="grossProfit" color="#09B849" />
        <KpiCard label="Себестоимость" value={fmtMoney(SUMMARY.cogs)} data={MONTHS} dataKey="cogs" kind="bar" color="#7000FF" />
        <KpiCard label="Кол-во продаж" value={SUMMARY.salesCount.toLocaleString("ru-RU")} data={MONTHS} dataKey="salesCount" kind="bar" color="#5B6EF5" />
      </div>
      <ComboRevenue title="Выручка от продаж & Валовая прибыль" data={MONTHS} secondKey="grossProfit" secondLabel="Валовая прибыль" secondColor="#09B849" />
      <div className={grid}>
        <ScatterArea title="Выручка от продаж" data={MONTHS} dataKey="revenue" color="#22C7E0" />
        <ScatterArea title="Себестоимость" data={MONTHS} dataKey="cogs" color="#22C7E0" />
        <ScatterArea title="Валовая прибыль" data={MONTHS} dataKey="grossProfit" color="#09B849" />
        <TopBar title="Топ-10 категорий дохода" data={TOP_INCOME_CATEGORIES} color="#09B849" />
        <TopBar title="Топ-10 категорий валовой прибыли" data={TOP_INCOME_CATEGORIES.map((c) => ({ name: c.name, value: Math.round(c.value * 0.15) }))} color="#22C7E0" />
        <TopBar title="Топ-10 покупателей" data={TOP_BUYERS} color="#09B849" />
      </div>
    </div>
  );
}

function Expenses() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard label="Операционные расходы" value={fmtMoney(SUMMARY.opex)} data={MONTHS} dataKey="opex" kind="bar" color="#F48C2C" />
        <KpiCard label="Зарплата" value={fmtMoney(SUMMARY.salary)} data={MONTHS} dataKey="salary" kind="line" color="#2F6BFF" />
        <KpiCard label="Налог" value={fmtMoney(SUMMARY.tax)} data={MONTHS} dataKey="tax" kind="line" color="#F24835" />
      </div>
      <div className={grid}>
        <SmoothLine title="Расходы на зарплату" data={MONTHS} dataKey="salary" color="#22C7E0" />
        <SmoothLine title="Налог" data={MONTHS} dataKey="tax" color="#09B849" />
        <TopBar title="Топ-10 операционных расходов" data={TOP_OPEX} color="#22C7E0" />
        <TopBar title="Топ-10 категорий расходов" data={TOP_EXPENSE_CATEGORIES} color="#22C7E0" />
        <TopBar title="Топ-10 поставщиков" data={TOP_SUPPLIERS} color="#09B849" />
      </div>
    </div>
  );
}

function Profit() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Чистая прибыль" value={fmtMoney(SUMMARY.netProfit)} data={MONTHS} dataKey="netProfit" color="#09B849" />
        <KpiCard label="Прибыль до налога" value={fmtMoney(SUMMARY.pretaxProfit)} data={MONTHS} dataKey="pretaxProfit" color="#2F6BFF" />
        <KpiCard label="EBITDA" value={fmtMoney(SUMMARY.ebitda)} data={MONTHS} dataKey="ebitda" color="#5B6EF5" />
        <KpiCard label="Операционная прибыль" value={fmtMoney(SUMMARY.opProfit)} data={MONTHS} dataKey="opProfit" color="#7000FF" />
      </div>
      <div className={grid}>
        <ScatterArea title="Чистая прибыль" data={MONTHS} dataKey="netProfit" color="#09B849" />
        <ScatterArea title="Прибыль до налога" data={MONTHS} dataKey="pretaxProfit" color="#09B849" />
        <ScatterArea title="Операционная прибыль" data={MONTHS} dataKey="opProfit" color="#09B849" />
        <ScatterArea title="EBITDA" data={MONTHS} dataKey="ebitda" color="#09B849" />
      </div>
      <ComboRevenue title="Выручка & Чистая прибыль" data={MONTHS} secondKey="netProfit" secondLabel="Чистая прибыль" secondColor="#09B849" />
      <ComboRevenue title="Выручка & EBITDA" data={MONTHS} secondKey="ebitda" secondLabel="EBITDA" secondColor="#7000FF" />
    </div>
  );
}

function Cashflow() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Поступления" value={fmtMoney(SUMMARY.cfIn)} data={MONTHS} dataKey="cfIn" kind="bar" color="#22C7E0" />
        <KpiCard label="Выплаты" value={fmtMoney(SUMMARY.cfOut)} data={MONTHS} dataKey="cfOut" kind="bar" color="#2F6BFF" />
        <KpiCard label="Чистый денежный поток" value={fmtMoney(SUMMARY.accountBalance)} data={MONTHS} dataKey="cfNet" kind="line" color="#5B6EF5" />
        <KpiCard label="Дивиденды" value={fmtMoney(SUMMARY.dividends)} data={MONTHS} dataKey="dividends" kind="line" color="#09B849" />
      </div>
      <CashCombo title="Поступления, выплаты и общий баланс" data={MONTHS} />
      <div className={grid}>
        <ScatterArea title="Операционный денежный поток" data={MONTHS} dataKey="cfOper" color="#22C7E0" />
        <SmoothLine title="Инвестиционный денежный поток" data={MONTHS} dataKey="cfInvest" color="#09B849" />
        <SmoothLine title="Финансовый денежный поток" data={MONTHS} dataKey="cfFin" color="#7000FF" />
        <SmoothLine title="Дивиденды" data={MONTHS} dataKey="dividends" color="#22C7E0" />
      </div>
    </div>
  );
}
