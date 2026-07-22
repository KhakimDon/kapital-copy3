// Тестовые данные модулей пилота P26015: bank, documents (ЭСФ), soliq.
// ВАЖНО: банк считает деньги в ТИЙИНАХ (UI делит на 100), чеки — в сумах.

// ---- BANK ------------------------------------------------------------------
// Счета из примера ТЗ (JSON 2): UZS 152 340 500,75 и USD 12 500,00.
export const bankAccounts = {
  items: [
    {
      id: "acc-1", number: "20208000900123456001", short_name: "Asosiy hisob",
      name: 'OOO "BARAKA SAVDO"', branch: "00450", branch_name: "Kapitalbank, Chilonzor filiali",
      bank_name: "AKB Kapitalbank", bank_type: "kapital", mfo: "00450",
      current_balance: 15234050075, state: 1, currency: "UZS",
      k2_debt: 0,
    },
    {
      id: "acc-2", number: "20208840900123456840", short_name: "Valyuta hisobi",
      name: 'OOO "BARAKA SAVDO"', branch: "00450", branch_name: "Kapitalbank, Chilonzor filiali",
      bank_name: "AKB Kapitalbank", bank_type: "kapital", mfo: "00450",
      current_balance: 1250000, state: 1, currency: "USD",
      k2_debt: 0,
    },
  ],
  summary: { total_balance: 15234050075, accounts: 2, banks: 1 },
};

export const bankTransactions = [
  { id: "tx-1", documentDate: "2026-07-20", amount: 1250000000, direction: "in", bank_name: "AKB Kapitalbank", account_number: "20208000900123456001", paymentNumber: "417", senderName: 'OOO "ALFA SAVDO"', senderInn: "302118844", senderAccountNumber: "20208000800302118844", senderBranch: "00901", receiverName: 'OOO "BARAKA SAVDO"', receiverInnOrPinfl: "305123456", receiverAccountNumber: "20208000900123456001", receiverBranch: "00450", paymentPurpose: "Tovar yetkazib berish uchun to'lov, shartnoma №45", documentTypeName: "To'lov topshirig'i", stateName: "O'tkazilgan", source: "kapital", created_at: "2026-07-20T09:14:00Z" },
  { id: "tx-2", documentDate: "2026-07-19", amount: 834000000, direction: "out", bank_name: "AKB Kapitalbank", account_number: "20208000900123456001", paymentNumber: "418", senderName: 'OOO "BARAKA SAVDO"', senderInn: "305123456", senderAccountNumber: "20208000900123456001", senderBranch: "00450", receiverName: 'OOO "GAMMA TRADE"', receiverInnOrPinfl: "300551209", receiverAccountNumber: "20208000700300551209", receiverBranch: "01018", paymentPurpose: "Xomashyo uchun to'lov, hisob-faktura №2026-118", documentTypeName: "To'lov topshirig'i", stateName: "O'tkazilgan", source: "kapital", created_at: "2026-07-19T15:40:00Z" },
  { id: "tx-3", documentDate: "2026-07-18", amount: 4500000000, direction: "out", bank_name: "AKB Kapitalbank", account_number: "20208000900123456001", paymentNumber: "419", senderName: 'OOO "BARAKA SAVDO"', senderInn: "305123456", senderAccountNumber: "20208000900123456001", senderBranch: "00450", receiverName: "Soliq qo'mitasi", receiverInnOrPinfl: "201122334", receiverAccountNumber: "23402000300100001010", receiverBranch: "00014", paymentPurpose: "QQS to'lovi 2026 yil 2-chorak uchun", documentTypeName: "To'lov topshirig'i", stateName: "O'tkazilgan", source: "kapital", created_at: "2026-07-18T11:05:00Z" },
  { id: "tx-4", documentDate: "2026-07-17", amount: 3220000000, direction: "in", bank_name: "AKB Kapitalbank", account_number: "20208000900123456001", paymentNumber: "312", senderName: 'OOO "BETA LOGISTIC"', senderInn: "301994571", senderAccountNumber: "20208000600301994571", senderBranch: "00777", receiverName: 'OOO "BARAKA SAVDO"', receiverInnOrPinfl: "305123456", receiverAccountNumber: "20208000900123456001", receiverBranch: "00450", paymentPurpose: "Logistika xizmatlari uchun avans to'lovi", documentTypeName: "To'lov topshirig'i", stateName: "O'tkazilgan", source: "kapital", created_at: "2026-07-17T10:22:00Z" },
  { id: "tx-5", documentDate: "2026-07-15", amount: 7800000000, direction: "out", bank_name: "AKB Kapitalbank", account_number: "20208000900123456001", paymentNumber: "415", senderName: 'OOO "BARAKA SAVDO"', senderInn: "305123456", senderAccountNumber: "20208000900123456001", senderBranch: "00450", receiverName: "Xodimlar ish haqi (payroll)", receiverInnOrPinfl: null, receiverAccountNumber: null, receiverBranch: null, paymentPurpose: "2026 yil iyun oyi uchun ish haqi", documentTypeName: "Ish haqi vedomosti", stateName: "O'tkazilgan", source: "kapital", created_at: "2026-07-15T09:00:00Z" },
];

