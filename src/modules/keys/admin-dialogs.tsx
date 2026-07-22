/**
 * Admin dialogs for the keys module — the management surface that used to
 * live in cloud's aiba_keys admin panel + KM Django admin:
 *   KeyFormDialog     — upload a PFX (create) / rename + repassword (edit)
 *   KeyUsersDialog    — attach/detach KM users on a key (M2M)
 *   CompanyFormDialog — create / edit a KM company
 *   ConfirmDialog     — destructive-action confirm (key/company delete)
 *
 * All mutations proxy through /api/v2/keys/* to KM, so KM's signal chain
 * (Chat2 / Didox / Soliq / NC sync) still fires on every write.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  useAdminKey, useCreateKey, useUpdateKey, useKmUsers,
  useCreateCompany, useUpdateCompany, useCreateKmUser, useUpdateKmUser,
  useCompanyResponsible, useSetCompanyResponsible,
  type CompanyWrite, type KeyCompanyDetail, type SignKey, type KmUser,
} from "./api";

/** KM user roles (mirrors core User.role choices). */
export const KM_ROLES = ["user", "client", "admin"] as const;

// ── helpers ─────────────────────────────────────────────────────────────────

/** KM returns {"error": "..."} or DRF field-errors; flatten for a toast line. */
export function apiErrorText(err: unknown): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (!data) return String((err as Error)?.message || err);
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.error === "string") return obj.error;
    if (typeof obj.detail === "string") return obj.detail;
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
      .join("; ");
  }
  return String(data);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="text-sm text-destructive break-words">{text}</p>;
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 pt-2">{children}</div>;
}

// ── ConfirmDialog ───────────────────────────────────────────────────────────

export function ConfirmDialog({
  open, onOpenChange, title, description, onConfirm, busy, error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ErrorLine text={error ?? null} />
        <Footer>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="size-4 mr-1 animate-spin" />}
            {t("common.delete")}
          </Button>
        </Footer>
      </DialogContent>
    </Dialog>
  );
}

// ── KeyFormDialog (create = PFX upload, edit = name/password) ───────────────

export function KeyFormDialog({
  open, onOpenChange, companyId, editKey,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: number;
  editKey?: SignKey | null;
}) {
  const { t } = useTranslation();
  const create = useCreateKey();
  const update = useUpdateKey();
  const isEdit = editKey != null;

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(editKey?.name ?? "");
      setPassword("");
      setFile(null);
      setError(null);
    }
  }, [open, editKey]);

  const busy = create.isPending || update.isPending;

  const submit = async () => {
    setError(null);
    try {
      if (isEdit) {
        const patch: { keyId: number; name?: string; password?: string } = { keyId: editKey.id };
        if (name !== editKey.name) patch.name = name;
        if (password) patch.password = password;
        await update.mutateAsync(patch);
      } else {
        if (!file) {
          setError(t("modules.keys.admin.fileRequired"));
          return;
        }
        await create.mutateAsync({ file, name, password, company: companyId });
      }
      onOpenChange(false);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("modules.keys.admin.editKey") : t("modules.keys.admin.addKey")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("modules.keys.admin.editKeyHint")
              : t("modules.keys.admin.addKeyHint")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!isEdit && (
            <Field label={t("modules.keys.admin.pfxFile")}>
              <Input
                type="file"
                accept=".pfx,.p12,application/x-pkcs12"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          )}
          <Field label={t("modules.keys.admin.keyName")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="DS3105558860005…" />
          </Field>
          <Field label={isEdit ? t("modules.keys.admin.newPassword") : t("modules.keys.admin.password")}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? t("modules.keys.admin.keepPassword") : ""}
            />
          </Field>
          <ErrorLine text={error} />
        </div>
        <Footer>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy
              ? <Loader2 className="size-4 mr-1 animate-spin" />
              : !isEdit && <Upload className="size-4 mr-1" />}
            {isEdit ? t("common.save") : t("modules.keys.admin.upload")}
          </Button>
        </Footer>
      </DialogContent>
    </Dialog>
  );
}

// ── KeyUsersDialog (attach/detach users) ────────────────────────────────────

