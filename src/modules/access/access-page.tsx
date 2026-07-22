/**
 * AccessAdminPage — the RBAC control panel ("Ruxsatlar").
 *
 * A single admin-only hub (mirrors km-admin-page's ModuleShell layout) with a
 * single section:
 *   roles — list system + custom roles, create/edit/delete custom ones, open
 *           system ones read-only. The editor is the permission matrix.
 *
 * Per-user role assignment now lives INSIDE the KM user page (see
 * `UserGrantsEditor`) — the old Assignments tab was removed.
 *
 * Consumes the RBAC client in `@/shared/api/authz` — no API code lives here.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ShieldCheck, ArrowLeft, Plus, Pencil, Trash2, Eye, Languages,
  ChevronRight, Loader2, Check,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { ModuleShell, type ModuleSection } from "@/components/ui/module-shell";
import { cn } from "@/shared/lib/utils";

import { useMe } from "@/shared/api/me";
import { useUrlState } from "@/shared/hooks/use-url-state";
import { useTabs } from "@/shared/store/tabs";
import {
  useRoles, useDeleteRole, useCatalog,
  useModuleLabels, useSaveModuleLabels,
  type Role, type CatalogModule, type ModuleLabels, type ModuleLabelSet,
} from "@/shared/api/authz";
import { ConfirmDialog, apiErrorText } from "@/modules/keys/admin-dialogs";
import { RoleEditor } from "./role-editor";

const ALL_TABS = ["roles", "labels"] as const;
type TabKey = (typeof ALL_TABS)[number];

const TAB_ICON: Record<TabKey, React.ComponentType<{ className?: string }>> = {
  roles: ShieldCheck,
  labels: Languages,
};

export function AccessAdminPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loc = useLocation();
  const { data: me, isLoading: meLoading } = useMe();
  const isSuper = !!me?.is_superadmin;
  // The `labels` (translations) section is superadmin-only.
  const tabs = (isSuper ? ALL_TABS : ["roles"]) as readonly TabKey[];
  const [tabRaw, setTabRaw] = useUrlState("tab", "roles");
  const tab = (tabs.includes(tabRaw as TabKey) ? tabRaw : "roles") as TabKey;

  // Human tab title, e.g. «Ruxsatlar (Rollar)».
  const setTabTitle = useTabs((s) => s.setTitle);
  useEffect(() => {
    const base = t("modules.access.title", { defaultValue: "Ruxsatlar" });
    const section = t(`modules.access.tabs.${tab}`, { defaultValue: tab });
    setTabTitle(loc.pathname + loc.search, `${base} (${section})`);
  }, [tab, t, loc.pathname, loc.search, setTabTitle]);

  if (meLoading) return <div className="p-6"><Skeleton className="h-8 w-48" /></div>;
  if (!me?.is_admin && !me?.is_superadmin) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3">
        <ShieldCheck className="size-10 mx-auto text-muted-foreground" />
        <h2 className="text-lg font-semibold">{t("modules.access.actions.admin")}</h2>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="size-4 mr-1" />{t("common.back")}
        </Button>
      </div>
    );
  }

  const sections: ModuleSection[] = tabs.map((k) => {
    const Icon = TAB_ICON[k];
    return {
      key: k,
      label: t(`modules.access.tabs.${k}`, { defaultValue: k }),
      icon: <Icon className="size-4 shrink-0" />,
      menuTo: `/settings/access?tab=${k}`,
    };
  });

  return (
    <ModuleShell
      title={t("modules.access.title")}
      icon={
        <span className="flex items-center gap-1.5">
          <button
            onClick={() => navigate("/")}
            title={t("common.back")}
            className="-ml-1 grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>
          <ShieldCheck className="size-6 text-primary" />
        </span>
      }
      subtitle={t(`modules.access.tabs.${tab}`, { defaultValue: tab })}
      sections={sections}
      active={tab}
      onSelect={setTabRaw}
    >
      <div className="animate-in fade-in-0 duration-300">
        {tab === "labels" ? <LabelsSection /> : <RolesSection />}
      </div>
    </ModuleShell>
  );
}

// ── Roles ─────────────────────────────────────────────────────────────────────

function RolesSection() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  // Admins and superadmins can author roles; per-role edit/delete is gated by
  // the backend `editable` flag (own-tenant roles for admins, platform for SA).
  const canCreate = !!(me?.is_admin || me?.is_superadmin);
  const { data: roles, isLoading } = useRoles();
  const del = useDeleteRole();

  const [editing, setEditing] = useState<Role | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [delTarget, setDelTarget] = useState<Role | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);

  const openCreate = () => { setEditing(null); setReadOnly(false); setEditorOpen(true); };
  const openEdit = (r: Role) => { setEditing(r); setReadOnly(false); setEditorOpen(true); };
  const openView = (r: Role) => { setEditing(r); setReadOnly(true); setEditorOpen(true); };

  const doDelete = async () => {
    if (!delTarget) return;
    setDelErr(null);
    try { await del.mutateAsync(delTarget.id); setDelTarget(null); }
    catch (e) { setDelErr(apiErrorText(e)); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-medium text-muted-foreground">{t("modules.access.roles.title")}</h2>
        {canCreate && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1" />{t("modules.access.roles.new")}
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("common.name")}</TableHead>
            <TableHead className="text-center">{t("common.status")}</TableHead>
            <TableHead className="text-center">{t("modules.access.roles.permissionCount")}</TableHead>
            <TableHead className="w-24 text-right">{t("common.actions")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="hover:bg-transparent">
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell className="text-center"><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                <TableCell className="text-center"><Skeleton className="h-4 w-10 mx-auto" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
              </TableRow>
            ))}
            {!isLoading && (roles ?? []).map((r, i) => (
              <TableRow
                key={r.id}
                className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              >
                <TableCell>
                  <div className="font-medium">{r.name}</div>
                  {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                </TableCell>
                <TableCell className="text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant={r.is_system ? "info" : "muted"}>
                        {r.is_system ? t("modules.access.roles.system") : t("modules.access.roles.custom")}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      {r.is_system ? t("modules.access.roles.systemHint") : t("modules.access.roles.customHint")}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="muted">{r.permissions.length}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {r.is_system || !r.editable ? (
                      <Button size="icon" variant="ghost" className="size-8" title={t("modules.access.actions.view")} onClick={() => openView(r)}>
                        <Eye className="size-4" />
                      </Button>
                    ) : (
                      <>
                        <Button size="icon" variant="ghost" className="size-8" title={t("modules.access.roles.edit")} onClick={() => openEdit(r)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-8 text-destructive" title={t("modules.access.roles.delete")} onClick={() => { setDelErr(null); setDelTarget(r); }}>
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && (roles ?? []).length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-16 text-center text-sm text-muted-foreground">
                  {t("common.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <RoleEditor open={editorOpen} onOpenChange={setEditorOpen} role={editing} readOnly={readOnly} />
      <ConfirmDialog
        open={delTarget != null}
        onOpenChange={(v) => !v && setDelTarget(null)}
        title={t("modules.access.roles.delete")}
        description={t("modules.access.roles.deleteConfirm", { name: delTarget?.name ?? "" })}
        onConfirm={doDelete}
        busy={del.isPending}
        error={delErr}
      />
    </div>
  );
}

// ── Labels (translations) ───────────────────────────────────────────────────

const LANGS = ["uz", "ru", "en"] as const;
type Lang = (typeof LANGS)[number];

// Editable draft: a full string grid per module so inputs stay controlled.
type LabelDraft = Record<string, { title: Record<Lang, string>; desc: Record<Lang, string> }>;

const blankSlot = (): { title: Record<Lang, string>; desc: Record<Lang, string> } => ({
  title: { uz: "", ru: "", en: "" },
  desc: { uz: "", ru: "", en: "" },
});

/** Seed a full draft grid from the sparse stored overrides for the given modules. */
function seedDraft(mods: CatalogModule[], stored: ModuleLabels): LabelDraft {
  const draft: LabelDraft = {};
  for (const m of mods) {
    const slot = blankSlot();
    const s = stored[m.slug];
    for (const l of LANGS) {
      slot.title[l] = s?.title?.[l] ?? "";
      slot.desc[l] = s?.desc?.[l] ?? "";
    }
    draft[m.slug] = slot;
  }
  return draft;
}

