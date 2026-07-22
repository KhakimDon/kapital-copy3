// Тестовые данные для mock-API (dev-only). Формы ответов повторяют точные
// типы фронта: см. src/shared/api/*, src/modules/*/api.ts.
// Скоуп = ТЗ пилота AIBA × Kapitalbank P26015: финансовая аналитика,
// ЭСФ (documents), банк (остатки), налоги/касса (soliq). Цифры — из примеров ТЗ.

// ---- company (одна, фиксированная) ----------------------------------------
// /me/companies → { items: Company[], count }
export const myCompanies = [
  { id: 1, name: 'OOO "BARAKA SAVDO"', inn: "305123456" },
];

// /companies/ → { items: CompanyRow[], count }
export const companyRows = [
  { id: 1, name: 'OOO "BARAKA SAVDO"', inn: "305123456", legal_form: "OOO", is_active: true, keys_count: 2, created_at: "2024-11-03T09:00:00Z", director_name: "Karimov Aziz Baxtiyorovich", phone: "+998901234567" },
];

// /companies/enrich?inns=... → Record<inn, EnrichRow>
export const enrichMap = {
  "305123456": { rating: "AA", rating_points: 92, rating_color: "green", debt: 37550000, advance: 0 },
};

// ---- modules (sidebar native list) ----------------------------------------
// /modules → bare Module[] (src/shared/modules.ts).
// Только модули пилота — любой другой slug в ModulePage упадёт в «не найдено».
export const modules = [
  { slug: "documents", title: "EDO (Hujjatlar)", icon: "FileText", state: "native" },
  { slug: "soliq", title: "Soliqlar", icon: "Receipt", state: "native" },
  { slug: "onec", title: "1C (Debitor/Kreditor)", icon: "Building2", state: "native" },
  { slug: "kontragent", title: "Kontragentlar", icon: "Users", state: "native" },
];

// ---- dashboard (финансовая аналитика из ТЗ) --------------------------------
export const currencyBlock = {
  usd: { code: "USD", rate: 12650.44, delta: 12.3, date: "2026-07-20" },
  eur: { code: "EUR", rate: 13710.9, delta: -8.15, date: "2026-07-20" },
  rub: { code: "RUB", rate: 140.02, delta: 0.4, date: "2026-07-20" },
};

export const dashboardOverview = (companyId) => ({
  company_id: companyId,
  currency: currencyBlock,
  // Цифры из примеров ТЗ: остатки на р/с 152 340 500,75; налоговый долг 37 550 000.
  rating: { inn: "305123456", rating: "AA", rating_points: 92, rating_color: "green", debt: 37550000, advance: 0 },
  documents: { total: 148, pending: 6, signed: 137, rejected: 5 },
  bank: { total_balance: 152_340_500.75, accounts: 2, banks: 1 },
});

export const taxSchedule = {
  items: [
    { key: "turnover", label: "Aylanma soliq (налог с оборота)", type: "monthly", deadline: "2026-08-15", days_remaining: 26, period_label: "Iyul 2026", severity: "normal" },
    { key: "qqs", label: "QQS deklaratsiyasi", type: "monthly", deadline: "2026-07-20", days_remaining: 0, period_label: "Iyun 2026", severity: "red" },
    { key: "income", label: "Foyda solig'i", type: "quarterly", deadline: "2026-07-25", days_remaining: 5, period_label: "2-chorak 2026", severity: "yellow" },
  ],
};

// ---- misc ------------------------------------------------------------------
export const footerConfig = {
  links: [
    { label: "aiba.uz", url: "https://aiba.uz" },
    { label: "Kapitalbank", url: "https://kapitalbank.uz" },
  ],
  socials: { telegram: "https://t.me/aiba_uz" },
};

export const me = {
  username: "demo",
  user_id: "u-aziz",
  phone: "+998901234567",
  is_admin: true,
  role: "tenant_admin",
  tenant: "demo",
  is_superadmin: false,
  disabled_modules: [],
  avatar: null,
  profile: { firstName: "Aziz", lastName: "Karimov", birthday: "1985-01-30", about: "Пилот P26015 — тестовые данные", onboarded: true },
};

export const myPermissions = { is_admin: true, is_superadmin: false, tenant: [], companies: {} };