export const bankSubscriptions = {
  items: [
    { id: "sub-1", bank_id: "kapital", bank_name: "AKB Kapitalbank", bank_type: "kapital", login: "baraka_savdo", status: "active", login_required: false, is_deleted: false, last_sync_at: "2026-07-20T08:30:00Z" },
  ],
};

// ---- DOCUMENTS (ЭСФ) -------------------------------------------------------
// owner: 0 = kiruvchi (нам выставили), 1 = chiquvchi (мы выставили).
// status_group: draft | pending | signed | rejected | deleted.
function esf(o) {
  return {
    doctype: "002", has_vat: true, has_marks: false, has_lgota: false,
    doc_rating: "LOW", partner_type: null, partner_criteria: null, agent: null,
    can_sign: false, can_delete: false, users_tax_id: "305123456", ...o,
  };
}
export const documents = [
  esf({ id: "d1", doc_id: "a1f2e3", owner: 1, doc_status: 30, status_group: "signed", doc_date: "2026-07-18", signed_date: "2026-07-18", name: "Schet-faktura №1042", contract_number: "45", contract_date: "2026-01-15", partner_tin: "302118844", partner_name: 'OOO "ALFA SAVDO"', partner_phone: "+998712001122", total_sum: 54000000, total_without_vat: 48214285.71, total_vat_sum: 5785714.29, total_with_vat: 54000000 }),
  esf({ id: "d2", doc_id: "b2c3d4", owner: 1, doc_status: 20, status_group: "pending", doc_date: "2026-07-17", signed_date: null, name: "Schet-faktura №1041", contract_number: "46", contract_date: "2026-02-01", partner_tin: "301994571", partner_name: 'OOO "BETA LOGISTIC"', partner_phone: "+998712334455", total_sum: 32200000, total_without_vat: 28750000, total_vat_sum: 3450000, total_with_vat: 32200000, can_delete: true }),
  esf({ id: "d3", doc_id: "c3d4e5", owner: 0, doc_status: 20, status_group: "pending", doc_date: "2026-07-16", signed_date: null, name: "Schet-faktura №577", contract_number: "12", contract_date: "2026-03-10", partner_tin: "300551209", partner_name: 'OOO "GAMMA TRADE"', partner_phone: "+998712556677", total_sum: 45000000, total_without_vat: 40178571.43, total_vat_sum: 4821428.57, total_with_vat: 45000000, can_sign: true }),
  esf({ id: "d4", doc_id: "d4e5f6", owner: 1, doc_status: 10, status_group: "draft", doc_date: "2026-07-20", signed_date: null, name: "Schet-faktura №1043 (qoralama)", contract_number: "47", contract_date: "2026-07-01", partner_tin: "304772130", partner_name: 'OOO "DELTA GROUP"', partner_phone: null, total_sum: 16350000, total_without_vat: 14598214.29, total_vat_sum: 1751785.71, total_with_vat: 16350000, can_sign: true, can_delete: true }),
  esf({ id: "d5", doc_id: "e5f6a7", owner: 0, doc_status: 40, status_group: "rejected", doc_date: "2026-07-10", signed_date: null, name: "Schet-faktura №561", contract_number: "9", contract_date: "2026-01-20", partner_tin: "301994571", partner_name: 'OOO "BETA LOGISTIC"', partner_phone: "+998712334455", total_sum: 7300000, total_without_vat: 6517857.14, total_vat_sum: 782142.86, total_with_vat: 7300000 }),
];

export const docProducts = {
  d1: [
    { ord_no: 1, name: "Qurilish materiallari (sement M400)", catalog_code: "06810001001000000", barcode: null, count: 200, summa: 220000, delivery_sum: 44000000, vat_rate: "12", vat_sum: 5280000, delivery_sum_with_vat: 49280000 },
    { ord_no: 2, name: "Yetkazib berish xizmati", catalog_code: "10711001001000000", barcode: null, count: 1, summa: 4214285.71, delivery_sum: 4214285.71, vat_rate: "12", vat_sum: 505714.29, delivery_sum_with_vat: 4720000 },
  ],
  d3: [
    { ord_no: 1, name: "Ofis mebeli (stol-stul komplekti)", catalog_code: "09403001001000000", barcode: null, count: 15, summa: 2678571.43, delivery_sum: 40178571.43, vat_rate: "12", vat_sum: 4821428.57, delivery_sum_with_vat: 45000000 },
  ],
};

