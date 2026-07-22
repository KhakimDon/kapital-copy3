/**
 * UserFormPage — full-page create/edit for a KM user.
 *
 * Routes:
 *   /keys/admin/users/new       → create
 *   /keys/admin/users/:id/edit  → edit
 *
 * The single place to manage a user: profile (username, password, name, email,
 * phone, user-type, is_active), RBAC permission grants (edit mode only, via
 * <UserGrantsEditor>), and a password reset. Writes proxy through
 * /api/v2/keys/admin/users so KM's Nextcloud + Chat2 sync fires.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTabs } from "@/shared/store/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/reveal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useKmUser, useCreateKmUser, useUpdateKmUser,
  type KmUserCreate, type KmUserUpdate,
} from "../api";
import { apiErrorText, KM_ROLES } from "../admin-dialogs";
import { FormPageHeader, Section, Field, FormFooter, ErrorBox } from "./form-bits";
import { UserGrantsEditor } from "@/modules/access/user-grants-editor";

const EMPTY = {
  username: "", password: "", first_name: "", last_name: "",
  email: "", phone: "", role: "user",
};

export function UserFormPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const { id } = useParams();
  const userId = id ? Number(id) : null;
  const isEdit = userId != null;

  const { data: user, isLoading } = useKmUser(userId);

  const setTabTitle = useTabs((s) => s.setTitle);
  useEffect(() => {
    const title = isEdit
      ? (user?.username || t("modules.keys.admin.editUser"))
      : t("modules.keys.admin.addUser");
    setTabTitle(loc.pathname + loc.search, title);
  }, [isEdit, user?.username, t, loc.pathname, loc.search, setTabTitle]);
  const create = useCreateKmUser();
  const update = useUpdateKmUser();

  const [f, setF] = useState(EMPTY);
  const [isActive, setIsActive] = useState(true);
  const [activeTouched, setActiveTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit || !user) return;
    setF({
      username: user.username ?? "", password: "",
      first_name: user.first_name ?? "", last_name: user.last_name ?? "",
      email: user.email ?? "", phone: user.phone ?? "", role: user.role || "user",
    });
    setIsActive(user.is_active ?? true);
    setActiveTouched(false);
  }, [isEdit, user]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const busy = create.isPending || update.isPending;

  const submit = async () => {
    setError(null);
    try {
      if (isEdit && user) {
        const patch: KmUserUpdate & { userId: number } = { userId: user.id };
        const orig: Record<string, string> = {
          username: user.username ?? "", first_name: user.first_name ?? "",
          last_name: user.last_name ?? "", email: user.email ?? "",
          phone: user.phone ?? "", role: user.role || "user",
        };
        for (const k of ["username", "first_name", "last_name", "email", "phone", "role"] as const) {
          if (f[k].trim() !== orig[k]) (patch as Record<string, unknown>)[k] = f[k].trim();
        }
        if (f.password) patch.password = f.password;
        // Only touch is_active if the admin actually toggled it (the GET may not
        // expose the current value on un-enriched KM instances).
        if (activeTouched) patch.is_active = isActive;
        if (Object.keys(patch).length > 1) await update.mutateAsync(patch);
        nav("/keys/admin?tab=users");
      } else {
        const body: KmUserCreate = { username: f.username.trim(), password: f.password, is_active: isActive };
        for (const k of ["first_name", "last_name", "email", "phone", "role"] as const) {
          if (f[k].trim()) (body as Record<string, unknown>)[k] = f[k].trim();
        }
        await create.mutateAsync(body);
        nav("/keys/admin?tab=users");
      }
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  if (isEdit && isLoading) {
    return <div className="p-2 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-48 w-full" /></div>;
  }

  // Profile fields (account details + profile) — shared by the Profile tab in
  // edit mode and the single-form layout in create mode.
  const profileSections = (
    <>
      <Section title={t("modules.keys.admin.secAccount")}>
        <Field label={t("modules.keys.admin.username")} required>
          <Input value={f.username} onChange={set("username")} autoComplete="off" autoFocus />
        </Field>
        <Field label={isEdit ? t("modules.keys.admin.newPassword") : t("modules.keys.admin.password")} required={!isEdit}>
          <Input type="password" value={f.password} onChange={set("password")}
            autoComplete="new-password"
            placeholder={isEdit ? t("modules.keys.admin.keepPassword") : ""} />
        </Field>
        <Field label={t("modules.keys.admin.userType")}>
          <Select value={f.role} onValueChange={(v) => setF((p) => ({ ...p, role: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KM_ROLES.map((r) => <SelectItem key={r} value={r}>{t(`modules.keys.roles.${r}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("modules.keys.admin.status")}>
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-2">
            <Checkbox className="size-4"
              checked={isActive}
              onCheckedChange={(v) => { setIsActive(Boolean(v)); setActiveTouched(true); }} />
            {t("modules.keys.activeFlag.active")}
          </label>
        </Field>
      </Section>

      <Section title={t("modules.keys.admin.secProfile")}>
        <Field label={t("modules.keys.fields.firstName")}>
          <Input value={f.first_name} onChange={set("first_name")} />
        </Field>
        <Field label={t("modules.keys.admin.lastName")}>
          <Input value={f.last_name} onChange={set("last_name")} />
        </Field>
        <Field label={t("modules.keys.fields.email")}>
          <Input type="email" value={f.email} onChange={set("email")} />
        </Field>
        <Field label={t("modules.keys.fields.phone")}>
          <Input value={f.phone} onChange={set("phone")} className="font-mono" placeholder="+99890…" />
        </Field>
      </Section>
    </>
  );

  const footer = (
    <FormFooter
      onCancel={() => nav("/keys/admin?tab=users")}
      onSave={submit}
      saving={busy}
      cancelLabel={t("common.cancel")}
      saveLabel={isEdit ? t("common.save") : t("common.create")}
      disabled={!f.username.trim() || (!isEdit && !f.password.trim())}
    />
  );

  return (
    <FadeIn className="max-w-2xl mx-auto space-y-4 pb-4">
      <FormPageHeader
        title={isEdit ? t("modules.keys.admin.editUser") : t("modules.keys.admin.addUser")}
        subtitle={t("modules.keys.admin.addUserHint")}
        onBack={() => nav("/keys/admin?tab=users")}
      />

      <ErrorBox text={error} />

      {isEdit && userId != null ? (
        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">{t("modules.keys.admin.tabProfile")}</TabsTrigger>
            <TabsTrigger value="permissions">{t("modules.keys.admin.tabPermissions")}</TabsTrigger>
            <TabsTrigger value="password">{t("modules.keys.admin.tabPassword")}</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            {profileSections}
            {footer}
          </TabsContent>

          {/* RBAC permission grants — a user must exist first, so edit mode only. */}
          <TabsContent value="permissions">
            <Section title={t("modules.access.assignments.title")}>
              <div className="sm:col-span-2">
                <UserGrantsEditor userId={userId} />
              </div>
            </Section>
          </TabsContent>

          {/* Reset password — resets the login password (mirrored to the auth shadow). */}
          <TabsContent value="password">
            <Section title={t("modules.keys.admin.resetPassword")}>
              <div className="sm:col-span-2">
                <ResetPasswordBox userId={userId} />
              </div>
            </Section>
          </TabsContent>
        </Tabs>
      ) : (
        <>
          {profileSections}
          {footer}
        </>
      )}
    </FadeIn>
  );
}

// ── Reset password ───────────────────────────────────────────────────────────

function ResetPasswordBox({ userId }: { userId: number }) {
  const { t } = useTranslation();
  const update = useUpdateKmUser();
  const [pw, setPw] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = async () => {
    setErr(null);
    setDone(false);
    try {
      await update.mutateAsync({ userId, password: pw });
      setPw("");
      setDone(true);
    } catch (e) {
      setErr(apiErrorText(e));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setDone(false); }}
          autoComplete="new-password"
          placeholder={t("modules.keys.admin.newPassword")}
          className="max-w-xs"
        />
        <Button variant="outline" onClick={reset} disabled={update.isPending || pw.trim().length === 0}>
          {t("modules.keys.admin.resetPassword")}
        </Button>
        {done && !update.isPending && (
          <span className="text-sm text-success">{t("common.saved", { defaultValue: "Saqlandi ✓" })}</span>
        )}
      </div>
      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive break-words">
          {err}
        </div>
      )}
    </div>
  );
}
