import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

const base = (companyId: number) => `/onec/companies/${companyId}`;

// ── Types (inline — do not edit shared types) ────────────────────────────────

export type CpStatus =
  | "debtor"
  | "creditor"
  | "customer_advance"
  | "supplier_advance"
  | "settled";

export type Counterparty = {
  name: string;
  inn: string;
  code: string;
  sales: number;
  purchases: number;
  paymentsIn: number;
  paymentsOut: number;
  customerBalance: number;
  supplierBalance: number;
  netBalance: number;
  debit: number;
  credit: number;
  balance: number;
  statuses: CpStatus[];
};

export type CounterpartiesResponse = {
  counterparties: Counterparty[];
  hasPaymentData: boolean;
  creditorCount: number;
  debtorCount: number;
  settledCount: number;
  totalReceivable: number;
  totalPayable: number;
  netPosition: number;
  connected: boolean;
};

export type Summary = {
  totalReceivable: number;
  totalPayable: number;
  counterpartyCount: number;
  lastSyncedAt: string | null;
  syncStale: boolean;
  debtorCount: number;
  creditorCount: number;
  connected: boolean;
};

export type ReconTx = {
  date: string;
  documentType: string;
  documentNumber: string;
  contract: string;
  debit: number;
  credit: number;
};

export type CounterpartyDetail = {
  name: string;
  inn: string;
  code: string;
  contract: string;
  period: { from?: string; to?: string } | null;
  openingBalance: number;
  closingBalance: number;
  turnovers: { totalDebit: number; totalCredit: number };
  transactions: ReconTx[];
  hasPaymentData: boolean;
  connected: boolean;
};

// ── Queries ──────────────────────────────────────────────────────────────────

export function useOnecSummary(companyId: number) {
  return useQuery({
    queryKey: ["onec", "summary", companyId],
    queryFn: async () =>
      (await api.get<Summary>(`${base(companyId)}/summary`)).data,
    enabled: !!companyId,
  });
}

export function useCounterparties(companyId: number) {
  return useQuery({
    queryKey: ["onec", "counterparties", companyId],
    queryFn: async () =>
      (await api.get<CounterpartiesResponse>(`${base(companyId)}/counterparties`))
        .data,
    enabled: !!companyId,
  });
}

export function useCounterpartyDetail(
  companyId: number,
  counterparty: string | null,
  contract?: string | null,
) {
  return useQuery({
    queryKey: ["onec", "detail", companyId, counterparty, contract || ""],
    queryFn: async () =>
      (
        await api.get<CounterpartyDetail>(
          `${base(companyId)}/counterparties/${encodeURIComponent(counterparty!)}/detail`,
          { params: contract ? { contract } : undefined },
        )
      ).data,
    enabled: !!companyId && !!counterparty,
  });
}
