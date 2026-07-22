export type BankTransaction = {
  id: string;
  documentDate?: string | null;
  amount?: string | number | null;
  direction?: string | null; // in | out
  bank_name?: string | null;
  account_number?: string | null;
  paymentNumber?: string | null;
  senderName?: string | null;
  senderInn?: string | null;
  senderAccountNumber?: string | null;
  senderBranch?: string | null;
  receiverName?: string | null;
  receiverInnOrPinfl?: string | null;
  receiverAccountNumber?: string | null;
  receiverBranch?: string | null;
  paymentPurpose?: string | null;
  documentTypeName?: string | null;
  stateName?: string | null;
  state?: unknown;
  source?: string | null;
  created_at?: string | null;
};
export type TxPage = { items: BankTransaction[]; total?: number };
export type TxSummary = {
  total_income?: string | number; total_expense?: string | number;
  income_count?: number; expense_count?: number; transactions_count?: number;
};
export type BankAccount = {
  id: string; number?: string | null; short_name?: string | null; name?: string | null;
  custom_name?: string | null; branch?: string | null; branch_name?: string | null;
  bank_name?: string | null; bank_type?: string | null; mfo?: string | null;
  current_balance?: string | number | null;
  state?: unknown; currency?: string | null;
  /// AIBA's account row carries the bank linkage (bank_external_id /
  /// bank_id) but NOT the subscription. UI resolves it from the
  /// subscriptions list (matching on bank_external_id + company) to know
  /// which sub a per-account scrape goes to.
  bank_external_id?: string | null;
  bank_id?: string | null;
  /// Kartoteka №2 (unpaid-orders queue) debt, company-level, repeated on each
  /// Kapitalbank account row by the backend. Null for non-Kapital / not fetched.
  k2_debt?: string | number | null;
};
export type AccountsResp = {
  items: BankAccount[];
  summary: { total_balance?: number; accounts?: number; banks?: number };
};
export type PendingResp = { items: unknown[]; total?: number };

export const acctName = (a: BankAccount) =>
  a.custom_name || a.short_name || a.name || a.number || "—";
export const acctBank = (a: BankAccount) => a.bank_name || a.branch_name || "—";
