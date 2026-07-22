/**
 * UserGrantsEditor — reusable per-user RBAC grant editor.
 *
 * Loads a user's grants (`useUserGrants`), lets an admin add/remove grant rows
 * (a role Select keyed by `role.key` + scope tenant-wide OR a company
 * multi-select), and saves the whole set via `useSetUserGrants`. A tenant row
 * flattens to one GrantInput; a company row expands to one GrantInput per
 * selected company (deduped).
 *
 * Extracted from access-page's old Assignments tab so the same editor can live
 * inside the KM user page.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, ChevronsUpDown, Building2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/shared/lib/utils";

import {
  useRoles, useUserGrants, useSetUserGrants,
  type Role, type GrantInput,
} from "@/shared/api/authz";
import { useKeyCompanies } from "@/modules/keys/api";
import { apiErrorText } from "@/modules/keys/admin-dialogs";

// One editable grant row. A tenant row expands to a single GrantInput; a company
// row expands to one GrantInput per selected company.
type GrantRow = {
  key: string;
  roleKey: string | null;
  scope: "tenant" | "company";
  companyIds: number[];
};

let rowSeq = 0;
const newRow = (): GrantRow => ({ key: `r${rowSeq++}`, roleKey: null, scope: "tenant", companyIds: [] });

export function UserGrantsEditor({ userId }: { userId: number }) {
  const { t } = useTranslation();
  const { data: roles } = useRoles();
  const { data: grants, isLoading: grantsLoading } = useUserGrants(userId);
  const setGrants = useSetUserGrants();

  const [rows, setRows] = useState<GrantRow[]>([]);
  const [seededFor, setSeededFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed the editable rows once the user's grants load.
  useEffect(() => {
    if (grants && seededFor !== userId) {
      setRows(grants.map((g) => ({
        key: `g${g.id}`,
        roleKey: g.role_key,
        scope: g.scope_type,
        companyIds: g.scope_type === "company" && g.company_id != null ? [g.company_id] : [],
      })));
      setSeededFor(userId);
    }
  }, [userId, grants, seededFor]);

  const updateRow = (key: string, patch: Partial<GrantRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const save = async () => {
    setError(null);
    setSaved(false);
    // Flatten rows → GrantInput[], expanding company rows per company + dedup.
    const seen = new Set<string>();
    const grantInputs: GrantInput[] = [];
    for (const r of rows) {
      if (r.roleKey == null) continue;
      if (r.scope === "tenant") {
        const sig = `${r.roleKey}:tenant`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        grantInputs.push({ role_key: r.roleKey, scope_type: "tenant" });
      } else {
        for (const cid of r.companyIds) {
          const sig = `${r.roleKey}:company:${cid}`;
          if (seen.has(sig)) continue;
          seen.add(sig);
          grantInputs.push({ role_key: r.roleKey, scope_type: "company", company_id: cid });
        }
      }
    }
    try {
      await setGrants.mutateAsync({ userId, grants: grantInputs });
      setSaved(true);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t("modules.access.assignments.title")}</h2>
        <Button size="sm" variant="outline" onClick={() => setRows((p) => [...p, newRow()])}>
          <Plus className="size-4 mr-1" />{t("modules.access.assignments.addGrant")}
        </Button>
      </div>

      {grantsLoading && seededFor !== userId ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {t("modules.access.assignments.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <GrantRowEditor
              key={r.key}
              row={r}
              roles={roles ?? []}
              onChange={(patch) => updateRow(r.key, patch)}
              onRemove={() => removeRow(r.key)}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive break-words">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={setGrants.isPending}>
          {t("modules.access.assignments.save")}
        </Button>
        {saved && !setGrants.isPending && (
          <span className="text-sm text-success">{t("common.saved", { defaultValue: "Saqlandi ✓" })}</span>
        )}
      </div>
    </div>
  );
}

function GrantRowEditor({
  row, roles, onChange, onRemove,
}: {
  row: GrantRow;
  roles: Role[];
  onChange: (patch: Partial<GrantRow>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
      <Select value={row.roleKey ?? ""} onValueChange={(v) => onChange({ roleKey: v })}>
        <SelectTrigger className="w-48"><SelectValue placeholder={t("modules.access.assignments.role")} /></SelectTrigger>
        <SelectContent>
          {roles.map((r) => (
            <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={row.scope} onValueChange={(v) => onChange({ scope: v as GrantRow["scope"], companyIds: [] })}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tenant">{t("modules.access.assignments.tenantWide")}</SelectItem>
          <SelectItem value="company">{t("modules.access.assignments.companies")}</SelectItem>
        </SelectContent>
      </Select>

      {row.scope === "company" && (
        <CompanyMultiSelect value={row.companyIds} onChange={(companyIds) => onChange({ companyIds })} />
      )}

      <Button size="icon" variant="ghost" className="size-8 text-destructive ml-auto" title={t("common.delete")} onClick={onRemove}>
        <X className="size-4" />
      </Button>
    </div>
  );
}

function CompanyMultiSelect({
  value, onChange,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const { t } = useTranslation();
  const { data: companies } = useKeyCompanies();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selectedSet = useMemo(() => new Set(value), [value]);
  const term = q.trim().toLowerCase();
  const rows = (companies ?? []).filter((c) => !term || [c.name, c.inn].filter(Boolean).some((v) => v.toLowerCase().includes(term)));

  const toggle = (id: number) =>
    onChange(selectedSet.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ(""); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-52 justify-between font-normal">
          <span className={cn("truncate flex items-center gap-1.5", value.length === 0 && "text-muted-foreground")}>
            <Building2 className="size-4 shrink-0" />
            {value.length === 0 ? t("modules.access.assignments.companiesPlaceholder") : `${value.length}`}
          </span>
          <ChevronsUpDown className="size-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-72" align="start">
        <div className="p-2 border-b border-border">
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="h-8" />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {rows.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("common.notFound")}</div>
          )}
          {rows.map((c) => (
            <label key={c.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/60">
              <Checkbox className="size-4" checked={selectedSet.has(c.id)} onCheckedChange={() => toggle(c.id)} />
              <span className="min-w-0 truncate">
                {c.name || `#${c.id}`}
                {c.inn && <span className="text-xs text-muted-foreground font-mono"> · {c.inn}</span>}
              </span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