/** Collapse the draft grid back to the sparse stored shape, pruning empty strings. */
function pruneDraft(draft: LabelDraft): ModuleLabels {
  const out: ModuleLabels = {};
  for (const [slug, slot] of Object.entries(draft)) {
    const set: ModuleLabelSet = {};
    const title: Record<string, string> = {};
    const desc: Record<string, string> = {};
    for (const l of LANGS) {
      const tv = slot.title[l].trim();
      const dv = slot.desc[l].trim();
      if (tv) title[l] = tv;
      if (dv) desc[l] = dv;
    }
    if (Object.keys(title).length) set.title = title;
    if (Object.keys(desc).length) set.desc = desc;
    if (set.title || set.desc) out[slug] = set;
  }
  return out;
}

function LabelsSection() {
  const { t } = useTranslation();
  const { data: catalog, isLoading: catLoading } = useCatalog();
  const { data: stored, isLoading: labelsLoading } = useModuleLabels();
  const save = useSaveModuleLabels();

  const [draft, setDraft] = useState<LabelDraft>({});
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(false);

  const loading = catLoading || labelsLoading;

  // (Re)seed the draft whenever the catalog or stored overrides load/change.
  useEffect(() => {
    if (!catalog) return;
    setDraft(seedDraft(catalog, stored ?? {}));
  }, [catalog, stored]);

  const setField = (slug: string, kind: "title" | "desc", lang: Lang, value: string) => {
    setSavedAt(false);
    setDraft((prev) => ({
      ...prev,
      [slug]: {
        ...prev[slug],
        [kind]: { ...prev[slug][kind], [lang]: value },
      },
    }));
  };

  const doSave = async () => {
    setError(null);
    setSavedAt(false);
    try {
      await save.mutateAsync(pruneDraft(draft));
      setSavedAt(true);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">{t("modules.access.labels.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("modules.access.labels.hint")}</p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="size-3.5" />{t("modules.access.labels.saved")}
            </span>
          )}
          <Button size="sm" onClick={doSave} disabled={save.isPending || loading}>
            {save.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
            {t("modules.access.labels.save")}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive break-words">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
        </div>
      )}

      {!loading && (
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
          {(catalog ?? []).map((mod) =>
            draft[mod.slug] ? (
              <LabelModuleRow
                key={mod.slug}
                mod={mod}
                slot={draft[mod.slug]}
                onChange={setField}
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

function LabelModuleRow({
  mod, slot, onChange,
}: {
  mod: CatalogModule;
  slot: { title: Record<Lang, string>; desc: Record<Lang, string> };
  onChange: (slug: string, kind: "title" | "desc", lang: Lang, value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // Count languages that have any override, for an at-a-glance badge.
  const filled = LANGS.reduce(
    (n, l) => n + (slot.title[l].trim() || slot.desc[l].trim() ? 1 : 0),
    0,
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
        <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left text-sm font-medium">
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <span>{mod.title}</span>
          <span className="text-xs text-muted-foreground font-mono">· {mod.slug}</span>
          {filled > 0 && <Badge variant="muted">{filled}/{LANGS.length}</Badge>}
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="space-y-2.5 px-3 pb-3 pt-1">
          {LANGS.map((l) => (
            <div key={l} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2">
              <span className="text-xs font-medium uppercase text-muted-foreground">{l}</span>
              <Input
                value={slot.title[l]}
                onChange={(e) => onChange(mod.slug, "title", l, e.target.value)}
                placeholder={t("modules.access.labels.moduleTitle")}
              />
              <Input
                value={slot.desc[l]}
                onChange={(e) => onChange(mod.slug, "desc", l, e.target.value)}
                placeholder={t("modules.access.labels.moduleDesc")}
              />
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