export const parties = {
  "305123456": { tin: "305123456", name: 'OOO "BARAKA SAVDO"', address: "Toshkent sh., Chilonzor t., Bunyodkor ko'ch. 12", account: "20208000900123456001", bank_id: "00450", director: "Karimov Aziz", accountant: "Rahimova Nilufar", vat_reg_code: "326050123456", vat_reg_status: "active", oked: "46901", is_yatt: false, found: true, source: "didox" },
  "302118844": { tin: "302118844", name: 'OOO "ALFA SAVDO"', address: "Toshkent sh., Yakkasaroy t., Bobur ko'ch. 7", account: "20208000800302118844", bank_id: "00901", director: "Aliyev Sardor", accountant: "Karimova Dilnoza", vat_reg_code: "326050302118", vat_reg_status: "active", oked: "46901", is_yatt: false, found: true, source: "didox" },
  "301994571": { tin: "301994571", name: 'OOO "BETA LOGISTIC"', address: "Toshkent sh., Sergeli t., Yangi Sergeli ko'ch. 21", account: "20208000600301994571", bank_id: "00777", director: "Tursunov Bekzod", accountant: "Nazarova Gulnora", vat_reg_code: "326050301994", vat_reg_status: "active", oked: "52291", is_yatt: false, found: true, source: "didox" },
  "300551209": { tin: "300551209", name: 'OOO "GAMMA TRADE"', address: "Toshkent sh., Mirzo Ulug'bek t., Buyuk Ipak Yo'li 115", account: "20208000700300551209", bank_id: "01018", director: "Yusupov Jahongir", accountant: "Islomova Nodira", vat_reg_code: "326050300551", vat_reg_status: "active", oked: "46190", is_yatt: false, found: true, source: "didox" },
  "304772130": { tin: "304772130", name: 'OOO "DELTA GROUP"', address: "Samarqand sh., Amir Temur ko'ch. 3", account: "20208000500304772130", bank_id: "00450", director: "Rashidov Otabek", accountant: null, vat_reg_code: null, vat_reg_status: null, oked: "41200", is_yatt: false, found: true, source: "didox" },
};

export const mxikItems = [
  { code: "06810001001000000", name: "Sement (portlandtsement M400)", group: "Qurilish materiallari", units: "kg", packages: [{ code: "1554", name: "qop", name_ru: "мешок" }] },
  { code: "09403001001000000", name: "Ofis mebeli", group: "Mebel", units: "dona", packages: [{ code: "1500", name: "dona", name_ru: "штука" }] },
  { code: "10711001001000000", name: "Yuk tashish xizmatlari", group: "Xizmatlar", units: "xizmat", packages: [{ code: "1", name: "xizmat", name_ru: "услуга" }] },
];

// ---- SOLIQ ----------------------------------------------------------------
// Налоги из примера ТЗ (JSON 10): НДС 23,4М (+пеня 150К), прибыль 9,8М, соц 4,2М.
export const taxGridRow = {
  id: 1, inn: "305123456", company_uuid: "comp-1", company_name: 'OOO "BARAKA SAVDO"',
  debt: 37550000, advance: 0, last_recon_date: "2026-07-19",
  rating: "AA", rating_points: 92, rating_color: "green",
  tax_mode_name: { ru: "Налог с оборота", uz_latn: "Aylanma soliq" },
  is_vat_payer: true, vat_certificate_active: true,
  unread_mail_count: 1, total_mail_count: 14,
  ytd_turnover: 2412750000, turnover_limit: 10000000000, turnover_percent: 24.1,
  reports: [
    { name: "Aylanma soliq hisoboti", status: "accepted", period: "2026-06", region: "Chilonzor", sent_date: "2026-07-10", report_number: "R-2026-4411" },
    { name: "QQS deklaratsiyasi", status: "submitted", period: "2026-06", region: "Chilonzor", sent_date: "2026-07-18", report_number: "R-2026-4520" },
  ],
  payments: [
    { na2_name: { ru: "Налог на добавленную стоимость", uz_latn: "QQS" }, na2_code: "NDS01", summa: 23400000, state: 2, state_name: "Qarzdorlik", payment_date: null },
    { na2_name: { ru: "Налог на прибыль", uz_latn: "Foyda solig'i" }, na2_code: "PRF01", summa: 9800000, state: 2, state_name: "Qarzdorlik", payment_date: null },
    { na2_name: { ru: "Социальный налог", uz_latn: "Ijtimoiy soliq" }, na2_code: "SOC01", summa: 4200000, state: 2, state_name: "Qarzdorlik", payment_date: null },
  ],
  regions: null,
  bank_kartoteka_2: 0, didox_docs_count: 148,
  synced_at: "2026-07-20T06:00:00Z", is_stale: false,
};

