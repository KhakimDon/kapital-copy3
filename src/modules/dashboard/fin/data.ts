// Мок финансовой аналитики (демо «Opecoil»-стиль). Помесячные ряды 2021-01…2025-07,
// сводные KPI и топ-10 списки. Числа — из референса (в сумах UZS).

// ── детерминированный ГПСЧ, чтобы данные были стабильны между рендерами ──
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type MonthPoint = {
  date: string;        // YYYY-MM
  label: string;       // короткая подпись (год для оси)
  revenue: number;     // Sotuvdan tushumlar / Daromad
  cogs: number;        // Tannarx
  grossProfit: number; // Yalpi foyda
  opex: number;        // Operatsion xarajatlar
  salary: number;      // Ish haqi
  tax: number;         // Soliq
  opProfit: number;    // Operatsion foyda
  ebitda: number;      // EBITDA
  pretaxProfit: number;// Soliqqacha foyda
  netProfit: number;   // Sof foyda
  salesCount: number;  // Sotuvlar soni
  dividends: number;   // Dividendlar
  // денежные потоки
  cfIn: number;        // Tushum
  cfOut: number;       // To'lovlar
  cfOper: number;      // Operatsion pul oqimi
  cfInvest: number;    // Investitsion pul oqimi
  cfFin: number;       // Moliyaviy pul oqimi
  cfNet: number;       // Toza pul oqimi
};

function buildMonths(): MonthPoint[] {
  const rnd = mulberry32(20260722);
  const out: MonthPoint[] = [];
  let y = 2021, m = 1;
  const N = 55; // 2021-01 … 2025-07
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);                      // 0..1 прогресс
    const trend = 0.55 + 0.9 * t;               // рост со временем
    const season = 1 + 0.18 * Math.sin((i / 12) * Math.PI * 2); // сезонность
    const noise = 0.8 + rnd() * 0.5;
    const base = 17_000_000_000 * trend * season * noise;        // выручка/мес

    const revenue = Math.round(base);
    const cogs = Math.round(revenue * (0.82 + (rnd() - 0.5) * 0.06));
    const grossProfit = revenue - cogs;
    const opex = Math.round(grossProfit * (0.26 + (rnd() - 0.5) * 0.08));
    const salary = Math.round(opex * (0.28 + (rnd() - 0.5) * 0.06));
    const opProfit = grossProfit - opex;
    const ebitda = Math.round(opProfit * (1.03 + rnd() * 0.05));
    const pretaxProfit = Math.round(opProfit * (0.99 + (rnd() - 0.5) * 0.04));
    const tax = Math.round(pretaxProfit * (0.13 + (rnd() - 0.5) * 0.04));
    const netProfit = pretaxProfit - tax;
    const dividends = Math.round(netProfit * (0.14 + (rnd() - 0.5) * 0.06));
    const salesCount = Math.round(90 + 130 * trend * noise);

    const cfIn = Math.round(revenue * (1.0 + (rnd() - 0.5) * 0.1));
    const cfOut = Math.round(revenue * (1.24 + (rnd() - 0.5) * 0.15));
    const cfOper = Math.round((rnd() - 0.42) * 3_000_000_000);
    const cfInvest = Math.round((0.3 + rnd() * 0.7) * 2_500_000_000 * trend);
    const cfFin = Math.round((rnd() - 0.5) * 4_000_000_000);
    const cfNet = cfOper + cfInvest * (rnd() > 0.5 ? -1 : 1) + cfFin;

    out.push({
      date: `${y}-${String(m).padStart(2, "0")}`,
      label: m === 1 ? String(y) : "",
      revenue, cogs, grossProfit, opex, salary, tax,
      opProfit, ebitda, pretaxProfit, netProfit, salesCount, dividends,
      cfIn, cfOut, cfOper, cfInvest, cfFin, cfNet,
    });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export const MONTHS: MonthPoint[] = buildMonths();

const sum = (k: keyof MonthPoint) => MONTHS.reduce((a, p) => a + (p[k] as number), 0);

