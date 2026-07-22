import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Search, ShieldCheck, ShieldAlert, ShieldX, History, X, Building2, AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useLookup, errDetail, statusOf, loadRecent, pushRecent, removeRecent,
  type Verification, type RecentItem, type KontragentStatus,
} from "./api";

const dim = <span className="text-muted-foreground">—</span>;

function Money({ v }: { v: number | null }) {
  const { t } = useTranslation();
  if (v === null) return dim;
  return <span>{Number(v).toLocaleString("ru-RU")} {t("modules.kontragent.units.som")}</span>;
}

const STATUS_META: Record<
  KontragentStatus,
  { labelKey: string; variant: "success" | "warning" | "danger"; Icon: typeof ShieldCheck }
> = {
  verified: { labelKey: "modules.kontragent.status.verified", variant: "success", Icon: ShieldCheck },
  partial: { labelKey: "modules.kontragent.status.partial", variant: "warning", Icon: ShieldAlert },
  notfound: { labelKey: "modules.kontragent.status.notfound", variant: "danger", Icon: ShieldX },
};

function StatusBadge({ status }: { status: KontragentStatus }) {
  const { t } = useTranslation();
  const { labelKey, variant, Icon } = STATUS_META[status];
  return (
    <Badge variant={variant} className="gap-1 px-2 py-1 text-xs">
      <Icon className="size-3.5" />
      {t(labelKey)}
    </Badge>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2.5 last:border-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="w-48 shrink-0 text-sm text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

export function KontragentPage() {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [inn, setInn] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  useEffect(() => setRecent(loadRecent()), []);

  const q = useLookup(inn);
  const result = q.data;

  // Persist successful lookups to history.
  useEffect(() => {
    if (!result || !inn) return;
    setRecent(
      pushRecent({ inn: result.inn || inn, name: result.name || inn, status: statusOf(result) }),
    );
  }, [result, inn]);

  const valid = useMemo(() => /^\d{9}$|^\d{14}$/.test(text.trim()), [text]);

  const submit = (val?: string) => {
    const v = (val ?? text).trim();
    if (!/^\d{9}$|^\d{14}$/.test(v)) return;
    setText(v);
    setInn(v);
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-border pb-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ShieldCheck className="size-6 text-primary" /> {t("modules.kontragent.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("modules.kontragent.subtitle")}
        </p>
      </div>

      {/* Search */}
      <div className="mx-auto flex w-full max-w-xl items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 14))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={t("modules.kontragent.searchPlaceholder")}
            inputMode="numeric"
            className="pl-9"
          />
        </div>
        <Button onClick={() => submit()} disabled={!valid || q.isFetching}>
          {q.isFetching ? t("modules.kontragent.checking") : t("modules.kontragent.check")}
        </Button>
      </div>

      {/* Loading */}
      {q.isFetching && (
        <Card className="mx-auto w-full max-w-2xl">
          <CardHeader className="gap-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {!q.isFetching && q.isError && inn && (
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 rounded-md border border-destructive/40 bg-destructive/15 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {errDetail(q.error)}
        </div>
      )}

      {/* Result */}
      {!q.isFetching && result && <Result v={result} />}

      {/* Empty state */}
      {!q.isFetching && !inn && (
        <div className="mx-auto w-full max-w-2xl rounded-lg border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          <Building2 className="mx-auto mb-2 size-7 opacity-60" />
          {t("modules.kontragent.empty")}
        </div>
      )}

      {/* Recent */}
      {recent.length > 0 && (
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <History className="size-4" /> {t("modules.kontragent.recent")}
          </div>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {recent.map((r) => (
              <div key={r.inn} className="flex items-center gap-3 px-3 py-2">
                <Button
                  variant="ghost"
                  className="flex h-auto min-w-0 flex-1 items-center justify-start gap-3 p-0 text-left font-normal hover:bg-transparent"
                  onClick={() => submit(r.inn)}
                >
                  <span className="font-mono text-xs text-muted-foreground">{r.inn}</span>
                  <span className="truncate text-sm text-foreground">{r.name || dim}</span>
                </Button>
                <StatusBadge status={r.status} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  title={t("modules.kontragent.actions.delete")}
                  onClick={() => setRecent(removeRecent(r.inn))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Result({ v }: { v: Verification }) {
  const { t } = useTranslation();
  const status = statusOf(v);
  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleString("ru-RU") : dim;

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold leading-tight">
              {v.name || <span className="text-muted-foreground">{t("modules.kontragent.unnamed")}</span>}
            </div>
            <div className="mt-1 font-mono text-sm text-muted-foreground">INN: {v.inn}</div>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="profil">
          <TabsList className="flex w-full">
            <TabsTrigger value="profil" className="flex-1">{t("modules.kontragent.tabs.profile")}</TabsTrigger>
            <TabsTrigger value="soliq" className="flex-1">{t("modules.kontragent.tabs.tax")}</TabsTrigger>
            <TabsTrigger value="bank" className="flex-1">{t("modules.kontragent.tabs.bank")}</TabsTrigger>
            <TabsTrigger value="tasdiq" className="flex-1">{t("modules.kontragent.tabs.confirmation")}</TabsTrigger>
          </TabsList>

          <TabsContent value="profil">
            <Row label={t("modules.kontragent.fields.name")}>{v.name || dim}</Row>
            <Row label={t("modules.kontragent.fields.legalForm")}>{v.legal_form || dim}</Row>
            <Row label={t("modules.kontragent.fields.address")}>{v.address || dim}</Row>
            <Row label={t("modules.kontragent.fields.director")}>{v.director || dim}</Row>
          </TabsContent>

          <TabsContent value="soliq">
            <Row label={t("modules.kontragent.fields.taxMode")}>{v.tax_mode || dim}</Row>
            <Row label={t("modules.kontragent.fields.vatPayer")}>
              <Badge variant={v.is_vat_payer ? "info" : "muted"}>
                {v.is_vat_payer ? t("modules.kontragent.yesNo.yes") : t("modules.kontragent.yesNo.no")}
              </Badge>
            </Row>
            <Row label={t("modules.kontragent.fields.debt")}><Money v={v.debt} /></Row>
            <Row label={t("modules.kontragent.fields.advance")}><Money v={v.advance} /></Row>
            <Row label={t("modules.kontragent.fields.soliqConnection")}>
              <Badge variant={v.soliq_found ? "success" : "muted"}>
                {v.soliq_found ? t("modules.kontragent.soliq.found") : t("modules.kontragent.soliq.notFound")}
              </Badge>
            </Row>
          </TabsContent>

          <TabsContent value="bank">
            <Row label={t("modules.kontragent.fields.bankAccount")}>
              {v.bank_account ? <span className="font-mono">{v.bank_account}</span> : dim}
            </Row>
            <Row label={t("modules.kontragent.fields.mfo")}>{v.mfo ? <span className="font-mono">{v.mfo}</span> : dim}</Row>
            <Row label={t("modules.kontragent.fields.bankName")}>{v.bank_name || dim}</Row>
          </TabsContent>

          <TabsContent value="tasdiq">
            <Row label={t("modules.kontragent.fields.gnkStatus")}>
              <Badge variant={v.gnk_verified ? "success" : "danger"}>
                {v.gnk_verified ? t("modules.kontragent.gnk.verified") : t("modules.kontragent.gnk.notVerified")}
              </Badge>
            </Row>
            <Row label={t("modules.kontragent.fields.taxSync")}>
              <Badge variant={v.sync_completed ? "success" : "warning"}>
                {v.sync_completed ? t("modules.kontragent.sync.done") : t("modules.kontragent.sync.pending")}
              </Badge>
            </Row>
            <Row label={t("modules.kontragent.fields.lastSync")}>{fmtDate(v.last_sync_at)}</Row>
            <Row label={t("modules.kontragent.fields.companyId")}>
              {v.company_id ? <span className="font-mono text-xs">{v.company_id}</span> : dim}
            </Row>
            <Row label={t("modules.kontragent.fields.sources")}>
              <div className="flex flex-wrap gap-1.5">
                {v.sources.length ? (
                  v.sources.map((s) => (
                    <Badge key={s} variant="muted" className="uppercase">{s}</Badge>
                  ))
                ) : (
                  dim
                )}
              </div>
            </Row>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