// Касса из примера ТЗ (JSON 8): остаток на конец дня 8 450 000 сум.
export const cheques = [
  { id: "chq-1", payment_no: "000411", terminal_id: "EP000000000101", payment_date: "2026-07-20T09:05:00", check_type: "sale", check_sub_type: null, tin: "305123456", total: 1250000, cash_total: 1250000, card_total: 0, vat_total: 133928.57, raw: { is_refund: false, details: [{ name: "Sement M400, 50kg", productCode: "06810001001000000", packageCode: "1554", barCode: null, amount: 5, price: 250000, vat: 26785.71, vatPercent: 12 }] } },
  { id: "chq-2", payment_no: "000412", terminal_id: "EP000000000101", payment_date: "2026-07-20T11:32:00", check_type: "sale", check_sub_type: null, tin: "305123456", total: 3400000, cash_total: 0, card_total: 3400000, vat_total: 364285.71, raw: { is_refund: false, details: [{ name: "Ofis stoli", productCode: "09403001001000000", packageCode: "1500", barCode: null, amount: 2, price: 1700000, vat: 182142.86, vatPercent: 12 }] } },
  { id: "chq-3", payment_no: "000413", terminal_id: "EP000000000102", payment_date: "2026-07-20T13:47:00", check_type: "sale", check_sub_type: "qr", tin: "305123456", total: 2600000, cash_total: 0, card_total: 2600000, vat_total: 278571.43, raw: { is_refund: false, details: [{ name: "Yetkazib berish xizmati", productCode: "10711001001000000", packageCode: "1", barCode: null, amount: 1, price: 2600000, vat: 278571.43, vatPercent: 12 }] } },
  { id: "chq-4", payment_no: "000414", terminal_id: "EP000000000101", payment_date: "2026-07-20T16:10:00", check_type: "refund", check_sub_type: null, tin: "305123456", total: 1200000, cash_total: 1200000, card_total: 0, vat_total: 128571.43, raw: { is_refund: true, details: [{ name: "Sement M400, 50kg (vozvrat)", productCode: "06810001001000000", packageCode: "1554", barCode: null, amount: 4, price: 300000, vat: 32142.86, vatPercent: 12 }] } },
];

export const chequeTerminals = {
  terminals: [
    { terminal_id: "EP000000000101", sale_point_name: "BARAKA SAVDO — do'kon №1", sale_point_address: "Toshkent sh., Chilonzor t., Bunyodkor 12" },
    { terminal_id: "EP000000000102", sale_point_name: "BARAKA SAVDO — ombor-kassa", sale_point_address: "Toshkent sh., Chilonzor t., Bunyodkor 12A" },
  ],
};

// Отчёты по компании: пилотный отчёт по налогу с оборота (ТЗ, таблица 12).
export const soliqReports = [
  { id: 1, name: "Aylanma soliq bo'yicha hisobot (расчёт)", year: 2026, period: "08", sent_at: "2026-07-19T14:20:00Z", status: "Отправлен / На проверке", raw: null },
  { id: 2, name: "Aylanma soliq bo'yicha hisobot", year: 2026, period: "06", sent_at: "2026-07-10T10:00:00Z", status: "Принят", raw: null },
  { id: 3, name: "QQS deklaratsiyasi", year: 2026, period: "06", sent_at: "2026-07-18T09:30:00Z", status: "Принят", raw: null },
];

export const soliqPayments = [
  { id: 1, date: "2026-07-18", payer: 'OOO "BARAKA SAVDO"', recipient: "Soliq qo'mitasi", purpose: "QQS to'lovi 2026-06", amount: 23400000, state_name: "O'tkazilgan", na2_code: "NDS01", na2_name: "QQS", raw: null },
  { id: 2, date: "2026-07-15", payer: 'OOO "BARAKA SAVDO"', recipient: "Soliq qo'mitasi", purpose: "Ijtimoiy soliq 2026-06", amount: 4200000, state_name: "O'tkazilgan", na2_code: "SOC01", na2_name: "Ijtimoiy soliq", raw: null },
];
