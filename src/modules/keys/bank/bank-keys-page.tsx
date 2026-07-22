/**
 * BankKeysPanel — the "Bank kalitlari" tab body inside KmAdminPage
 * (/settings/bank-keys shares the KM header + top-level tab strip).
 *
 * The KM bank-keys surface (es-key-connector `bankkeys` app) rebuilt natively:
 *   Bank keys  — inventory of physical ePass2003 tokens (never files: the key
 *                material stays on the chip; PIN is entered on the connector)
 *   Connectors — the machines running Aiba Connector that host those tokens
 *                and execute activation commands over the relay tunnel
 *
 * Sub-tab state lives in `?view=` (NOT `?tab=` — that one belongs to the
 * parent KmAdminPage when opened via /keys/admin?tab=bank-keys).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cable, Link2, Pencil, Plus, RefreshCw, Trash2, Usb, Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import { useUrlState } from "@/shared/hooks/use-url-state";
import { ConfirmDialog, apiErrorText } from "../admin-dialogs";
import { BankKeyFormDialog, BankKeyUsersDialog, ConnectorFormDialog } from "./bank-dialogs";
import {
  useActivateBankKey, useBankKeys, useConnectors, useDeleteBankKey,
  useDeleteConnector, useRefreshInventory,
  type BankKeyInfo, type BankKeyStatus, type ConnectorInfo,
} from "./api";

const VIEWS = ["keys", "connectors"] as const;
type ViewKey = (typeof VIEWS)[number];

const VIEW_ICON: Record<ViewKey, React.ComponentType<{ className?: string }>> = {
  keys: Usb, connectors: Cable,
};

const STATUS_VARIANT: Record<BankKeyStatus, "success" | "warning" | "danger" | "muted"> = {
  active: "success",
  needs_activation: "warning",
  needs_reactivation: "warning",
  offline: "muted",
  error: "danger",
};

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtSeen(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Show only the CN from an X.500 subject DN; plain names pass through. */
function cnOf(name: string): string {
  for (const part of name.split(",")) {
    const p = part.trim();
    if (/^cn=/i.test(p)) return p.slice(3).trim().replace(/^"|"$/g, "");
  }
  return name;
}

