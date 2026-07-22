/**
 * TenantFormPage — full-page create / edit for a tenant.
 *
 * Routes: /settings/tenants/new · /settings/tenants/:id/edit
 * Create → POST; edit (id present) → load + PATCH. On success → detail/list.
 *
 * For placement === "dedicated" the tenant points at its OWN Postgres DB. The
 * form collects host/port/database/username/password separately and composes a
 * `postgres://…` DSN. An optional raw-DSN escape hatch overrides the composed
 * one when filled. expiry_at: date input → ISO string (set) or null (cleared).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/reveal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FormPageHeader, Section, Field, FormFooter, ErrorBox } from "@/modules/keys/admin/form-bits";

import { useTenant, useCreateTenant, useUpdateTenant, useImportTenant } from "./api";
import { apiErrorText } from "./error";
import type { TenantCreate, TenantPlacement, TenantUpdate } from "./types";

/** YYYY-MM-DD for a native date input from a stored ISO/datetime string. */
function toDateInput(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Compose a Postgres DSN from parts; the password is URL-encoded. */
function composeDsn(host: string, port: string, db: string, user: string, pass: string): string {
  const p = port.trim() || "5432";
  const auth = pass ? `${user}:${encodeURIComponent(pass)}` : user;
  return `postgres://${auth}@${host.trim()}:${p}/${db.trim()}`;
}

export function TenantFormPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { id } = useParams();
  const tenantId = id ? Number(id) : null;
  const isEdit = tenantId != null;

  const { data: tenant, isLoading } = useTenant(tenantId);
  const create = useCreateTenant();
  const update = useUpdateTenant(tenantId ?? 0);
  const importT = useImportTenant();

  // Legacy import — only exposed on create; hidden on edit. Toggle reveals
  // the connection fields; empty when the admin wants a blank tenant.
  const [importOpen, setImportOpen] = useState(false);
  const [legacyDsn, setLegacyDsn] = useState("");
  const [legacyKmEncKey, setLegacyKmEncKey] = useState("");
  const [activityDays, setActivityDays] = useState("90");
  const [importResult, setImportResult] = useState<string | null>(null);
  // Nextcloud — a lot of tenants keep KM and NC on different boxes
  // (Grossbook), so this block accepts a fully-independent URL + creds.
  // Callers who host both on one server just paste the same host twice.
  const [ncOpen, setNcOpen] = useState(false);
  const [ncUrl, setNcUrl] = useState("");
  const [ncAdminUser, setNcAdminUser] = useState("admin");
  const [ncAdminPass, setNcAdminPass] = useState("");
  const [ncPgDsn, setNcPgDsn] = useState("");

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [placement, setPlacement] = useState<TenantPlacement>("shared");

  // Structured connection fields (placement === "dedicated").
  const [host, setHost] = useState("");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Advanced: raw DSN escape hatch (overrides the composed one when filled).
  const [rawDsn, setRawDsn] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [maxCompanies, setMaxCompanies] = useState("0");
  const [maxKeys, setMaxKeys] = useState("0");
  const [expiry, setExpiry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit || !tenant) return;
    setSlug(tenant.slug);
    setName(tenant.name);
    setPlacement(tenant.placement);
    const c = tenant.connection;
    setHost(c?.host ?? "");
    setPort(c?.port != null ? String(c.port) : "5432");
    setDatabase(c?.database ?? "");
    setUsername(c?.username ?? "");
    setPassword("");
    setRawDsn("");
    setMaxCompanies(String(tenant.max_companies));
    setMaxKeys(String(tenant.max_keys));
    setExpiry(toDateInput(tenant.expiry_at));
  }, [isEdit, tenant]);

  const isDedicated = placement === "dedicated";
  const isLocal = placement === "local";
  const expiryIso = expiry ? new Date(`${expiry}T00:00:00Z`).toISOString() : null;

  // True when any structured connection field (or password) differs from what
  // the loaded tenant has — i.e. the user actually changed the connection.
  const connChanged = (() => {
    if (!isEdit) return false;
    const c = tenant?.connection;
    return (
      host.trim() !== (c?.host ?? "") ||
      port.trim() !== (c?.port != null ? String(c.port) : "5432") ||
      database.trim() !== (c?.database ?? "") ||
      username.trim() !== (c?.username ?? "") ||
      password !== ""
    );
  })();

  /** Resolve the dsn to send (or null to omit). rawDsn overrides composed. */
  const resolveDsn = (): string | null => {
    if (rawDsn.trim()) return rawDsn.trim();
    if (!isDedicated) return null;
    if (isEdit && !connChanged) return null; // unchanged → leave DSN as-is
    if (!host.trim() || !database.trim() || !username.trim()) return null;
    return composeDsn(host, port, database, username, password);
  };

  // Local placement provisions role + DB on the backend, so we skip the
  // dedicated-only host/database/username check for it.
  const valid =
    name.trim() !== "" &&
    (isEdit || slug.trim() !== "") &&
    (!isDedicated || isEdit || rawDsn.trim() !== "" ||
      (host.trim() !== "" && database.trim() !== "" && username.trim() !== ""));

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const dsn = resolveDsn();
      if (isEdit && tenant) {
        const body: TenantUpdate = {};
        if (name.trim() !== tenant.name) body.name = name.trim();
        if (Number(maxCompanies) !== tenant.max_companies) body.max_companies = Number(maxCompanies);
        if (Number(maxKeys) !== tenant.max_keys) body.max_keys = Number(maxKeys);
        if (expiryIso !== (tenant.expiry_at ?? null)) {
          if (!expiry) body.expiry_at = null;
          else if (toDateInput(tenant.expiry_at) !== expiry) body.expiry_at = expiryIso;
        }
        if (dsn) body.dsn = dsn;
        await update.mutateAsync(body);
        nav(`/settings/tenants/${tenant.id}`);
      } else {
        const body: TenantCreate = {
          slug: slug.trim(),
          name: name.trim(),
          placement,
          max_companies: Number(maxCompanies),
          max_keys: Number(maxKeys),
        };
        if (dsn) body.dsn = dsn;
        if (expiryIso) body.expiry_at = expiryIso;
        if (importOpen && legacyDsn.trim()) {
          // Import branch — same POST body plus a `legacy` block. Returns
          // stats we surface to the admin before navigating.
          const res = await importT.mutateAsync({
            ...body,
            legacy: {
              pg_dsn: legacyDsn.trim(),
              km_enc_key: legacyKmEncKey.trim(),
              activity_days: Number(activityDays) || 0,
            },
            ...(ncOpen && ncUrl.trim()
              ? {
                  nc: {
                    url: ncUrl.trim(),
                    admin_user: ncAdminUser.trim(),
                    admin_pass: ncAdminPass,
                    pg_dsn: ncPgDsn.trim(),
                  },
                }
              : {}),
          });
          setImportResult(
            `Import muvaffaqiyatli — users: ${res.stats.users}, ` +
            `companies: ${res.stats.companies}, resources: ${res.stats.resources}, ` +
            `keys: ${res.stats.keys}, logs: ${res.stats.activity_log}`,
          );
          setTimeout(() => nav(`/settings/tenants/${res.tenant_id}`), 1500);
          return;
        }
        const created = await create.mutateAsync(body);
        nav(created?.id != null ? `/settings/tenants/${created.id}` : "/settings/tenants");
      }
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && isLoading) {
    return <div className="p-2 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <FadeIn className="max-w-3xl mx-auto space-y-4 pb-4">
      <FormPageHeader
        title={isEdit
          ? t("modules.settings.tenants.edit", { defaultValue: "Tenantni tahrirlash" })
          : t("modules.settings.tenants.create", { defaultValue: "Yangi tenant" })}
        subtitle={t("modules.settings.tenants.formHint", { defaultValue: "Tenant sozlamalari va limitlari" })}
        onBack={() => nav("/settings/tenants")}
      />
      <ErrorBox text={error} />

      <Section title={t("modules.settings.tenants.secMain", { defaultValue: "Asosiy" })}>
        <Field label={t("modules.settings.tenants.fields.slug", { defaultValue: "Slug" })} required>
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={isEdit}
            className="font-mono"
            placeholder="acme"
            autoFocus={!isEdit}
          />
        </Field>
        <Field label={t("modules.settings.tenants.fields.name", { defaultValue: "Nom" })} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={isEdit} />
        </Field>
        <Field label={t("modules.settings.tenants.fields.placement", { defaultValue: "Joylashuv" })} required>
          <Select
            value={placement}
            onValueChange={(v) => setPlacement(v as TenantPlacement)}
            disabled={isEdit}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="local">
                {t("modules.settings.tenants.placement.local", { defaultValue: "Lokal (AIBA Next serveri)" })}
              </SelectItem>
              <SelectItem value="shared">
                {t("modules.settings.tenants.placement.shared", { defaultValue: "Umumiy (shared)" })}
              </SelectItem>
              <SelectItem value="dedicated">
                {t("modules.settings.tenants.placement.dedicated", { defaultValue: "Alohida (dedicated)" })}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("modules.settings.tenants.fields.expiry", { defaultValue: "Amal qiladi" })}>
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
      </Section>

      {isLocal && !isEdit && (
        <Section title={t("modules.settings.tenants.secConnection", { defaultValue: "Server ulanishi" })}>
          <div className="sm:col-span-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {t("modules.settings.tenants.localHint", {
              defaultValue:
                "AIBA Next serverining Postgres'ida yangi rol va DB avtomatik yaratiladi. Host / user / parolni siz kiritmaysiz.",
            })}
          </div>
        </Section>
      )}

      {isDedicated && (
        <Section title={t("modules.settings.tenants.secConnection", { defaultValue: "Server ulanishi" })}>
          <Field
            label={t("modules.settings.tenants.fields.host", { defaultValue: "Host / Server IP" })}
            required={!isEdit}
          >
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="font-mono"
              placeholder="10.0.0.32 yoki localhost"
            />
          </Field>
          <Field label={t("modules.settings.tenants.fields.port", { defaultValue: "Port" })}>
            <Input
              type="number"
              min={1}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="font-mono"
              placeholder="5432"
            />
          </Field>
          <Field
            label={t("modules.settings.tenants.fields.database", { defaultValue: "Ma'lumotlar bazasi (database)" })}
            required={!isEdit}
          >
            <Input
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              className="font-mono"
              placeholder="aiba"
            />
          </Field>
          <Field
            label={t("modules.settings.tenants.fields.username", { defaultValue: "Foydalanuvchi (username)" })}
            required={!isEdit}
          >
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="font-mono"
              placeholder="postgres"
            />
          </Field>
          <Field label={t("modules.settings.tenants.fields.password", { defaultValue: "Parol (password)" })}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="font-mono"
              placeholder={isEdit
                ? t("modules.settings.tenants.passwordEditHint", { defaultValue: "bo'sh qoldiring — o'zgartirmaslik uchun" })
                : "••••••••"}
            />
          </Field>

          <div className="sm:col-span-2 text-xs text-muted-foreground">
            {t("modules.settings.tenants.connectionHelp", {
              defaultValue: "Host — tenant serverining IP yoki manzili. Ma'lumotlar shu serverdagi alohida DB'da saqlanadi.",
            })}
          </div>

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {advancedOpen ? "▾ " : "▸ "}
              {t("modules.settings.tenants.advancedDsn", { defaultValue: "Ilg'or: to'liq DSN" })}
            </button>
            {advancedOpen && (
              <div className="mt-2 space-y-1">
                <Textarea
                  value={rawDsn}
                  onChange={(e) => setRawDsn(e.target.value)}
                  className="font-mono text-xs"
                  rows={2}
                  placeholder="postgresql://user:pass@host:5432/db"
                />
                <p className="text-xs text-muted-foreground">
                  {t("modules.settings.tenants.advancedDsnHint", {
                    defaultValue: "To'ldirilsa, yuqoridagi maydonlar o'rniga shu DSN ishlatiladi.",
                  })}
                </p>
              </div>
            )}
          </div>
        </Section>
      )}

      {!isEdit && (
        <Section title={t("modules.settings.tenants.secImport", { defaultValue: "Eski serverdan import" })}>
          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={importOpen}
                onChange={(e) => setImportOpen(e.target.checked)}
                className="h-4 w-4"
              />
              <span>
                {t("modules.settings.tenants.importToggle", {
                  defaultValue: "Eski Key Manager serveridan ma'lumot ko'chirish",
                })}
              </span>
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("modules.settings.tenants.importHint", {
                defaultValue:
                  "Foydalanuvchilar, kompaniyalar, saytlar, kalitlar va oxirgi 90 kunlik loglar avtomatik ko'chiriladi. PFX fayllarni /dskeys/ ga qo'lda scp qilishingiz kerak.",
              })}
            </p>
          </div>

          {importOpen && (
            <>
              <Field
                label={t("modules.settings.tenants.legacyDsn", { defaultValue: "Eski PG DSN" })}
                required
              >
                <Textarea
                  value={legacyDsn}
                  onChange={(e) => setLegacyDsn(e.target.value)}
                  className="font-mono text-xs"
                  rows={2}
                  placeholder="postgres://km_ro:pass@10.0.5.10:5432/keymanager"
                />
              </Field>
              <Field
                label={t("modules.settings.tenants.legacyKmEncKey", {
                  defaultValue: "Eski KM_ENC_KEY (Fernet)",
                })}
              >
                <Input
                  value={legacyKmEncKey}
                  onChange={(e) => setLegacyKmEncKey(e.target.value)}
                  className="font-mono text-xs"
                  placeholder="hex-string (parollarni qayta shifrlash uchun)"
                />
              </Field>
              <Field
                label={t("modules.settings.tenants.activityDays", {
                  defaultValue: "Log oynasi (kun)",
                })}
              >
                <Input
                  type="number"
                  min={0}
                  value={activityDays}
                  onChange={(e) => setActivityDays(e.target.value)}
                  className="font-mono"
                />
              </Field>
              <div className="sm:col-span-2 border-t border-white/10 mt-2 pt-3">
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ncOpen}
                    onChange={(e) => setNcOpen(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span>
                    {t("modules.settings.tenants.ncToggle", {
                      defaultValue: "Nextcloud (Fayllar) ham import qilish",
                    })}
                  </span>
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("modules.settings.tenants.ncHint", {
                    defaultValue:
                      "NC KM bilan bir serverda bo'lsa — shu host'ni qayta ishlating; alohida serverda bo'lsa (Grossbook-style) — quyida NC ma'lumotlarini kiriting.",
                  })}
                </p>
              </div>

              {ncOpen && (
                <>
                  <Field
                    label={t("modules.settings.tenants.ncUrl", {
                      defaultValue: "Nextcloud URL",
                    })}
                    required
                  >
                    <Input
                      value={ncUrl}
                      onChange={(e) => setNcUrl(e.target.value)}
                      className="font-mono"
                      placeholder="https://cloud.acme.uz/"
                    />
                  </Field>
                  <Field
                    label={t("modules.settings.tenants.ncAdminUser", {
                      defaultValue: "NC admin foydalanuvchi",
                    })}
                  >
                    <Input
                      value={ncAdminUser}
                      onChange={(e) => setNcAdminUser(e.target.value)}
                      className="font-mono"
                      placeholder="admin"
                    />
                  </Field>
                  <Field
                    label={t("modules.settings.tenants.ncAdminPass", {
                      defaultValue: "NC admin parol",
                    })}
                  >
                    <Input
                      type="password"
                      value={ncAdminPass}
                      onChange={(e) => setNcAdminPass(e.target.value)}
                      className="font-mono"
                      placeholder="••••••••"
                    />
                  </Field>
                  <Field
                    label={t("modules.settings.tenants.ncPgDsn", {
                      defaultValue: "NC PG DSN (foydalanuvchilarni ko'chirish uchun)",
                    })}
                  >
                    <Textarea
                      value={ncPgDsn}
                      onChange={(e) => setNcPgDsn(e.target.value)}
                      className="font-mono text-xs"
                      rows={2}
                      placeholder="postgres://oc_ro:pass@10.0.5.11:5432/nextcloud (ixtiyoriy)"
                    />
                  </Field>
                </>
              )}

              {importResult && (
                <div className="sm:col-span-2 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  {importResult}
                </div>
              )}
            </>
          )}
        </Section>
      )}

      <Section title={t("modules.settings.tenants.secLimits", { defaultValue: "Limitlar" })}>
        <Field label={t("modules.settings.tenants.fields.maxCompanies", { defaultValue: "Maks. kompaniyalar" })}>
          <Input type="number" min={0} value={maxCompanies}
            onChange={(e) => setMaxCompanies(e.target.value)} className="font-mono" />
        </Field>
        <Field label={t("modules.settings.tenants.fields.maxKeys", { defaultValue: "Maks. kalitlar" })}>
          <Input type="number" min={0} value={maxKeys}
            onChange={(e) => setMaxKeys(e.target.value)} className="font-mono" />
        </Field>
      </Section>

      <FormFooter
        onCancel={() => nav(isEdit && tenant ? `/settings/tenants/${tenant.id}` : "/settings/tenants")}
        onSave={submit}
        saving={saving}
        cancelLabel={t("common.cancel", { defaultValue: "Bekor qilish" })}
        saveLabel={isEdit ? t("common.save", { defaultValue: "Saqlash" }) : t("common.create", { defaultValue: "Yaratish" })}
        disabled={!valid}
      />
    </FadeIn>
  );
}
