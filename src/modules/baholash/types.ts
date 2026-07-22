// Baholash — firm evaluation, tariff & accountant workload.
// Types + domain labels (1:1 with NC js/baholash.js DOC_LABELS / SPHERE_LABELS).

export type Meta = {
  spheres: Record<string, { sale: number; emp: number }>;
  docTypes: string[];
  docThresholds: Record<string, number[]>;
  ball: Record<string, number>;
  budget: Record<string, number>;
  tariffUsd: Record<string, number>;
  turnoverBln: Record<string, number>;
  employees: Record<string, number>;
  accountantSalary: Record<string, number>;
  usdRate: number;
  sumPerBall: number;
};

export type CompanyItem = { id: number; name: string; inn: string };

export type FirmSources = {
  inn?: string;
  name?: string;
  oked?: string;
  sphere?: string;
  employees?: string;
  turnover_year_bln?: string;
  documents?: Record<string, string>;
};

export type FirmResult = {
  in_aiba: boolean;
  eskey_id: number;
  inn: string;
  name: string;
  oked: string;
  sphere: string;
  employees: number;
  turnover_year_bln: number;
  documents: Record<string, number>;
  sources: FirmSources;
};

export type EvaluationResult = {
  class: number;
  baseClass: number;
  classByTurnover: number;
  classByEmployees: number;
  docBump: number;
  exceededDocs: string[];
  sphere: string;
  saleCoef: number;
  empCoef: number;
  ball: number;
  budget: number;
  tariffUsd: number;
  tariffSum: number;
  sumPerBall: number;
};

export type SavedEvaluation = {
  id: number;
  owner_uid?: string | null;
  inn?: string | null;
  name?: string | null;
  oked?: string | null;
  sphere?: string | null;
  turnover_year_bln?: number | null;
  employees?: number | null;
  documents?: Record<string, number>;
  class?: number | null;
  ball?: number | null;
  budget?: number | null;
  tariff_usd?: number | null;
  tariff_sum?: number | null;
  result?: EvaluationResult | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EvaluateResponse = { result: EvaluationResult; saved: SavedEvaluation | null };

export type SalaryResult = {
  base: number;
  collectionPct: number;
  collected: number;
  bonus: number;
  total: number;
};

export type EvaluatePayload = {
  inn: string;
  name: string;
  oked: string;
  sphere: string;
  turnover_year_bln: number;
  employees: number;
  documents: Record<string, number>;
  save: boolean;
};

// Domain labels (1C / accounting terms — kept in Russian, the source language).
export const DOC_LABELS: Record<string, string> = {
  gtd_import: "ГТД по импорту",
  spisanie_rs: "Списание с расчётного счёта",
  sf_vydan: "Счёт-фактура выданный",
  sf_poluchen: "Счёт-фактура полученный",
  bolnichny: "Больничный лист",
  nachislenie_zp: "Начисление зарплаты",
  otpusk: "Отпуск",
  avansovy_otchet: "Авансовый отчёт",
  akt_sverki: "Акт сверки расчётов",
  vvod_ostatkov: "Ввод остатков",
  vydacha_nal: "Выдача наличных",
  korr_dolga: "Корректировка долга",
  oprihodovanie: "Оприходование товаров",
  plat_poruchenie: "Платёжное поручение",
  postuplenie: "Поступление (акты, накладные)",
  postuplenie_rs: "Поступление на расчётный счёт",
  realizaciya: "Реализация (акты, накладные)",
  reglament_op: "Регламентная операция",
  schet_pokupatel: "Счёт покупателю",
};

export const SPHERE_LABELS: Record<string, string> = {
  startup: "Старт-ап",
  retail: "Розница (чакана)",
  wholesale: "Опт (улгуржи)",
  import_export: "Импорт/экспорт",
  construction: "Строительство (қурилиш)",
  manufacturing: "Производство (ишлаб чиқариш)",
  horeca: "Услуги (HoReCa)",
  clinic: "Клиника",
  landlord: "Арендодатель",
  it: "IT, Freelancer",
  consulting: "Консалтинг / образование",
  nonprofit: "ННО (некоммерч.)",
  logistics: "Логистика",
  catering: "Общепит",
  excise: "Акциз плательщик",
  marking: "Маркировка",
};

export function fmtSum(n: number | string | null | undefined): string {
  const v = Math.round(Number(n) || 0);
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm";
}