export function KeyUsersDialog({
  open, onOpenChange, keyId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  keyId: number | null;
}) {
  const { t } = useTranslation();
  const { data: key, isLoading: keyLoading } = useAdminKey(open ? keyId : null);
  const { data: users, isLoading: usersLoading } = useKmUsers(open);
  const update = useUpdateKey();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && key) setSelected(new Set(key.attached_user_ids));
    if (open) { setQ(""); setError(null); }
  }, [open, key]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = users ?? [];
    if (!term) return rows;
    return rows.filter((u) =>
      [u.username, u.first_name, u.last_name, u.email]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(term)),
    );
  }, [users, q]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (keyId == null) return;
    setError(null);
    try {
      await update.mutateAsync({ keyId, attached_user_ids: [...selected] });
      onOpenChange(false);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  const loading = keyLoading || usersLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("modules.keys.admin.keyUsers")}</DialogTitle>
          <DialogDescription>{t("modules.keys.admin.keyUsersHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("modules.keys.admin.userSearch")}
          />
          <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {loading && (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground text-center animate-in fade-in-0 duration-300">
                {t("modules.keys.admin.noUsers")}
              </div>
            )}
            {!loading && filtered.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 animate-in fade-in-0 duration-300"
              >
                <Checkbox
                  className="size-4"
                  checked={selected.has(u.id)}
                  onCheckedChange={() => toggle(u.id)}
                />
                <span className="min-w-0">
                  <span className="font-medium">{u.username}</span>
                  {(u.first_name || u.last_name) && (
                    <span className="text-muted-foreground"> · {[u.first_name, u.last_name].filter(Boolean).join(" ")}</span>
                  )}
                  {u.role && u.role !== "user" && (
                    <span className="text-xs text-muted-foreground"> ({u.role})</span>
                  )}
                </span>
              </label>
            ))}
          </div>
          <ErrorLine text={error} />
        </div>
        <Footer>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={update.isPending || loading}>
            {update.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
            {t("common.save")}
          </Button>
        </Footer>
      </DialogContent>
    </Dialog>
  );
}

// ── CompanyUsersDialog (assign responsible users to a company) ──────────────

