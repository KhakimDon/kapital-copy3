/**
 * RoleEditor — create / edit / view a role and its permission set.
 *
 * The permission matrix is built from `useCatalog()` (the full `<module>.<action>`
 * catalog grouped by module). One collapsible group per module, a checkbox per
 * permission (`perm.key`), a "select all in module" toggle, and dangerous perms
 * (`perm.dangerous`) flagged in destructive red.
 *
 * System roles open here read-only (all inputs disabled, no save) — the same
 * matrix, just non-editable.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

import {
  useCatalog, useCreateRole, useUpdateRole,
  moduleLabel, moduleDesc,
  type CatalogModule, type PermSpec, type Role,
} from "@/shared/api/authz";
import { apiErrorText } from "@/modules/keys/admin-dialogs";

export function RoleEditor({
  open, onOpenChange, role, readOnly,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** undefined/null → create; a Role → edit (or view when `readOnly`). */
  role?: Role | null;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { data: catalog, isLoading: catLoading } = useCatalog();
  const create = useCreateRole();
  const update = useUpdateRole();
  const isEdit = role != null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Seed the form each time the dialog opens (create → blank, edit → the role).
  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setSelected(new Set(role?.permissions ?? []));
    setError(null);
  }, [open, role]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleModule = (mod: CatalogModule, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of mod.permissions) on ? next.add(p.key) : next.delete(p.key);
      return next;
    });

  const busy = create.isPending || update.isPending;

  const submit = async () => {
    setError(null);
    try {
      const body = { name: name.trim(), description: description.trim() || null, permissions: [...selected] };
      if (isEdit) await update.mutateAsync({ id: role.id, ...body });
      else await create.mutateAsync(body);
      onOpenChange(false);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  const title = readOnly
    ? role?.name ?? t("modules.access.roles.readOnly")
    : isEdit
      ? t("modules.access.role.save")
      : t("modules.access.roles.new");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{title}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? t(role?.is_system ? "modules.access.roles.readOnly" : "modules.access.roles.viewOnly")
              : t("modules.access.role.permissions")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t("modules.access.role.name")}</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("modules.access.role.namePlaceholder")}
                disabled={readOnly}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t("modules.access.role.description")}</span>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t("modules.access.role.permissions")}</span>
            {catLoading && (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            )}
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {(catalog ?? []).map((mod) => (
                <ModuleGroup
                  key={mod.slug}
                  mod={mod}
                  selected={selected}
                  onToggle={toggle}
                  onToggleModule={toggleModule}
                  readOnly={readOnly}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive break-words">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          {!readOnly && (
            <Button onClick={submit} disabled={busy || !name.trim()}>
              {busy && <Loader2 className="size-4 mr-1 animate-spin" />}
              {isEdit ? t("modules.access.role.save") : t("modules.access.role.create")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// One collapsible module block: header (title + selected/total + select-all) and
// a grid of per-action checkboxes. Dangerous actions are flagged in red.
function ModuleGroup({
  mod, selected, onToggle, onToggleModule, readOnly,
}: {
  mod: CatalogModule;
  selected: Set<string>;
  onToggle: (key: string) => void;
  onToggleModule: (mod: CatalogModule, on: boolean) => void;
  readOnly?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const selCount = useMemo(
    () => mod.permissions.reduce((n, p) => n + (selected.has(p.key) ? 1 : 0), 0),
    [mod.permissions, selected],
  );
  const total = mod.permissions.length;
  const allOn = total > 0 && selCount === total;

  const titleText =
    moduleLabel(mod, i18n.language) ??
    t(`modules.moduleNames.${mod.slug}`, { defaultValue: mod.title });
  const descText = moduleDesc(mod, i18n.language);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
        <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left text-sm font-medium">
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <span className="min-w-0">
            <span className="block truncate">{titleText}</span>
            {descText && (
              <span className="block truncate text-xs font-normal text-muted-foreground">{descText}</span>
            )}
          </span>
          <span className="text-xs font-normal text-muted-foreground">{selCount}/{total}</span>
        </CollapsibleTrigger>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <Checkbox
            className="size-4"
            checked={allOn}
            disabled={readOnly}
            onCheckedChange={(v) => onToggleModule(mod, v === true)}
          />
          {t("modules.access.role.selectAllModule")}
        </label>
      </div>
      <CollapsibleContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 px-3 pb-3 pt-1">
          {mod.permissions.map((p) => (
            <PermRow key={p.key} perm={p} checked={selected.has(p.key)} onToggle={onToggle} readOnly={readOnly} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PermRow({
  perm, checked, onToggle, readOnly,
}: {
  perm: PermSpec;
  checked: boolean;
  onToggle: (key: string) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center gap-2 py-0.5 text-sm cursor-pointer">
      <Checkbox
        className="size-4"
        checked={checked}
        disabled={readOnly}
        onCheckedChange={() => onToggle(perm.key)}
      />
      <span className={cn("min-w-0 flex items-center gap-1", perm.dangerous && "text-destructive")}>
        {perm.dangerous && <ShieldAlert className="size-3.5 shrink-0" />}
        {t(`modules.access.actions.${perm.action}`, { defaultValue: perm.action })}
        <span className="text-xs text-muted-foreground font-mono">· {perm.key}</span>
      </span>
    </label>
  );
}
