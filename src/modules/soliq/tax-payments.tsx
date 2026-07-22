import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUrlNumber, useUrlSearch } from "@/shared/hooks/use-url-state";
import { useCompany } from "@/shared/store/company";
import {
  useTaxPayments, useTaxPaymentDetail, useTaxPaymentHistory,
} from "./api";
import { api } from "@/shared/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Banknote } from "lucide-react";
import { localized } from "./localized";

const PAGE_SIZE = 50;

type TaxPaymentListRow = {
  id?: string | number;
  pkey?: string;
  payment_num?: string;
  payment_date?: string;
  summa?: number;
  state?: number;
  state_name?: string;
  na2_code?: string | number;
  na2_name?: string | Record<string, string>;
  name_b?: string;
};

export function SoliqTaxPaymentsPage() {
  const { t } = useTranslation();
  const company = useCompany((s) => s.current);
  const [searchInput, search, setSearchInput] = useUrlSearch("q");
  const [page, setPage] = useUrlNumber("page", 0);
  const [openId, setOpenId] = useState<string | null>(null);

  const companyId = company?.id ?? null;
  const filters = {
    ...(search && { search }),
    page, size: PAGE_SIZE, skip: page * PAGE_SIZE, limit: PAGE_SIZE,
  };
  const { data, isLoading } = useTaxPayments(companyId, filters);

  if (!company) return <p className="text-muted-foreground">{t("modules.soliq.common.pickCompanyFirst")}</p>;

  const rows: TaxPaymentListRow[] = (data?.items ?? data?.results ?? []) as TaxPaymentListRow[];
  const total = (data?.total as number) ?? rows.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t("modules.soliq.taxPayments.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("modules.soliq.taxPayments.subtitle")}</p>
        </div>
        <Input placeholder={t("modules.soliq.taxPayments.searchPlaceholder")} value={searchInput} className="max-w-xs"
               onChange={(e) => { setSearchInput(e.target.value); setPage(0); }} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="[&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:font-medium hover:bg-transparent">
                <TableHead>{t("modules.soliq.taxPayments.colDocNum")}</TableHead>
                <TableHead>{t("modules.soliq.taxPayments.colPayDate")}</TableHead>
                <TableHead>{t("modules.soliq.taxPayments.colRecipient")}</TableHead>
                <TableHead>{t("modules.soliq.paymentsTab.colTaxType")}</TableHead>
                <TableHead className="text-right">{t("modules.soliq.paymentsTab.colAmount")}</TableHead>
                <TableHead>{t("modules.soliq.taxPayments.colState")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                    <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <Banknote className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{t("modules.soliq.taxPayments.empty")}</div>
                      {search.trim() && (
                        <Button variant="outline" size="sm" onClick={() => { setSearchInput(""); setPage(0); }}>
                          {t("common.clear", { defaultValue: "Tozalash" })}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, i) => (
                  <TableRow key={String(r.id ?? r.pkey)} className="cursor-pointer hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                            style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                            onClick={() => setOpenId(String(r.id ?? r.pkey))}>
                    <TableCell className="tabular-nums text-xs">{r.payment_num ?? "—"}</TableCell>
                    <TableCell className="text-xs">{fmtDate(r.payment_date)}</TableCell>
                    <TableCell className="text-sm max-w-[220px] truncate">{r.name_b ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.na2_code ? <b>{r.na2_code}</b> : null} {localized(r.na2_name) ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(r.summa)}</TableCell>
                    <TableCell><PaymentStateBadge state={r.state} name={r.state_name} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center gap-2 justify-end text-sm">
          <Button variant="outline" size="sm" disabled={page <= 0}
                  onClick={() => setPage(page - 1)}>{t("modules.soliq.pagination.prev")}</Button>
          <span className="text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
          </span>
          <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total}
                  onClick={() => setPage(page + 1)}>{t("modules.soliq.pagination.next")}</Button>
        </div>
      )}

      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader><SheetTitle>{t("modules.soliq.taxPayments.detailTitle")}</SheetTitle></SheetHeader>
          {openId && <TaxPaymentDetail paymentId={openId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TaxPaymentDetail({ paymentId }: { paymentId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useTaxPaymentDetail(paymentId);
  const { data: history } = useTaxPaymentHistory(paymentId);
  const [err, setErr] = useState<string | null>(null);

  const download = async () => {
    setErr(null);
    try {
      const res = await api.get(`/soliq/tax-payments/${paymentId}/download`);
      const url = res.data?.url || res.data?.presigned_url || res.data?.download_url;
      if (url) window.open(url, "_blank");
      else setErr(t("modules.soliq.taxPayments.downloadLinkMissing"));
    } catch (e) {
      setErr(extractErr(e, t));
    }
  };

  const hist = (history?.items ?? history?.history ?? []) as Array<Record<string, unknown>>;

  return (
    <Reveal loading={isLoading} skeleton={<Skeleton className="h-72 w-full mt-4" />}>
    {!data ? null : (
    <div className="space-y-4 mt-4 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <PaymentStateBadge state={data.raw?.state as number} name={data.state_name} />
        <Button variant="outline" size="sm" className="ml-auto" onClick={download}>
          <Download className="size-4 mr-1" /> {t("modules.soliq.actions.download")}
        </Button>
      </div>

      <Section title={t("modules.soliq.taxPayments.sectionMain")}>
        <KV k={t("modules.soliq.taxPayments.colDocNum")} v={data.payment_num} />
        <KV k={t("modules.soliq.taxPayments.fieldDate")} v={fmtDate(data.payment_date)} />
        <KV k={t("modules.soliq.paymentsTab.colAmount")} v={fmtMoney(data.summa)} />
        <KV k={t("modules.soliq.taxPayments.amountText")} v={data.summa_text} />
        <KV k={t("modules.soliq.paymentsTab.colTaxType")} v={`${data.na2_code ?? ""} ${localized(data.na2_name) ?? ""}`} />
        <KV k={t("modules.soliq.taxPayments.fieldPurpose")} v={data.purpose} />
      </Section>

      <Section title={t("modules.soliq.taxPayments.sectionPayer")}>
        <KV k={t("modules.soliq.profileTab.name")} v={data.name_a} />
        <KV k={t("modules.soliq.profileTab.stir")} v={data.tin_a} />
        <KV k={t("modules.soliq.taxPayments.fieldAccount")} v={data.account_a} />
        <KV k={t("modules.soliq.taxPayments.fieldBank")} v={data.bank_a} />
        <KV k={t("modules.soliq.taxPayments.fieldMfo")} v={data.branch_a} />
      </Section>

      <Section title={t("modules.soliq.taxPayments.sectionRecipient")}>
        <KV k={t("modules.soliq.profileTab.name")} v={data.name_b} />
        <KV k={t("modules.soliq.profileTab.stir")} v={data.tin_b} />
        <KV k={t("modules.soliq.taxPayments.fieldAccount")} v={data.account_b} />
        <KV k={t("modules.soliq.taxPayments.fieldBank")} v={data.bank_b} />
        <KV k={t("modules.soliq.taxPayments.fieldMfo")} v={data.branch_b} />
      </Section>

      {hist.length > 0 && (
        <Section title={t("modules.soliq.taxPayments.sectionHistory")}>
          <ol className="relative border-l ml-2 space-y-3 pl-4">
            {hist.map((h, i) => (
              <li key={i} className="text-xs">
                <span className="absolute -left-[5px] mt-1 size-2 rounded-full bg-primary" />
                <div className="text-muted-foreground">
                  {fmtDate((h.date as string) ?? (h.at as string) ?? (h.date_update as string))}
                </div>
                <div>{(h.state_name as string) ?? (h.status as string) ?? "—"}</div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {err}
        </div>
      )}
    </div>
    )}
    </Reveal>
  );
}

function PaymentStateBadge({ state, name }: { state?: number; name?: string }) {
  // 0 new, 2/9 submitted/accepted, 4 paid
  const variant = state === 4 ? "success" : state === 0 ? "info"
    : state === 2 || state === 9 ? "success" : "muted";
  return <Badge variant={variant}>{name ?? "—"}</Badge>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}
function KV({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b py-1 gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right truncate max-w-[60%]">{v ?? "—"}</span>
    </div>
  );
}

function fmtMoney(v?: number | null): string {
  if (v == null) return "—";
  const n = Number(v);
  return isNaN(n) ? "—" : n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}
function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ru-RU");
}
function extractErr(e: unknown, t: (key: string) => string): string {
  const ax = e as { response?: { data?: { detail?: string; error?: string } }; message?: string };
  return ax?.response?.data?.detail || ax?.response?.data?.error || ax?.message || t("modules.soliq.page.errorPrefix");
}