// ── сводные показатели (Asosiy) — цифры из референса ──
export const SUMMARY = {
  accountBalance: 4_210_000_000,   // Hisobdagi qoldiq
  profitBalance: 77_630_000_000,   // Foyda qoldig'i
  expense: 856_380_000_000,        // Xarajat (jami)
  revenue: 962_322_644_338,        // Savdodan tushum / Daromad
  cogs: 814_753_874_991,           // Tannarx
  grossProfit: 147_568_769_347,    // Yalpi foyda
  opex: 41_630_849_048,            // Operatsion xarajatlar
  tax: 13_952_289_977,             // Soliq
  netProfit: 92_094_506_557,       // Sof foyda
  opProfit: 106_050_000_000,       // Operatsion foyda
  pretaxProfit: 106_050_000_000,   // Soliqqacha foyda
  ebitda: 109_720_000_000,         // EBITDA
  salary: 5_550_000_000,           // Ish haqi
  profitability: 9.57,             // Rentabellik, %
  salesCount: 6433,                // Sotuvlar soni
  dividends: 13_970_000_000,       // To'langan dividendlar
  reserve: 0,                      // Rezerv
  cfIn: 962_323_000_000,           // Tushum
  cfOut: 1_229_000_000_000,        // To'lovlar
};

// Финансовый баланс (Moliyaviy saldo) — горизонтальные бары с % от дохода.
export const FIN_BALANCE = [
  { key: "revenue", label: "Доход", value: 962_322_644_338, pct: 100, color: "#2F6BFF" },
  { key: "cogs", label: "Себестоимость", value: 814_753_874_991, pct: 85, color: "#7000FF" },
  { key: "gross", label: "Валовая прибыль", value: 147_568_769_347, pct: 15, color: "#5B6EF5" },
  { key: "opex", label: "Опер. расходы", value: 41_630_849_048, pct: 4, color: "#F48C2C" },
  { key: "tax", label: "Налог", value: 13_952_289_977, pct: 1, color: "#F24835" },
  { key: "net", label: "Чистая прибыль", value: 92_094_506_557, pct: 10, color: "#09B849" },
];

// ── топ-10 списки ──
const top = (names: string[], top1: number, decay: number) =>
  names.map((name, i) => ({ name, value: Math.round(top1 * Math.pow(decay, i)) }));

export const TOP_INCOME_CATEGORIES = top(
  ["Дизель ДТ-Л", "ДТ-З", "Бензин АИ-80", "Бензин АИ-92", "Дизель ДТ-Е", "ДТ-Л опт", "Дизель зим.", "Бензин АИ-95", "Дизель лет.", "Бензин опт"],
  272_000_000_000, 0.52);
export const TOP_BUYERS = top(
  ["Узнефтепродукт", "Фалкон Ойл", "Инвест Транс", "Ичкурган Нефт", "Сино Ойл", "Глобал Ф.", "Унитрейд", "Кувасой", "Фотон Ойл", "Узтранс"],
  98_000_000_000, 0.66);
export const TOP_SUPPLIERS = top(
  ["Сеппоил", "Санойл", "Бунёд Нефт", "Узнефтегаз", "Фаберойл", "ООО Ойл", "Газпром", "Гидро", "ALFA", "Реал Ойл"],
  116_000_000_000, 0.7);
export const TOP_EXPENSE_CATEGORIES = top(
  ["Маркетинг", "Прочие опер.", "Амортизация", "Производство", "Командировки", "Проф. услуги", "Аренда", "Связь", "Ремонт", "Обучение"],
  130_000_000_000, 0.42);
export const TOP_OPEX = top(
  ["Административные", "Расходы по продажам", "Прочие расходы"], 22_000_000_000, 0.6);

// ── форматтеры ──
export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " трлн";
  if (abs >= 1e9) return (n / 1e9).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " млрд";
  if (abs >= 1e6) return (n / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " млн";
  return n.toLocaleString("ru-RU");
}
export function fmtFull(n: number): string {
  return n.toLocaleString("ru-RU");
}
export function fmtAxis(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(0) + " трлн";
  if (abs >= 1e9) return (n / 1e9).toFixed(0) + " млрд";
  if (abs >= 1e6) return (n / 1e6).toFixed(0) + " млн";
  return String(n);
}

export const totals = {
  revenue: sum("revenue"), cogs: sum("cogs"), grossProfit: sum("grossProfit"),
  netProfit: sum("netProfit"), salesCount: sum("salesCount"), dividends: sum("dividends"),
};
