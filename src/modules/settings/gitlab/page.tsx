/**
 * GitlabSettingsPage — superadmin editor for the GitLab pipeline watch list.
 * Route: /settings/gitlab. Each repo carries its own read_api token, stored
 * server-side and never returned to the browser; the app logo flips to the
 * deploy animation while any watched pipeline is running. All GitLab traffic is
 * proxied by the backend — the SPA only ever talks to /api/v2/gitlab/*.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Save, Loader2, GitBranch, Check, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useGitlabRepos, useCreateGitlabRepo, useUpdateGitlabRepo, useDeleteGitlabRepo,
  type GitlabRepo, type GitlabRepoIn,
} from "@/shared/api/gitlab";

type Draft = {
  name: string;
  project: string;
  gitlab_url: string;
  ref: string;
  token: string;
  enabled: boolean;
};

const EMPTY: Draft = {
  name: "",
  project: "",
  gitlab_url: "https://gitlab.aiba.uz",
  ref: "main",
  token: "",
  enabled: true,
};

export function GitlabSettingsPage() {
  const { t } = useTranslation();
  const { data: repos, isLoading } = useGitlabRepos();
  const create = useCreateGitlabRepo();
  const del = useDeleteGitlabRepo();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const submitNew = () => {
    if (!draft.name.trim() || !draft.project.trim()) return;
    const body: GitlabRepoIn = {
      name: draft.name.trim(),
      project: draft.project.trim(),
      gitlab_url: draft.gitlab_url.trim() || undefined,
      ref: draft.ref.trim() || undefined,
      token: draft.token.trim() || undefined,
      enabled: draft.enabled,
    };
    create.mutate(body, {
      onSuccess: () => {
        setAdding(false);
        setDraft(EMPTY);
      },
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-1">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {t("modules.gitlab.title", { defaultValue: "GitLab pipeline monitoring" })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("modules.gitlab.subtitle", {
              defaultValue:
                "Deploy paytida logo animatsiyaga o'zgaradi. Har bir repo uchun read_api token kiriting — token serverda saqlanadi, brauzerga qaytmaydi.",
            })}
          </p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => { setDraft(EMPTY); setAdding(true); }}>
            <Plus className="size-4" /> {t("modules.gitlab.add", { defaultValue: "Repo qo'shish" })}
          </Button>
        )}
      </div>

      {adding && (
        <RepoForm
          draft={draft}
          set={set}
          onCancel={() => { setAdding(false); setDraft(EMPTY); }}
          onSave={submitNew}
          saving={create.isPending}
          isNew
        />
      )}

      <section className="space-y-2">
        {isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t("common.loading", { defaultValue: "Yuklanmoqda…" })}
          </div>
        )}
        {!isLoading && (repos ?? []).length === 0 && !adding && (
          <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            {t("modules.gitlab.empty", { defaultValue: "Hali repo qo'shilmagan." })}
          </div>
        )}
        {(repos ?? []).map((r) =>
          editingId === r.id ? (
            <EditRow key={r.id} repo={r} onClose={() => setEditingId(null)} />
          ) : (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <GitBranch className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  {!r.enabled && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {t("modules.gitlab.disabled", { defaultValue: "o'chirilgan" })}
                    </span>
                  )}
                  {r.has_token ? (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-600">
                      <Check className="size-3" /> {t("modules.gitlab.tokenSet", { defaultValue: "token bor" })}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-600">
                      <X className="size-3" /> {t("modules.gitlab.tokenMissing", { defaultValue: "token yo'q" })}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.project} · {r.ref} · {r.gitlab_url}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditingId(r.id)}
                title={t("common.edit", { defaultValue: "Tahrirlash" })}>
                <Pencil className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}
                title={t("common.delete", { defaultValue: "O'chirish" })}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ),
        )}
      </section>
    </div>
  );
}

function EditRow({ repo, onClose }: { repo: GitlabRepo; onClose: () => void }) {
  const update = useUpdateGitlabRepo();
  const [draft, setDraft] = useState<Draft>({
    name: repo.name,
    project: repo.project,
    gitlab_url: repo.gitlab_url,
    ref: repo.ref,
    token: "",
    enabled: repo.enabled,
  });
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const save = () => {
    update.mutate(
      {
        id: repo.id,
        name: draft.name.trim(),
        project: draft.project.trim(),
        gitlab_url: draft.gitlab_url.trim() || undefined,
        ref: draft.ref.trim() || undefined,
        token: draft.token.trim() || undefined, // blank keeps the stored token
        enabled: draft.enabled,
      },
      { onSuccess: onClose },
    );
  };
  return (
    <RepoForm
      draft={draft}
      set={set}
      onCancel={onClose}
      onSave={save}
      saving={update.isPending}
      hasToken={repo.has_token}
    />
  );
}

function RepoForm({
  draft, set, onCancel, onSave, saving, isNew, hasToken,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  isNew?: boolean;
  hasToken?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("modules.gitlab.fields.name", { defaultValue: "Nomi" })}>
          <Input value={draft.name} onChange={(e) => set({ name: e.target.value })}
            placeholder="backend" />
        </Field>
        <Field label={t("modules.gitlab.fields.project", { defaultValue: "Loyiha (yo'l yoki ID)" })}>
          <Input value={draft.project} onChange={(e) => set({ project: e.target.value })}
            placeholder="next/backend" />
        </Field>
        <Field label={t("modules.gitlab.fields.gitlabUrl", { defaultValue: "GitLab URL" })}>
          <Input value={draft.gitlab_url} onChange={(e) => set({ gitlab_url: e.target.value })}
            placeholder="https://gitlab.aiba.uz" />
        </Field>
        <Field label={t("modules.gitlab.fields.ref", { defaultValue: "Branch" })}>
          <Input value={draft.ref} onChange={(e) => set({ ref: e.target.value })}
            placeholder="main" />
        </Field>
        <Field
          label={t("modules.gitlab.fields.token", { defaultValue: "read_api token" })}
          hint={
            !isNew && hasToken
              ? t("modules.gitlab.tokenKeep", { defaultValue: "Bo'sh qoldirsangiz — eski token saqlanadi" })
              : undefined
          }
        >
          <Input type="password" autoComplete="off" value={draft.token}
            onChange={(e) => set({ token: e.target.value })}
            placeholder={!isNew && hasToken ? "••••••••" : "glpat-…"} />
        </Field>
        <div className="flex items-end gap-2 pb-1">
          <Switch checked={draft.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          <span className="text-sm">{t("modules.gitlab.fields.enabled", { defaultValue: "Faol" })}</span>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t("common.cancel", { defaultValue: "Bekor qilish" })}
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving || !draft.name.trim() || !draft.project.trim()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("common.save", { defaultValue: "Saqlash" })}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground/80">{hint}</span>}
    </label>
  );
}
