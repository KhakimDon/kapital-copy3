// Dev-only mock всего /api/v2/* — приложение работает без Rust-бэкенда.
// Включается флагом MOCK_API=1 (см. vite.config.ts).
// Скоуп = ТЗ пилота P26015: дашборд-аналитика, ЭСФ, банк, налоги/касса.
//
// Правила (см. интерцепторы в src/shared/api/client.ts):
//  - НИКОГДА не отвечаем 401 — иначе фронт вызывает logout().
//  - Формы ответов повторяют типы фронта 1:1 (конверты у всех разные).
//  - Несматченные запросы логируются: [mock-api] MISS GET /...
import {
  myCompanies, companyRows, enrichMap, modules, currencyBlock,
  dashboardOverview, taxSchedule, footerConfig, me, myPermissions,
} from "./fixtures.mjs";
import {
  bankAccounts, bankTransactions, bankSubscriptions,
  documents, docProducts, parties, mxikItems,
  taxGridRow, cheques, chequeTerminals, soliqReports, soliqPayments,
} from "./modules-fixtures.mjs";
import { readFileSync } from "node:fs";

// Страница документа как PNG — рендерится через <img> на белом фоне
// (без тёмной подложки встроенного PDF-плагина Chrome).
const ESF_PNG = readFileSync(new URL("./esf-sample.png", import.meta.url));

const FAKE_JWT =
  "eyJhbGciOiJIUzI1NiJ9." +
  Buffer.from(JSON.stringify({ sub: "demo", tenant: "demo" })).toString("base64url") +
  ".mock-signature";

function json(res, body, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  // На Vercel тело запроса уже распарсено в req.body (стрим может быть прочитан).
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      try { return Promise.resolve(JSON.parse(req.body) || {}); } catch { return Promise.resolve({}); }
    }
    return Promise.resolve(req.body);
  }
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

const loginResponse = (username) => ({
  access_token: FAKE_JWT,
  token_type: "bearer",
  expires_in: 86400,
  username: username || "demo",
  display_name: "Aziz Karimov",
  is_admin: true,
});

// 1С-контрагенты (дебиторка/кредиторка) — согласованы с лаунчером и дашбордом:
// нам должны 86,2 млн (ALFA 54 + BETA 32,2), мы должны 61,3 млн (GAMMA).
const onecCounterparties = [
  { name: 'OOO "ALFA SAVDO"', inn: "302118844", code: "00-0000123", sales: 54000000, purchases: 0, paymentsIn: 0, paymentsOut: 0, customerBalance: 54000000, supplierBalance: 0, netBalance: 54000000, debit: 54000000, credit: 0, balance: 54000000, statuses: ["debtor"], contract: "Договор поставки №12 от 01.03.2026" },
  { name: 'OOO "BETA LOGISTIC"', inn: "301994571", code: "00-0000088", sales: 32200000, purchases: 0, paymentsIn: 0, paymentsOut: 0, customerBalance: 32200000, supplierBalance: 0, netBalance: 32200000, debit: 32200000, credit: 0, balance: 32200000, statuses: ["debtor"], contract: "Договор поставки №7 от 15.02.2026" },
  { name: 'OOO "GAMMA TRADE"', inn: "300551209", code: "00-0000210", sales: 0, purchases: 61300000, paymentsIn: 0, paymentsOut: 0, customerBalance: 0, supplierBalance: 61300000, netBalance: -61300000, debit: 0, credit: 61300000, balance: -61300000, statuses: ["creditor"], contract: "Договор закупки №19 от 20.04.2026" },
];
const onecTotals = {
  totalReceivable: 86200000, totalPayable: 61300000, netPosition: 24900000,
  debtorCount: 2, creditorCount: 1, settledCount: 0,
};