export function BankKeysPanel() {
  const { t } = useTranslation();
  const [viewRaw, setViewRaw] = useUrlState("view", "keys");
  const view = (VIEWS.includes(viewRaw as ViewKey) ? viewRaw : "keys") as ViewKey;

  return (
    <div className="space-y-4 animate-in fade-in-0 duration-300">
      <p className="text-sm text-muted-foreground">{t("modules.keys.bankKeys.subtitle")}</p>

      <Tabs value={view} onValueChange={setViewRaw}>
        <TabsList>
          {VIEWS.map((k) => {
            const Icon = VIEW_ICON[k];
            return (
              <TabsTrigger key={k} value={k} className="gap-1.5">
                <Icon className="size-4" />{t(`modules.keys.bankKeys.tabs.${k}`)}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="keys" className="mt-4"><BankKeysTab /></TabsContent>
        <TabsContent value="connectors" className="mt-4"><ConnectorsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Bank keys tab ────────────────────────────────────────────────────────────

function BankKeysTab() {
  const { t } = useTranslation();
  const { data, isLoading, isFetching, refetch } = useBankKeys();
  const activate = useActivateBankKey();
  const refreshInv = useRefreshInventory();
  const del = useDeleteBankKey();
  const [q, setQ] = useState("");
  const [editKey, setEditKey] = useState<BankKeyInfo | null>(null);
  const [usersKey, setUsersKey] = useState<BankKeyInfo | null>(null);
  const [delTarget, setDelTarget] = useState<BankKeyInfo | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const term = q.trim().toLowerCase();
  const rows = (data?.items ?? []).filter((k) =>
    !term || [k.name, k.bank_name, k.chip_serial, k.company_name, k.connector_name]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(term)));

  const doActivate = async (k: BankKeyInfo) => {
    try {
      await activate.mutateAsync(k.id);
      setFlash(t("modules.keys.bankKeys.activateSent"));
    } catch (e) { setFlash(apiErrorText(e)); }
  };

  const doRefreshInventory = async () => {
    try {
      await refreshInv.mutateAsync();
      setFlash(t("modules.keys.bankKeys.refreshSent"));
    } catch (e) { setFlash(apiErrorText(e)); }
  };

  const doDelete = async () => {
    if (!delTarget) return;
    setDelErr(null);
    try { await del.mutateAsync(delTarget.id); setDelTarget(null); }
    catch (e) { setDelErr(apiErrorText(e)); }
  };

  return (
    <div className="space-y-3">
      {data?.demo && <DemoBanner />}

      <div className="flex items-center gap-2 flex-wrap">
        <Input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t("modules.keys.bankKeys.searchKeys")} className="w-64" />
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        <span className="text-xs text-muted-foreground">{t("modules.keys.admin.count", { count: rows.length })}</span>
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={doRefreshInventory} disabled={refreshInv.isPending}>
            <RefreshCw className={`size-4 mr-1 ${refreshInv.isPending ? "animate-spin" : ""}`} />
            {t("modules.keys.bankKeys.actions.refreshInventory")}
          </Button>
        </div>
      </div>

      {flash && <FlashLine text={flash} onClose={() => setFlash(null)} />}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("modules.keys.bankKeys.columns.name")}</TableHead>
            <TableHead>{t("modules.keys.bankKeys.columns.company")}</TableHead>
            <TableHead className="text-center">{t("modules.keys.bankKeys.columns.status")}</TableHead>
            <TableHead>{t("modules.keys.bankKeys.columns.connector")}</TableHead>
            <TableHead>{t("modules.keys.bankKeys.columns.chip")}</TableHead>
            <TableHead>{t("modules.keys.bankKeys.columns.lastSeen")}</TableHead>
            <TableHead className="w-44 text-right">{t("modules.keys.admin.actions")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <SkeletonRows widths={["w-36", "w-32", "w-24", "w-28", "w-24", "w-20", "w-28"]} aligns={[undefined, undefined, "center", undefined, undefined, undefined, "right"]} />}
            {!isLoading && rows.length === 0 && (
              <EmptyRow cols={7} icon={Usb} text={t("modules.keys.bankKeys.noKeys")} onClear={term ? () => setQ("") : undefined} />
            )}
            {!isLoading && rows.map((k, i) => (
              <TableRow
                key={k.id}
                className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              >
                <TableCell>
                  <div className="font-medium">{k.name ? cnOf(k.name) : "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {k.bank_name || "—"}{k.signing_stack && <span className="font-mono"> · {k.signing_stack}</span>}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {k.company_name ?? <span className="text-muted-foreground">{t("modules.keys.admin.noCompany")}</span>}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={STATUS_VARIANT[k.activation_status]}>
                    {t(`modules.keys.bankKeys.status.${k.activation_status}`, { defaultValue: k.activation_status })}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {k.connector_name ? (
                    <span className="inline-flex items-center gap-1.5">
                      <OnlineDot online={k.connector_online} />
                      {k.connector_name}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{k.chip_serial || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtSeen(k.last_seen_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm" variant="outline"
                      className="h-8 px-2 gap-1 text-xs text-primary"
                      disabled={activate.isPending || !k.connector_online}
                      title={k.connector_online
                        ? t("modules.keys.bankKeys.actions.activate")
                        : t("modules.keys.bankKeys.status.offline")}
                      onClick={() => doActivate(k)}
                    >
                      <Zap className="size-3.5" />
                      <span>{t("modules.keys.bankKeys.actions.activate")}</span>
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8" title={t("modules.keys.admin.keyUsers")}
                      onClick={() => setUsersKey(k)}><Link2 className="size-4" /></Button>
                    <Button size="icon" variant="ghost" className="size-8" title={t("common.edit")}
                      onClick={() => setEditKey(k)}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" className="size-8 text-destructive" title={t("common.delete")}
                      onClick={() => { setDelErr(null); setDelTarget(k); }}><Trash2 className="size-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">{t("modules.keys.bankKeys.pinNote")}</p>

      <BankKeyFormDialog open={editKey != null} onOpenChange={(v) => !v && setEditKey(null)} bankKey={editKey} />
      <BankKeyUsersDialog open={usersKey != null} onOpenChange={(v) => !v && setUsersKey(null)} bankKey={usersKey} />
      <ConfirmDialog open={delTarget != null} onOpenChange={(v) => !v && setDelTarget(null)}
        title={t("modules.keys.bankKeys.dialogs.deleteKey")}
        description={t("modules.keys.bankKeys.dialogs.deleteKeyHint", { name: delTarget?.name ?? "" })}
        onConfirm={doDelete} busy={del.isPending} error={delErr} />
    </div>
  );
}

// ── Connectors tab ───────────────────────────────────────────────────────────

function ConnectorsTab() {
  const { t } = useTranslation();
  const { data, isLoading, isFetching, refetch } = useConnectors();
  const del = useDeleteConnector();
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConnectorInfo | null>(null);
  const [delTarget, setDelTarget] = useState<ConnectorInfo | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);

  const term = q.trim().toLowerCase();
  const rows = (data?.items ?? []).filter((c) =>
    !term || [c.name, c.client_username, c.note]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(term)));

  const doDelete = async () => {
    if (!delTarget) return;
    setDelErr(null);
    try { await del.mutateAsync(delTarget.id); setDelTarget(null); }
    catch (e) { setDelErr(apiErrorText(e)); }
  };

  return (
    <div className="space-y-3">
      {data?.demo && <DemoBanner />}

      <div className="flex items-center gap-2 flex-wrap">
        <Input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t("modules.keys.bankKeys.searchConnectors")} className="w-64" />
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        <span className="text-xs text-muted-foreground">{t("modules.keys.admin.count", { count: rows.length })}</span>
        <div className="ml-auto">
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="size-4 mr-1" />{t("modules.keys.bankKeys.actions.addConnector")}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("modules.keys.bankKeys.columns.name")}</TableHead>
            <TableHead>{t("modules.keys.bankKeys.columns.client")}</TableHead>
            <TableHead className="text-center">{t("modules.keys.bankKeys.columns.status")}</TableHead>
            <TableHead className="text-center">{t("modules.keys.bankKeys.columns.keysCount")}</TableHead>
            <TableHead>{t("modules.keys.bankKeys.columns.note")}</TableHead>
            <TableHead>{t("modules.keys.bankKeys.columns.lastSeen")}</TableHead>
            <TableHead>{t("modules.keys.bankKeys.columns.created")}</TableHead>
            <TableHead className="w-24 text-right">{t("modules.keys.admin.actions")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <SkeletonRows widths={["w-36", "w-24", "w-20", "w-10", "w-28", "w-24", "w-20", "w-16"]} aligns={[undefined, undefined, "center", "center", undefined, undefined, undefined, "right"]} />}
            {!isLoading && rows.length === 0 && (
              <EmptyRow cols={8} icon={Cable} text={t("modules.keys.bankKeys.noConnectors")} onClear={term ? () => setQ("") : undefined} />
            )}
            {!isLoading && rows.map((c, i) => (
              <TableRow
                key={c.id}
                className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              >
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.client_username || "—"}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={c.is_online ? "success" : "muted"} className="gap-1.5">
                    <OnlineDot online={c.is_online} />
                    {c.is_online
                      ? t("modules.keys.bankKeys.online")
                      : t("modules.keys.bankKeys.offlineLabel")}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={c.keys_count > 0 ? "info" : "muted"} className="gap-1">
                    <Usb className="size-3" />{c.keys_count}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-48 truncate">{c.note || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtSeen(c.last_seen_at)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDate(c.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="size-8" title={t("common.edit")}
                      onClick={() => { setEditing(c); setFormOpen(true); }}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" className="size-8 text-destructive" title={t("common.delete")}
                      onClick={() => { setDelErr(null); setDelTarget(c); }}><Trash2 className="size-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConnectorFormDialog open={formOpen} onOpenChange={setFormOpen} connector={editing} />
      <ConfirmDialog open={delTarget != null} onOpenChange={(v) => !v && setDelTarget(null)}
        title={t("modules.keys.bankKeys.dialogs.deleteConnector")}
        description={t("modules.keys.bankKeys.dialogs.deleteConnectorHint", { name: delTarget?.name ?? "" })}
        onConfirm={doDelete} busy={del.isPending} error={delErr} />
    </div>
  );
}

// ── shared bits (KmAdminPage conventions) ────────────────────────────────────

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span className={`size-2 rounded-full shrink-0 ${online ? "bg-success" : "bg-muted-foreground/40"}`} />
  );
}

function DemoBanner() {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
      {t("modules.keys.bankKeys.demoData")}
    </div>
  );
}

function FlashLine({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground flex items-center justify-between">
      <span>{text}</span>
      <button className="text-muted-foreground hover:text-foreground" onClick={onClose}>×</button>
    </div>
  );
}

function SkeletonRows({ widths, aligns }: { widths: string[]; aligns?: (string | undefined)[] }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
          {widths.map((w, j) => {
            const a = aligns?.[j];
            return (
              <TableCell key={j} className={a === "center" ? "text-center" : a === "right" ? "text-right" : undefined}>
                <Skeleton className={`h-4 ${w} ${a === "center" ? "mx-auto" : a === "right" ? "ml-auto" : ""}`} />
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({
  cols, text, icon: Icon, onClear,
}: {
  cols: number; text: string;
  icon: React.ComponentType<{ className?: string }>;
  onClear?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={cols} className="py-16">
        <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
          <div className="size-14 rounded-full bg-muted grid place-items-center">
            <Icon className="size-7 text-muted-foreground" />
          </div>
          <div className="text-sm font-medium text-foreground">{text}</div>
          {onClear && (
            <Button variant="outline" size="sm" onClick={onClear}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
