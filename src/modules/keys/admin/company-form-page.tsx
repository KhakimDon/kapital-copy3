/**
 * CompanyFormPage — full-page create/edit for a KM company, 1:1 with KM's
 * Django admin change form (KM decommission phase 3).
 *
 * Routes: /keys/admin/companies/new · /:id/edit
 *
 * Covers the complete writable field set PLUS the admin inlines:
 *   • legal_form as a select (the 9 KM choices), director_phone (required)
 *   • Ответственные сотрудники — responsible-employees multi-select (M2M)
 *   • inline ЭЦП keys with PFX upload (on create)
 * Writes go native to the km schema (/api/v2/keys/*).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTabs } from "@/shared/store/tabs";
import { Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/reveal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  useKeyCompany, useCreateCompany, useUpdateCompany, useCreateKey,
  useKmUsers, useCompanyResponsible, useSetCompanyResponsible,
  LEGAL_FORMS, type CompanyWrite,
} from "../api";
import { apiErrorText } from "../admin-dialogs";
import { FormPageHeader, Section, Field, FormFooter, ErrorBox } from "./form-bits";

const EMPTY = {
  name: "", inn: "", legal_form: "", oked: "", registration_date: "",
  director_name: "", director_phone: "", director_tg_id: "", accountant_name: "",
  phone: "", email: "", address: "",
  bank_name: "", bank_mfo: "", bank_account: "",
  tg_group_id: "",
};

type InlineKey = { name: string; password: string; file: File | null };

export function CompanyFormPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const { id } = useParams();
  const companyId = id ? Number(id) : null;
  const isEdit = companyId != null;

  const { data: company, isLoading } = useKeyCompany(companyId);

  const setTabTitle = useTabs((s) => s.setTitle);
  useEffect(() => {
    const title = isEdit
      ? (company?.name || t("modules.keys.admin.editCompany"))
      : t("modules.keys.admin.addCompany");
    setTabTitle(loc.pathname + loc.search, title);
  }, [isEdit, company?.name, t, loc.pathname, loc.search, setTabTitle]);
  const { data: users } = useKmUsers(true);
  const { data: respIds } = useCompanyResponsible(companyId);
  const create = useCreateCompany();
  const update = useUpdateCompany();
  const setResponsible = useSetCompanyResponsible();
  const createKey = useCreateKey();

  const [f, setF] = useState<Record<string, string>>(EMPTY);
  const [isActive, setIsActive] = useState(true);
  const [responsible, setResp] = useState<Set<number>>(new Set());
  const [userSearch, setUserSearch] = useState("");
  const [inlineKeys, setInlineKeys] = useState<InlineKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit || !company) return;
    const c = company as Record<string, unknown>;
    const next: Record<string, string> = { ...EMPTY };
    for (const k of Object.keys(EMPTY)) next[k] = String(c[k] ?? "");
    setF(next);
    setIsActive(company.is_active ?? true);
  }, [isEdit, company]);

  useEffect(() => {
    if (respIds) setResp(new Set(respIds));
  }, [respIds]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    const rows = users ?? [];
    if (!term) return rows;
    return rows.filter((u) => [u.username, u.first_name, u.last_name, u.email]
      .filter(Boolean).some((v) => v.toLowerCase().includes(term)));
  }, [users, userSearch]);

  const toggleUser = (uid: number) => setResp((prev) => {
    const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n;
  });

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      let cid = companyId;
      if (isEdit && company) {
        const body: Record<string, unknown> = {};
        const c = company as Record<string, unknown>;
        for (const [k, v] of Object.entries(f)) if (v.trim() !== String(c[k] ?? "")) body[k] = v.trim();
        if (isActive !== (company.is_active ?? true)) body.is_active = isActive;
        if (Object.keys(body).length) await update.mutateAsync({ companyId: company.id, ...(body as CompanyWrite) });
        cid = company.id;
      } else {
        const body: Record<string, unknown> = { is_active: isActive };
        for (const [k, v] of Object.entries(f)) if (v.trim()) body[k] = v.trim();
        const created = await create.mutateAsync(body as CompanyWrite);
        cid = created?.id ?? null;
      }
      if (cid != null) {
        await setResponsible.mutateAsync({ companyId: cid, userIds: [...responsible] });
        // inline keys (create flow) — upload each PFX after the company exists
        for (const k of inlineKeys) {
          if (k.file) await createKey.mutateAsync({ file: k.file, name: k.name || k.file.name, password: k.password, company: cid });
        }
      }
      nav(cid != null && !isEdit ? `/keys/companies/${cid}` : "/keys/admin?tab=companies");
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
        title={isEdit ? t("modules.keys.admin.editCompany") : t("modules.keys.admin.addCompany")}
        subtitle={t("modules.keys.admin.addCompanyHint")}
        onBack={() => nav("/keys/admin?tab=companies")}
      />
      <ErrorBox text={error} />

      <Section title={t("modules.keys.admin.secMain")}>
        <Field label={t("modules.keys.fields.name")} required full>
          <Input value={f.name} onChange={set("name")} autoFocus />
        </Field>
        <Field label={t("modules.keys.fields.inn")} required>
          <Input value={f.inn} onChange={set("inn")} className="font-mono" placeholder={t("modules.keys.admin.innHint")} />
        </Field>
        <Field label={t("modules.keys.fields.legalForm")} required>
          <Select value={f.legal_form} onValueChange={(v) => setF((p) => ({ ...p, legal_form: v }))}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {LEGAL_FORMS.map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("modules.keys.fields.oked")}>
          <Input value={f.oked} onChange={set("oked")} className="font-mono" />
        </Field>
        <Field label={t("modules.keys.fields.registrationDate")}>
          <DatePicker value={f.registration_date} onChange={(v) => setF((p) => ({ ...p, registration_date: v }))} />
        </Field>
        <Field label={t("modules.keys.admin.status")} full>
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
            <Checkbox className="size-4" checked={isActive}
              onCheckedChange={(v) => setIsActive(Boolean(v))} />
            {t("modules.keys.activeFlag.active")}
          </label>
        </Field>
      </Section>

      <Section title={t("modules.keys.admin.secResponsible")}>
        <Field label={t("modules.keys.fields.director")}>
          <Input value={f.director_name} onChange={set("director_name")} />
        </Field>
        <Field label={t("modules.keys.admin.directorPhone")} required>
          <Input value={f.director_phone} onChange={set("director_phone")} className="font-mono" placeholder="+99890…" />
        </Field>
        <Field label={t("modules.keys.fields.accountant")}>
          <Input value={f.accountant_name} onChange={set("accountant_name")} />
        </Field>
        <Field label={t("modules.keys.admin.directorTg")}>
          <Input value={f.director_tg_id} onChange={set("director_tg_id")} className="font-mono" />
        </Field>
      </Section>

      {/* Users assigned to this company — KM's filter_horizontal M2M */}
      <Section title={t("modules.keys.admin.usersSection")}>
        <div className="sm:col-span-2 space-y-2">
          <Input value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
            placeholder={t("modules.keys.admin.userSearch")} />
          <div className="max-h-52 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {(filteredUsers).map((u) => (
              <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                <Checkbox className="size-4"
                  checked={responsible.has(u.id)} onCheckedChange={() => toggleUser(u.id)} />
                <span><span className="font-medium">{u.username}</span>
                  {(u.first_name || u.last_name) && <span className="text-muted-foreground"> · {[u.first_name, u.last_name].filter(Boolean).join(" ")}</span>}
                  {u.role && u.role !== "user" && <span className="text-xs text-muted-foreground"> ({u.role})</span>}
                </span>
              </label>
            ))}
            {filteredUsers.length === 0 && <div className="p-3 text-sm text-muted-foreground text-center">{t("modules.keys.admin.noUsers")}</div>}
          </div>
          <p className="text-xs text-muted-foreground">{t("modules.keys.admin.count", { count: responsible.size })}</p>
        </div>
      </Section>

      <Section title={t("modules.keys.admin.secContact")}>
        <Field label={t("modules.keys.fields.phone")}>
          <Input value={f.phone} onChange={set("phone")} className="font-mono" />
        </Field>
        <Field label={t("modules.keys.fields.email")}>
          <Input type="email" value={f.email} onChange={set("email")} />
        </Field>
        <Field label={t("modules.keys.fields.address")} full>
          <Input value={f.address} onChange={set("address")} />
        </Field>
      </Section>

      <Section title={t("modules.keys.admin.secBank")}>
        <Field label={t("modules.keys.fields.bankName")} full>
          <Input value={f.bank_name} onChange={set("bank_name")} />
        </Field>
        <Field label={t("modules.keys.fields.mfo")}>
          <Input value={f.bank_mfo} onChange={set("bank_mfo")} className="font-mono" />
        </Field>
        <Field label={t("modules.keys.fields.bankAccount")}>
          <Input value={f.bank_account} onChange={set("bank_account")} className="font-mono" />
        </Field>
      </Section>

      <Section title={t("modules.keys.admin.secIntegration")}>
        <Field label={t("modules.keys.fields.tgGroupId")} full>
          <Input value={f.tg_group_id} onChange={set("tg_group_id")} className="font-mono" placeholder="-100…" />
        </Field>
      </Section>

      {/* Inline ЭЦП keys — KM's ESKeyInline (create flow) */}
      {!isEdit && (
        <Section title={t("modules.keys.admin.tabs.keys")}>
          <div className="sm:col-span-2 space-y-2">
            {inlineKeys.map((k, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                <Input placeholder={t("modules.keys.admin.keyName")} value={k.name}
                  onChange={(e) => setInlineKeys((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <Input type="password" placeholder={t("modules.keys.admin.password")} value={k.password}
                  onChange={(e) => setInlineKeys((p) => p.map((x, j) => j === i ? { ...x, password: e.target.value } : x))} />
                <Input type="file" accept=".pfx,.p12" className="text-xs"
                  onChange={(e) => setInlineKeys((p) => p.map((x, j) => j === i ? { ...x, file: e.target.files?.[0] ?? null } : x))} />
                <Button variant="ghost" size="icon" className="size-8 text-destructive"
                  onClick={() => setInlineKeys((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm"
              onClick={() => setInlineKeys((p) => [...p, { name: "", password: "", file: null }])}>
              <Plus className="size-4 mr-1" />{t("modules.keys.admin.addKey")}
            </Button>
            {inlineKeys.some((k) => k.file) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Upload className="size-3" />{t("modules.keys.admin.count", { count: inlineKeys.filter((k) => k.file).length })}
              </p>
            )}
          </div>
        </Section>
      )}

      <FormFooter
        onCancel={() => nav("/keys/admin?tab=companies")}
        onSave={submit}
        saving={saving}
        cancelLabel={t("common.cancel")}
        saveLabel={isEdit ? t("common.save") : t("common.create")}
        disabled={!f.name.trim()}
      />
    </FadeIn>
  );
}