// Роуты: [method, string-или-regex путь, handler(res, { body, m, q })].
const routes = [
  // --- auth (гейт всего приложения) ---
  ["POST", "/auth/login", (res, { body }) => json(res, loginResponse(body.username))],
  ["POST", "/admin/login", (res, { body }) => json(res, loginResponse(body.username))],
  ["POST", "/auth/admin-contact", (res) =>
    json(res, { found: true, admins: [{ name: "Aziz Karimov", phone: "+998 90 123-45-67" }] })],

  // --- boot-набор оболочки ---
  ["GET", "/me", (res) => json(res, me)],
  ["POST", "/me/heartbeat", (res) => json(res, {})],
  ["GET", "/me/companies", (res) => json(res, { items: myCompanies, count: myCompanies.length })],
  ["GET", "/authz/me", (res) => json(res, myPermissions)],
  ["GET", "/modules", (res) => json(res, modules)],
  ["GET", "/notifications", (res) => json(res, { items: [], unread: 0 })],
  ["GET", "/public/footer", (res) => json(res, footerConfig)],
  ["GET", "/config/home-prompts", (res) => json(res, { prompts: [] })],
  ["GET", "/gitlab/pipeline-status", (res) => json(res, { status: "success", running: false })],

  // --- company (одна фиксированная) ---
  ["GET", /^\/companies\/?$/, (res) => json(res, { items: companyRows, count: companyRows.length })],
  ["GET", "/companies/enrich", (res) => json(res, enrichMap)],
  ["GET", /^\/companies\/(\d+)$/, (res) => json(res, companyRows[0])],

  // --- dashboard: раскладка виджетов (набор из ТЗ) ---
  ["GET", "/dashboard/layout", (res) =>
    json(res, {
      role: "default",
      editable: true,
      widgets: [
        { id: "w1", type: "company_overview", colspan: 1 },
        { id: "w2", type: "finance_docs", colspan: 1 },
        { id: "w3", type: "finance_tax", colspan: 1 },
        { id: "w4", type: "finance_debtors", colspan: 1 },
        { id: "w5", type: "finance_currency", colspan: 1 },
      ],
    })],
  ["GET", "/dashboard/catalog", (res) =>
    json(res, {
      widgets: [
        "company_overview", "finance_currency", "finance_docs", "finance_tax",
        "finance_debtors",
      ].map((type) => ({ type, defaultColspan: 1, adminOnly: false })),
      roles: [{ key: "default", label: "Default" }],
    })],
  ["GET", "/dashboard/layouts", (res) => json(res, { items: [] })],

  // --- dashboard: данные аналитики (цифры из примеров ТЗ) ---
  ["GET", "/dashboard/currency", (res) => json(res, currencyBlock)],
  ["GET", /^\/dashboard\/companies\/(\d+)\/overview$/, (res, { m }) =>
    json(res, dashboardOverview(Number(m[1])))],
  ["GET", "/dashboard/tax-schedule", (res) => json(res, taxSchedule)],
  ["GET", "/dashboard/currency-archive", (res) =>
    json(res, {
      points: [
        { date: "2026-07-14", rate: 12610.1 },
        { date: "2026-07-15", rate: 12622.7 },
        { date: "2026-07-16", rate: 12618.3 },
        { date: "2026-07-17", rate: 12631.0 },
        { date: "2026-07-18", rate: 12640.5 },
        { date: "2026-07-19", rate: 12638.1 },
        { date: "2026-07-20", rate: 12650.44 },
      ],
      min: 12610.1, max: 12650.44, avg: 12630.2, days: 7,
    })],
  ["GET", /^\/dashboard\/companies\/\d+\/recent-docs$/, (res) =>
    json(res, {
      items: [
        { doc_id: "esf-1042", doctype: "esf", doctype_label: "ЭСФ", doc_date: "2026-07-18", doc_status: "signed", partner_name: 'OOO "ALFA SAVDO"', partner_tin: "302118844", total_sum: 54000000, is_creator: true },
        { doc_id: "esf-1041", doctype: "esf", doctype_label: "ЭСФ", doc_date: "2026-07-17", doc_status: "pending", partner_name: 'OOO "BETA LOGISTIC"', partner_tin: "301994571", total_sum: 32200000, is_creator: true },
        { doc_id: "esf-1039", doctype: "esf", doctype_label: "ЭСФ", doc_date: "2026-07-15", doc_status: "draft", partner_name: 'OOO "GAMMA TRADE"', partner_tin: "300551209", total_sum: 45000000, is_creator: false },
      ],
      total: 3,
    })],
  ["GET", /^\/dashboard\/companies\/\d+\/debtors$/, (res) =>
    json(res, {
      // Дебиторы из примера ТЗ (JSON 12).
      items: [
        { name: 'OOO "ALFA SAVDO"', inn: "302118844", debt: 54000000 },
        { name: 'OOO "BETA LOGISTIC"', inn: "301994571", debt: 32200000 },
      ],
      total: 86200000,
      available: true,
    })],
  ["GET", /^\/dashboard\/companies\/\d+\/tax-notices$/, (res) =>
    json(res, { unread: 0, actionable: 0, total: 0, items: [] })],
  ["GET", /^\/dashboard\/companies\/\d+\/unconfirmed-provodka$/, (res) =>
    json(res, { total_new: 0, available: false })],
  ["GET", /^\/dashboard\/companies\/\d+\/expiring-keys$/, (res) => json(res, { items: [], total: 0 })],
  ["GET", /^\/dashboard\/companies\/\d+\/tax-status$/, (res) =>
    json(res, {
      period: { year: 2026, month: 7 },
      // Налоги из примера ТЗ (JSON 10) + налог с оборота — предмет пилота.
      items: [
        { id: "turnover", label: "Налог с оборота", status: "submitted", reports: 1 },
        { id: "nds", label: "НДС", status: "penalty", reports: 1 },
        { id: "profit", label: "Налог на прибыль", status: "submitted", reports: 1 },
        { id: "social", label: "Социальный налог", status: "not_submitted", reports: 0 },
      ],
    })],
  // ============================ BANK ============================
  // Деньги в тийинах — UI делит на 100 (src/modules/bank/page.tsx:40).
  ["GET", /^\/bank\/companies\/[^/]+\/accounts$/, (res) => json(res, bankAccounts)],
  ["GET", /^\/bank\/companies\/[^/]+\/transactions$/, (res, { q }) => {
    let items = bankTransactions;
    const dir = q.get("direction");
    if (dir) items = items.filter((t) => t.direction === dir);
    const accIds = q.get("account_ids");
    if (accIds) items = items.filter((t) => accIds.split(",").includes(t.account_number));
    const s = (q.get("search") || "").toLowerCase();
    if (s) items = items.filter((t) => JSON.stringify(t).toLowerCase().includes(s));
    const skip = Number(q.get("skip") || 0);
    const limit = Number(q.get("limit") || 50);
    return json(res, { items: items.slice(skip, skip + limit), total: items.length });
  }],
  ["GET", /^\/bank\/companies\/[^/]+\/transactions\/summary$/, (res) => {
    const inc = bankTransactions.filter((t) => t.direction === "in");
    const out = bankTransactions.filter((t) => t.direction === "out");
    const sum = (a) => a.reduce((acc, t) => acc + t.amount, 0);
    return json(res, {
      total_income: sum(inc), total_expense: sum(out),
      income_count: inc.length, expense_count: out.length,
      transactions_count: bankTransactions.length,
    });
  }],
  ["GET", /^\/bank\/companies\/[^/]+\/pending-payments$/, (res) =>
    json(res, {
      items: [
        { created: "2026-07-20T08:15:00Z", receiver_name: "Soliq qo'mitasi", status: "Imzo kutilmoqda", amount: 4500000000 },
      ],
      total: 1,
    })],
  ["GET", /^\/bank\/companies\/[^/]+\/subscriptions$/, (res) => json(res, bankSubscriptions)],
  ["GET", /^\/bank\/companies\/[^/]+\/subscriptions\/[^/]+\/config$/, (res) =>
    json(res, { sub_id: 1, config: { reg_date: "2026-01-10", sync_period_days: 30, auto_scrape_account_numbers: ["20208000900123456001"] } })],
  ["GET", /^\/bank\/companies\/[^/]+\/subscriptions\/[^/]+\/scrape-status$/, (res) =>
    json(res, { sub_id: 1, in_progress: [] })],
  ["GET", /^\/bank\/companies\/[^/]+\/connect\/banks$/, (res) =>
    json(res, { results: [{ id: "kapital", name: "AKB Kapitalbank", bank_type: "kapital", is_connected: true, otp_length: 6 }] })],
  ["GET", /^\/bank\/companies\/[^/]+\/(employees|payrolls|salary-applications)$/, (res) =>
    json(res, { items: [], total: 0, no_kapitalbank: false })],
  ["GET", /^\/bank\/companies\/[^/]+\/cashflow\/reports$/, (res) => json(res, { report: null })],

  // ======================= DOCUMENTS (ЭСФ) ======================
  ["GET", /^\/documents\/companies\/[^/]+\/documents$/, (res, { q }) => {
    const owner = q.get("owner");
    const status = q.get("status");
    const search = (q.get("search") || "").toLowerCase();
    let items = documents.filter((d) => d.status_group !== "deleted");
    if (owner != null && owner !== "") items = items.filter((d) => String(d.owner) === owner);
    if (status) items = items.filter((d) => d.status_group === status);
    if (search) items = items.filter((d) => JSON.stringify(d).toLowerCase().includes(search));
    const skip = Number(q.get("skip") || 0);
    const limit = Number(q.get("limit") || 20);
    return json(res, { items: items.slice(skip, skip + limit), total: items.length, skip, limit });
  }],
  ["GET", /^\/documents\/companies\/[^/]+\/documents\/counts$/, (res, { q }) => {
    const owner = q.get("owner");
    const scoped = documents.filter((d) => (owner != null && owner !== "" ? String(d.owner) === owner : true));
    const by = (g) => scoped.filter((d) => d.status_group === g).length;
    return json(res, { all: scoped.length, pending: by("pending"), signed: by("signed"), rejected: by("rejected"), deleted: by("deleted"), draft: by("draft") });
  }],
  ["GET", /^\/documents\/companies\/[^/]+\/documents\/by-pk\/([^/]+)$/, (res, { m }) => {
    const d = documents.find((x) => x.id === m[1]);
    if (!d) return json(res, { detail: "not found" }, 404);
    return json(res, {
      ...d,
      created: d.doc_date + "T09:00:00Z", updated: d.doc_date + "T09:00:00Z",
      seller_account: "20208000900123456001",
      vat_breakdown: [{ rate: "12", without_vat: d.total_without_vat, vat_sum: d.total_vat_sum, with_vat: d.total_with_vat, count: (docProducts[d.id] ?? []).length || 1 }],
      seller: d.owner === 1 ? parties["305123456"] : parties[d.partner_tin],
      buyer: d.owner === 1 ? parties[d.partner_tin] : parties["305123456"],
      products: docProducts[d.id] ?? [
        { ord_no: 1, name: "Tovar / xizmat", catalog_code: "06810001001000000", barcode: null, count: 1, summa: d.total_without_vat, delivery_sum: d.total_without_vat, vat_rate: "12", vat_sum: d.total_vat_sum, delivery_sum_with_vat: d.total_with_vat },
      ],
      // Файл документа как изображение — правая панель покажет его на белом фоне.
      raw: { image_path: `${d.doc_id}.png`, json_data: { filename: `${d.name ?? "ЭСФ"}.png` } },
    });
  }],
  ["GET", /^\/documents\/companies\/[^/]+\/documents\/([^/]+)\/html$/, (res, { m }) => {
    const d = documents.find((x) => x.doc_id === m[1]);
    const fmt = (n) => Number(n ?? 0).toLocaleString("ru-RU");
    const sellerNm = d?.owner === 1 ? 'OOO "BARAKA SAVDO"' : (d?.partner_name ?? "—");
    const sellerInn = d?.owner === 1 ? "305123456" : (d?.partner_tin ?? "—");
    const buyerNm = d?.owner === 1 ? (d?.partner_name ?? "—") : 'OOO "BARAKA SAVDO"';
    const buyerInn = d?.owner === 1 ? (d?.partner_tin ?? "—") : "305123456";
    const rows = (docProducts[d?.id] ?? [])
      .map((p) => `<tr>
        <td class="c-mut">${p.ord_no}</td>
        <td>${p.name}</td>
        <td class="r">${fmt(p.count)}</td>
        <td class="r">${fmt(p.summa)}</td>
        <td class="r c-b">${fmt(p.delivery_sum_with_vat)}</td>
      </tr>`)
      .join("");
    return json(res, {
      // HTML-фрагмент (не целый документ): рендерится инлайн в DOM приложения,
      // стили заскоуплены под .esf-doc, чтобы не влиять на остальной интерфейс.
      html: `<style>
        .esf-doc{font-family:'Wix Madefor Display',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#101010;font-size:14px}
        .esf-doc .head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:20px;border-bottom:1px solid #EDEEF0}
        .esf-doc h1{font-size:22px;font-weight:700;margin:0}
        .esf-doc .sub{margin-top:4px;color:#83888B;font-size:13px}
        .esf-doc .tag{flex-shrink:0;font-size:12px;font-weight:600;color:#7000FF;background:#F8F2FF;border-radius:100px;padding:6px 14px}
        .esf-doc .parties{display:flex;gap:16px;margin:22px 0}
        .esf-doc .party{flex:1;background:#F8F2FF;border-radius:14px;padding:16px}
        .esf-doc .party .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#7000FF;font-weight:600}
        .esf-doc .party .nm{margin-top:6px;font-size:15px;font-weight:600}
        .esf-doc .party .inn{margin-top:2px;font-size:13px;color:#83888B}
        .esf-doc table{width:100%;border-collapse:collapse;font-size:13px}
        .esf-doc thead th{background:#F8F2FF;color:#7000FF;font-weight:600;text-align:left;padding:12px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
        .esf-doc thead th:first-child{border-radius:10px 0 0 10px}
        .esf-doc thead th:last-child{border-radius:0 10px 10px 0}
        .esf-doc thead th:nth-child(n+3){text-align:right}
        .esf-doc tbody td{padding:12px 14px;border-bottom:1px solid #EDEEF0}
        .esf-doc td.r{text-align:right}
        .esf-doc td.c-mut{color:#83888B}
        .esf-doc td.c-b{font-weight:600}
        .esf-doc .total{margin-top:20px;display:flex;justify-content:flex-end}
        .esf-doc .total .box{background:#7000FF;color:#fff;border-radius:14px;padding:14px 22px;font-size:16px;font-weight:700;text-align:right}
        .esf-doc .total .box span{display:block;font-size:11px;font-weight:500;opacity:.8;text-transform:uppercase;letter-spacing:.03em;margin-bottom:2px}
      </style>
      <div class="esf-doc">
        <div class="head">
          <div>
            <h1>Счёт-фактура ${d?.name?.replace("Schet-faktura ", "") ?? ""}</h1>
            <div class="sub">от ${d?.doc_date ?? ""} · договор № ${d?.contract_number ?? "—"} от ${d?.contract_date ?? "—"}</div>
          </div>
          <div class="tag">Электронная счёт-фактура</div>
        </div>
        <div class="parties">
          <div class="party"><div class="lbl">Поставщик</div><div class="nm">${sellerNm}</div><div class="inn">ИНН ${sellerInn}</div></div>
          <div class="party"><div class="lbl">Покупатель</div><div class="nm">${buyerNm}</div><div class="inn">ИНН ${buyerInn}</div></div>
        </div>
        <table>
          <thead><tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Цена</th><th>Сумма с НДС</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#83888B">—</td></tr>'}</tbody>
        </table>
        <div class="total"><div class="box"><span>Итого с НДС</span>${fmt(d?.total_with_vat)} сум</div></div>
      </div>`,
    });
  }],
  ["GET", /^\/documents\/companies\/[^/]+\/documents\/[^/]+\/pdf$/, (res) => {
    // Страница документа как PNG (белый фон, без тёмной подложки PDF-плагина).
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    return res.end(ESF_PNG);
  }],
  ["GET", /^\/documents\/companies\/[^/]+\/documents\/bank-transactions$/, (res) =>
    json(res, {
      available: true, reason: null,
      contract: [{ direction: "in", document_date: "2026-07-20", payment_number: "417", counterparty: 'OOO "ALFA SAVDO"', payment_purpose: "Shartnoma №45 bo'yicha to'lov", amount: 12500000 }],
      partner: [{ direction: "in", document_date: "2026-07-17", payment_number: "312", counterparty: 'OOO "BETA LOGISTIC"', payment_purpose: "Avans to'lovi", amount: 32200000 }],
    })],
  ["GET", /^\/documents\/companies\/[^/]+\/documents\/stats\/invoice-flow$/, (res) => {
    const bucket = (docs) => ({
      count: docs.length,
      amount: docs.reduce((a, d) => a + d.total_sum, 0),
      counterparties: docs.map((d) => ({ name: d.partner_name, tin: d.partner_tin, count: 1, amount: d.total_sum })),
      top_counterparty: docs[0] ? { name: docs[0].partner_name, tin: docs[0].partner_tin, count: 1, amount: docs[0].total_sum } : undefined,
    });
    const pend = documents.filter((d) => d.status_group === "pending");
    const sign = documents.filter((d) => d.status_group === "signed");
    return json(res, {
      period: { date_from: "2026-07-01", date_to: "2026-07-20", timezone: "Asia/Tashkent" },
      totals: bucket(documents),
      invoice_002: {
        pending: { owner_0: bucket(pend.filter((d) => d.owner === 0)), owner_1: bucket(pend.filter((d) => d.owner === 1)), total: bucket(pend) },
        signed: { owner_0: bucket(sign.filter((d) => d.owner === 0)), owner_1: bucket(sign.filter((d) => d.owner === 1)), total: bucket(sign) },
      },
    });
  }],
  ["POST", /^\/documents\/companies\/[^/]+\/documents\/by-pk\/([^/]+)\/sign$/, (res, { m }) => {
    const d = documents.find((x) => x.id === m[1]);
    if (d) { d.status_group = "signed"; d.doc_status = 30; d.signed_date = "2026-07-20"; d.can_sign = false; }
    return json(res, { ok: true });
  }],
  ["POST", /^\/documents\/companies\/[^/]+\/documents\/by-pk\/([^/]+)\/reject$/, (res, { m }) => {
    const d = documents.find((x) => x.id === m[1]);
    if (d) { d.status_group = "rejected"; d.doc_status = 40; d.can_sign = false; }
    return json(res, { ok: true });
  }],
  ["POST", /^\/documents\/companies\/[^/]+\/documents\/by-pk\/([^/]+)\/delete$/, (res, { m }) => {
    const d = documents.find((x) => x.id === m[1]);
    if (d) { d.status_group = "deleted"; d.can_delete = false; }
    return json(res, { ok: true });
  }],
  ["GET", /^\/documents\/companies\/[^/]+\/tin\/(\d+)$/, (res, { m }) =>
    json(res, parties[m[1]] ?? { tin: m[1], found: false })],
  ["GET", /^\/documents\/companies\/[^/]+\/mxik$/, (res, { q }) => {
    const s = (q.get("q") || "").toLowerCase();
    return json(res, mxikItems.filter((x) => !s || x.name.toLowerCase().includes(s) || x.code.includes(s)));
  }],
  ["POST", /^\/documents\/companies\/[^/]+\/documents\/create$/, (res, { body }) => {
    const id = `d${documents.length + 1}`;
    const signed = !!body.sign_after_create;
    documents.unshift({
      id, doc_id: `new${documents.length + 1}`, doctype: body.doc_type ?? "002",
      doc_status: signed ? 30 : 10, status_group: signed ? "signed" : "draft",
      owner: 1, doc_date: "2026-07-20", signed_date: signed ? "2026-07-20" : null,
      name: `Schet-faktura №${body.factura_no ?? "yangi"}`,
      contract_number: body.contract_no ?? null, contract_date: body.contract_date ?? null,
      partner_tin: body.buyer?.tin ?? null, partner_name: body.buyer?.name ?? null, partner_phone: null,
      users_tax_id: "305123456",
      total_sum: (body.products ?? []).reduce((a, p) => a + p.count * p.price, 0),
      has_vat: true, has_marks: false, has_lgota: false, doc_rating: "LOW",
      can_sign: !signed, can_delete: !signed,
    });
    return json(res, { ok: true, doc_id: id, signed, message: null });
  }],

  // ============================ SOLIQ ===========================
  ["GET", "/soliq/tax-grid", (res, { q }) =>
    json(res, {
      period: { year: Number(q.get("year") || 2026), month: Number(q.get("month") || 7) },
      source: "snapshot",
      rows: [taxGridRow],
      count: 1,
      synced_at: "2026-07-20T06:00:00Z",
    })],
  ["GET", "/soliq/admin/sync-status", (res) =>
    json(res, {
      sync_name: "tax-grid", mode: "snapshot",
      last_run: { started_at: "2026-07-20T06:00:00Z", finished_at: "2026-07-20T06:02:10Z", status: "ok", rows_attempted: 1, rows_synced: 1, period: { year: 2026, month: 7 } },
      snapshot_age_seconds: 3600, is_stale: false,
    })],
  ["GET", /^\/soliq\/companies\/[^/]+\/cheques$/, (res, { q }) => {
    const term = q.get("terminal_id");
    let items = cheques;
    if (term) items = items.filter((c) => c.terminal_id === term);
    return json(res, {
      items,
      summary: {
        count: items.length,
        cash: items.filter((c) => !c.raw.is_refund).reduce((a, c) => a + c.cash_total, 0),
        card: items.filter((c) => !c.raw.is_refund).reduce((a, c) => a + c.card_total, 0),
        vat: items.reduce((a, c) => a + c.vat_total, 0),
        gross: items.filter((c) => !c.raw.is_refund).reduce((a, c) => a + c.total, 0),
      },
      count: items.length, page: 1, size: 50,
    });
  }],
  ["GET", /^\/soliq\/companies\/[^/]+\/cheques\/summary$/, (res) =>
    json(res, { count: 4, cash: 2450000, card: 6000000, vat: 905357.14, gross: 7250000 })],
  ["GET", /^\/soliq\/companies\/[^/]+\/cheques\/daily-totals$/, (res) =>
    json(res, {
      days: [
        { date: "2026-07-14", count: 11, cash_total: 3100000, card_total: 5200000, vat_total: 996428.57, total: 8300000 },
        { date: "2026-07-15", count: 9, cash_total: 2700000, card_total: 4100000, vat_total: 816071.43, total: 6800000 },
        { date: "2026-07-16", count: 14, cash_total: 4200000, card_total: 6900000, vat_total: 1332142.86, total: 11100000 },
        { date: "2026-07-17", count: 8, cash_total: 1900000, card_total: 5300000, vat_total: 864285.71, total: 7200000 },
        { date: "2026-07-18", count: 12, cash_total: 3800000, card_total: 5750000, vat_total: 1145535.71, total: 9550000 },
        { date: "2026-07-19", count: 6, cash_total: 1500000, card_total: 3200000, vat_total: 564285.71, total: 4700000 },
        // Из ТЗ (JSON 8): остаток по кассе на конец дня — 8 450 000.
        { date: "2026-07-20", count: 4, cash_total: 2450000, card_total: 6000000, vat_total: 905357.14, total: 8450000 },
      ],
    })],
  ["GET", /^\/soliq\/companies\/[^/]+\/cheques\/terminals$/, (res) => json(res, chequeTerminals)],
  ["GET", /^\/soliq\/companies\/[^/]+\/cheques\/report-terminals$/, (res) => json(res, chequeTerminals)],
  ["GET", /^\/soliq\/companies\/[^/]+\/cheques\/bank-deposit$/, (res) =>
    json(res, { data: { deposit: 5850000, commission: 150000 } })],
  ["GET", /^\/soliq\/companies\/[^/]+\/cheques\/has-expired-terminal$/, (res) =>
    json(res, { data: { has_expired: false } })],
  ["POST", /^\/soliq\/companies\/[^/]+\/cheques\/sync$/, (res) =>
    json(res, { matched_subscriptions: 1 })],
  ["GET", /^\/soliq\/companies\/[^/]+\/overview$/, (res) =>
    json(res, {
      company_id: 1, inn: "305123456", type: "mchj",
      profile: { name: 'OOO "BARAKA SAVDO"', director: "Karimov Aziz Baxtiyorovich", address: "Toshkent sh., Chilonzor t., Bunyodkor 12", tax_mode: "Aylanma soliq" },
      stats: { debt: 37550000, advance: 0, reports: 3, payments: 2 },
    })],
  ["GET", /^\/soliq\/companies\/[^/]+\/reports$/, (res) =>
    json(res, { items: soliqReports, count: soliqReports.length, page: 1, per_page: 50 })],
  ["GET", /^\/soliq\/companies\/[^/]+\/payments$/, (res) =>
    json(res, { items: soliqPayments, count: soliqPayments.length, page: 1, per_page: 50 })],
  ["GET", /^\/soliq\/companies\/[^/]+\/reconciliation$/, (res) => json(res, { items: [], totals: {} })],
  ["GET", /^\/soliq\/companies\/[^/]+\/mails$/, (res) => json(res, { items: [], count: 0, skip: 0, limit: 50 })],
  ["GET", /^\/soliq\/companies\/[^/]+\/mails\/categories$/, (res) =>
    json(res, { subscription_found: false, categories: {}, totals: { total: 0, incoming: 0, outgoing: 0 } })],
  ["GET", "/soliq/mails/stats/by-company", (res) => json(res, { items: [] })],
  ["GET", "/soliq/ijara-grid", (res) => json(res, { grid: [] })],

  // --- soliq: сверка (регионы + доступные даты — ответы голыми массивами) ---
  ["GET", /^\/soliq\/companies\/[^/]+\/reconciliation\/regions$/, (res) =>
    json(res, [
      { ns10_code: 26, ns11_code: 262, ns10_name: "Toshkent sh.", ns11_name: "Chilonzor tumani", is_default: true },
      { ns10_code: 26, ns11_code: 266, ns10_name: "Toshkent sh.", ns11_name: "Yakkasaroy tumani", is_default: false },
    ])],
  ["GET", /^\/soliq\/companies\/[^/]+\/reconciliation\/available-dates$/, (res) =>
    json(res, [
      { request_date: "2026-07-19" }, { request_date: "2026-06-30" }, { request_date: "2026-03-31" },
    ])],

  // --- soliq: платежи по налогам ---
  ["GET", /^\/soliq\/companies\/[^/]+\/tax-payments$/, (res) =>
    json(res, {
      items: [
        { id: 1, payment_num: "000512", payment_date: "2026-07-18", summa: 23400000, state: 4, state_name: "O'tkazilgan", na2_code: "NDS01", na2_name: { ru: "НДС", uz_latn: "QQS" }, name_b: "Soliq qo'mitasi" },
        { id: 2, payment_num: "000509", payment_date: "2026-07-15", summa: 4200000, state: 4, state_name: "O'tkazilgan", na2_code: "SOC01", na2_name: { ru: "Социальный налог", uz_latn: "Ijtimoiy soliq" }, name_b: "Soliq qo'mitasi" },
        { id: 3, payment_num: "000501", payment_date: "2026-07-10", summa: 9800000, state: 0, state_name: "Yangi", na2_code: "PRF01", na2_name: { ru: "Налог на прибыль", uz_latn: "Foyda solig'i" }, name_b: "Soliq qo'mitasi" },
      ],
      total: 3,
    })],
  ["GET", /^\/soliq\/tax-payments\/([^/]+)\/history$/, (res) =>
    json(res, { items: [
      { date: "2026-07-18", state_name: "O'tkazilgan" },
      { date: "2026-07-17", state_name: "Bankka yuborilgan" },
      { date: "2026-07-17", state_name: "Yangi" },
    ] })],
  ["GET", /^\/soliq\/tax-payments\/([^/]+)\/download$/, (res) =>
    json(res, { url: "https://my.soliq.uz/mock/payment.pdf" })],
  ["GET", /^\/soliq\/tax-payments\/([^/]+)$/, (res, { m }) =>
    json(res, {
      id: m[1], payment_num: "000512", payment_date: "2026-07-18",
      state_name: "O'tkazilgan", summa: 23400000, summa_text: "Yigirma uch million to'rt yuz ming so'm",
      na2_code: "NDS01", na2_name: "QQS", purpose: "QQS to'lovi 2026-06 uchun",
      name_a: 'OOO "BARAKA SAVDO"', tin_a: "305123456", account_a: "20208000900123456001", bank_a: "AKB Kapitalbank", branch_a: "00450",
      name_b: "Soliq qo'mitasi", tin_b: "201122334", account_b: "23402000300100001010", bank_b: "G'aznachilik", branch_b: "00014",
      raw: { state: 4 },
    })],

  // --- soliq: одно письмо + скачивание файла ---
  ["GET", /^\/soliq\/mails\/files\/([^/]+)\/presigned$/, (res) =>
    json(res, { url: "https://my.soliq.uz/mock/mail-file.pdf" })],
  ["GET", /^\/soliq\/mails\/([^/]+)$/, (res, { m }) =>
    json(res, {
      pkey: m[1], mail_type: "requirement", title: "Soliq talabnomasi №4411",
      direction: "in", registered_num: "4411", registered_at: "2026-07-15T09:00:00Z",
      deadlined_at: "2026-07-25T00:00:00Z", status_name: "O'qilmagan",
      files: [{ id: "f1", name: "talabnoma.pdf", file_type: "pdf" }],
      history: [{ at: "2026-07-15T09:00:00Z", state_name: "Yuborilgan" }],
      raw: { body: "Soliq to'g'risidagi talabnoma matni..." },
    })],

  // ======================= ONEC (1С: дебиторка/кредиторка) ======================
  ["GET", /^\/onec\/companies\/[^/]+\/summary$/, (res) =>
    json(res, {
      ...onecTotals,
      counterpartyCount: onecCounterparties.length,
      lastSyncedAt: "2026-07-20T09:15:00Z", syncStale: false, connected: true,
    })],
  ["GET", /^\/onec\/companies\/[^/]+\/counterparties$/, (res) =>
    json(res, {
      connected: true, hasPaymentData: true, ...onecTotals,
      counterparties: onecCounterparties,
    })],
  ["GET", /^\/onec\/companies\/[^/]+\/counterparties\/([^/]+)\/detail$/, (res, { m }) => {
    const key = decodeURIComponent(m[1]);
    const cp = onecCounterparties.find((c) => c.inn === key || c.code === key) ?? onecCounterparties[0];
    const isDebtor = cp.balance >= 0;
    return json(res, {
      connected: true, hasPaymentData: true,
      name: cp.name, inn: cp.inn, code: cp.code, contract: cp.contract,
      period: { from: "2026-01-01", to: "2026-07-20" },
      openingBalance: 0, closingBalance: cp.balance,
      turnovers: { totalDebit: cp.debit, totalCredit: cp.credit },
      transactions: isDebtor
        ? [
            { date: "2026-03-05", documentType: "Реализация", documentNumber: "РТ-000045", contract: cp.contract, debit: cp.debit, credit: 0 },
            { date: "2026-05-18", documentType: "Реализация", documentNumber: "РТ-000112", contract: cp.contract, debit: 0, credit: 0 },
          ]
        : [
            { date: "2026-04-22", documentType: "Поступление товаров", documentNumber: "ПТ-000210", contract: cp.contract, debit: 0, credit: cp.credit },
          ],
    });
  }],

  // ============================ KONTRAGENT ============================
  ["GET", "/kontragent/lookup", (res, { q }) => {
    const inn = q.get("inn") || "305123456";
    return json(res, {
      inn, name: 'OOO "BARAKA SAVDO"', legal_form: "MChJ",
      address: "Toshkent sh., Chilonzor t., Bunyodkor 12", director: "Karimov Aziz Baxtiyorovich",
      tax_mode: "QQS to'lovchi", is_vat_payer: true, debt: 0, advance: null,
      bank_account: "20208000900123456001", mfo: "00450", bank_name: "AKB Kapitalbank",
      company_id: inn, sync_completed: true, last_sync_at: "2026-07-20T08:00:00Z",
      gnk_verified: true, soliq_found: true, sources: ["gnk", "soliq"],
    });
  }],

  // ===================== ХИДЕР-ЧИПЫ ДАШБОРДА ======================
  ["GET", "/dashboard/attendance/me", (res) =>
    json(res, { matched: true, date: "2026-07-21", arrived: "08:55", status: "present", lateMinutes: 0, scheduleStart: "09:00", checkOut: null })],
  ["GET", "/messenger/chats", (res) =>
    json(res, {
      items: [
        { id: "c1", kind: "dm", title: "Alisher Rahimov", avatar: null, members: [], lastMessage: null, unread: 3, muted: false, pinned: false, updatedAt: "2026-07-21T07:40:00Z" },
        { id: "c2", kind: "group", title: "Buxgalteriya", avatar: null, members: [], lastMessage: null, unread: 2, muted: false, pinned: false, updatedAt: "2026-07-20T15:10:00Z" },
      ],
    })],
  ["GET", /^\/calendar\/[^/]+\/events$/, (res) =>
    json(res, {
      items: [
        { id: "e1", baseId: null, calendarId: "cal1", color: "#7000FF", title: "Сдача отчёта по налогу с оборота", description: "", location: "", startsAt: "2026-07-22T04:00:00Z", endsAt: "2026-07-22T05:00:00Z", allDay: false, repeat: "", invites: [], source: "local" },
        { id: "e2", baseId: null, calendarId: "cal1", color: "#09B849", title: "Подписание ЭСФ", description: "", location: "Ofis", startsAt: "2026-07-24T06:00:00Z", endsAt: "2026-07-24T06:30:00Z", allDay: false, repeat: "", invites: [], source: "local" },
      ],
    })],
];

/**
 * Диспетчер мока — общий для Vite dev-плагина и Vercel serverless-функции.
 * Возвращает true, если запрос обработан (это путь /api/v2/*), иначе false.
 */
export async function handleApi(req, res) {
  if (!req.url?.startsWith("/api/v2/")) return false;
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname.slice("/api/v2".length) || "/";
  const body = ["POST", "PUT", "PATCH"].includes(req.method)
    ? await readBody(req)
    : {};

  for (const [method, matcher, handler] of routes) {
    if (method !== req.method) continue;
    const m = typeof matcher === "string"
      ? (matcher === path ? [path] : null)
      : path.match(matcher);
    if (m) { handler(res, { body, m, q: url.searchParams }); return true; }
  }

  // Несматченный путь: лог + безопасный пустой ответ (не 401!).
  console.log(`[mock-api] MISS ${req.method} ${path}${url.search}`);
  if (req.method === "GET") json(res, { items: [], count: 0, total: 0 });
  else json(res, { ok: true });
  return true;
}

export function mockApi() {
  return {
    name: "mock-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handleApi(req, res);
        if (!handled) next();
      });
    },
  };
}