export function CompanyUsersDialog({
  companyId, companyName, open, onOpenChange,
}: {
  companyId: number | null;
  companyName?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: users, isLoading: usersLoading } = useKmUsers(open);
  const { data: respIds, isLoading: respLoading } = useCompanyResponsible(open ? companyId : null);
  const setResponsible = useSetCompanyResponsible();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => { if (open) { setQ(""); setError(null); setSeeded(false); } }, [open]);
  useEffect(() => {
    if (open && !seeded && respIds) { setSelected(new Set(respIds)); setSeeded(true); }
  }, [open, seeded, respIds]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = users ?? [];
    if (!term) return rows;
    return rows.filter((u) =>
      [u.username, u.first_name, u.last_name, u.email].filter(Boolean).some((v) => v.toLowerCase().includes(term)));
  }, [users, q]);

  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const save = async () => {
    if (companyId == null) return;
    setError(null);
    try {
      await setResponsible.mutateAsync({ companyId, userIds: [...selected] });
      onOpenChange(false);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  const loading = usersLoading || respLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("modules.keys.admin.usersSection", { defaultValue: "Foydalanuvchilar" })}
            {companyName ? ` — ${companyName}` : ""}
          </DialogTitle>
          <DialogDescription>{t("modules.keys.admin.companyUsersHint", { defaultValue: "Ushbu korxonaga mas'ul foydalanuvchilarni belgilang." })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("modules.keys.admin.userSearch")} />
          <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {loading && (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground text-center">{t("modules.keys.admin.noUsers")}</div>
            )}
            {!loading && filtered.map((u) => (
              <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                <Checkbox className="size-4" checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} />
                <span className="min-w-0">
                  <span className="font-medium">{u.username}</span>
                  {(u.first_name || u.last_name) && (
                    <span className="text-muted-foreground"> · {[u.first_name, u.last_name].filter(Boolean).join(" ")}</span>
                  )}
                  {u.role && u.role !== "user" && <span className="text-xs text-muted-foreground"> ({u.role})</span>}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("modules.keys.admin.count", { count: selected.size })}</p>
          <ErrorLine text={error} />
        </div>
        <Footer>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setResponsible.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={setResponsible.isPending || loading}>
            {setResponsible.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
            {t("common.save")}
          </Button>
        </Footer>
      </DialogContent>
    </Dialog>
  );
}

// ── UserFormDialog (create / edit a KM user) ────────────────────────────────

export function UserFormDialog({
  open, onOpenChange, user,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** undefined → create; a KmUser → edit that user. */
  user?: KmUser | null;
}) {
  const { t } = useTranslation();
  const create = useCreateKmUser();
  const update = useUpdateKmUser();
  const isEdit = user != null;

  const empty = {
    username: "", password: "", first_name: "", last_name: "",
    email: "", phone: "", role: "user",
  };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(
      user
        ? {
            username: user.username ?? "", password: "",
            first_name: user.first_name ?? "", last_name: user.last_name ?? "",
            email: user.email ?? "", phone: "", role: user.role || "user",
          }
        : empty,
    );
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const busy = create.isPending || update.isPending;

  const submit = async () => {
    setError(null);
    try {
      if (isEdit) {
        // Send only changed fields; password only when non-blank (blank=keep).
        const patch: Record<string, string> = {};
        const orig: Record<string, string> = {
          username: user.username ?? "", first_name: user.first_name ?? "",
          last_name: user.last_name ?? "", email: user.email ?? "", role: user.role || "user",
        };
        for (const k of ["username", "first_name", "last_name", "email", "role"]) {
          const v = form[k as keyof typeof form].trim();
          if (v !== orig[k]) patch[k] = v;
        }
        if (form.phone.trim()) patch.phone = form.phone.trim();
        if (form.password) patch.password = form.password;
        if (Object.keys(patch).length > 0) {
          await update.mutateAsync({ userId: user.id, ...patch });
        }
      } else {
        const body: Record<string, string> = {};
        for (const [k, v] of Object.entries(form)) if (v.trim()) body[k] = v.trim();
        await create.mutateAsync(body as { username: string; password: string });
      }
      onOpenChange(false);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("modules.keys.admin.editUser") : t("modules.keys.admin.addUser")}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t("modules.keys.admin.editUserHint") : t("modules.keys.admin.addUserHint")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t("modules.keys.admin.username")}>
            <Input value={form.username} onChange={set("username")} autoComplete="off" />
          </Field>
          <Field label={isEdit ? t("modules.keys.admin.newPassword") : t("modules.keys.admin.password")}>
            <Input
              type="password" value={form.password} onChange={set("password")}
              autoComplete="new-password"
              placeholder={isEdit ? t("modules.keys.admin.keepPassword") : ""}
            />
          </Field>
          <Field label={t("modules.keys.fields.firstName")}>
            <Input value={form.first_name} onChange={set("first_name")} />
          </Field>
          <Field label={t("modules.keys.admin.lastName")}>
            <Input value={form.last_name} onChange={set("last_name")} />
          </Field>
          <Field label={t("modules.keys.fields.email")}>
            <Input type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label={t("modules.keys.fields.phone")}>
            <Input value={form.phone} onChange={set("phone")} className="font-mono" placeholder="+99890…" />
          </Field>
          <Field label={t("modules.keys.admin.role")}>
            <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KM_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{t(`modules.keys.roles.${r}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <ErrorLine text={error} />
        <Footer>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={busy || !form.username.trim() || (!isEdit && !form.password.trim())}
          >
            {busy && <Loader2 className="size-4 mr-1 animate-spin" />}
            {isEdit ? t("common.save") : t("common.create")}
          </Button>
        </Footer>
      </DialogContent>
    </Dialog>
  );
}

// ── CompanyFormDialog (create / edit) ───────────────────────────────────────

const COMPANY_FIELDS: { key: keyof CompanyWrite; labelKey: string; mono?: boolean }[] = [
  { key: "name", labelKey: "modules.keys.fields.name" },
  { key: "inn", labelKey: "modules.keys.fields.inn", mono: true },
  { key: "legal_form", labelKey: "modules.keys.fields.legalForm" },
  { key: "oked", labelKey: "modules.keys.fields.oked", mono: true },
  { key: "director_name", labelKey: "modules.keys.fields.director" },
  { key: "accountant_name", labelKey: "modules.keys.fields.accountant" },
  { key: "phone", labelKey: "modules.keys.fields.phone", mono: true },
  { key: "email", labelKey: "modules.keys.fields.email" },
  { key: "address", labelKey: "modules.keys.fields.address" },
  { key: "bank_name", labelKey: "modules.keys.fields.bankName" },
  { key: "bank_mfo", labelKey: "modules.keys.fields.mfo", mono: true },
  { key: "bank_account", labelKey: "modules.keys.fields.bankAccount", mono: true },
];

export function CompanyFormDialog({
  open, onOpenChange, company, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  company?: KeyCompanyDetail | null;
  onCreated?: (created: KeyCompanyDetail) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateCompany();
  const update = useUpdateCompany();
  const isEdit = company != null;

  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    for (const f of COMPANY_FIELDS) {
      init[f.key] = String((company as Record<string, unknown> | null | undefined)?.[f.key] ?? "");
    }
    setForm(init);
    setError(null);
  }, [open, company]);

  const busy = create.isPending || update.isPending;

  const submit = async () => {
    setError(null);
    const body: CompanyWrite = {};
    for (const f of COMPANY_FIELDS) {
      const v = form[f.key]?.trim();
      if (isEdit) {
        // Only send changed fields on edit
        const prev = String((company as Record<string, unknown>)?.[f.key] ?? "");
        if (v !== prev) (body as Record<string, unknown>)[f.key] = v;
      } else if (v) {
        (body as Record<string, unknown>)[f.key] = v;
      }
    }
    try {
      if (isEdit) {
        if (Object.keys(body).length > 0) {
          await update.mutateAsync({ companyId: company.id, ...body });
        }
      } else {
        const created = await create.mutateAsync(body);
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("modules.keys.admin.editCompany") : t("modules.keys.admin.addCompany")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("modules.keys.admin.editCompanyHint")
              : t("modules.keys.admin.addCompanyHint")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {COMPANY_FIELDS.map((f) => (
            <Field key={f.key} label={t(f.labelKey)}>
              <Input
                value={form[f.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className={f.mono ? "font-mono" : undefined}
              />
            </Field>
          ))}
        </div>
        <ErrorLine text={error} />
        <Footer>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || (!isEdit && !form.name?.trim())}>
            {busy && <Loader2 className="size-4 mr-1 animate-spin" />}
            {isEdit ? t("common.save") : t("common.create")}
          </Button>
        </Footer>
      </DialogContent>
    </Dialog>
  );
}
