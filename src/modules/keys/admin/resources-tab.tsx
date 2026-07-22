import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Plus, Trash2, Pencil, Users as UsersIcon, ExternalLink } from "lucide-react";

import { api } from "@/shared/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiErrorText } from "../admin-dialogs";

// Resurs (kripto-imzo bilan ishlash uchun ruxsatlangan sayt).
//
// Extension `GET /api/resources/`'gа boradi va **admin barcha resurslarни**,
// **non-admin faqat `km.resource_accessible_users` orqali attach qilinganlarni**
// oladi. Bu tab admin'gа: qo'shish/edit/o'chir + har resurs uchun user matrix.
type Resource = { id: number; name: string | null; url: string | null };
type KmUser = { id: number; username: string; first_name?: string | null };

function useResources() {
  return useQuery<Resource[]>({
    queryKey: ["km", "admin", "resources"],
    queryFn: async () => (await api.get<Resource[]>("/keys/admin/resources")).data,
    staleTime: 15_000,
  });
}

function useKmUsersList() {
  return useQuery<KmUser[]>({
    queryKey: ["km", "admin", "users"],
    queryFn: async () => (await api.get<KmUser[]>("/keys/admin/users")).data,
    staleTime: 30_000,
  });
}

function useResourceUsers(rid: number | null) {
  return useQuery<{ user_ids: number[] }>({
    queryKey: ["km", "admin", "resources", rid, "users"],
    enabled: rid != null,
    queryFn: async () =>
      (await api.get<{ user_ids: number[] }>(`/keys/admin/resources/${rid}/users`)).data,
  });
}

export function ResourcesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: rows, isLoading, refetch } = useResources();
  const [openForm, setOpenForm] = useState<{ id?: number; name: string; url: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<Resource | null>(null);
  const [assignFor, setAssignFor] = useState<Resource | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const del = useMutation({
    mutationFn: async (id: number) => api.delete(`/keys/admin/resources/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["km", "admin", "resources"] });
      setConfirmDel(null);
    },
    onError: (e) => setErr(apiErrorText(e)),
  });

  const save = useMutation({
    mutationFn: async (v: { id?: number; name: string; url: string }) => {
      if (v.id) return api.patch(`/keys/admin/resources/${v.id}`, { name: v.name, url: v.url });
      return api.post("/keys/admin/resources", { name: v.name, url: v.url });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["km", "admin", "resources"] });
      setOpenForm(null);
    },
    onError: (e) => setErr(apiErrorText(e)),
  });

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-sm px-3 py-2">
          {err}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t("modules.keys.admin.resources.desc")}
        </div>
        <Button size="sm" onClick={() => setOpenForm({ name: "", url: "" })}>
          <Plus className="size-4 mr-1" /> {t("modules.keys.admin.resources.addSite")}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.keys.admin.resources.colName")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.keys.admin.resources.colUrl")}</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground w-40">{t("modules.keys.admin.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-64" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-7 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : (rows ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Globe className="size-8 opacity-60" />
                    <div className="text-sm">{t("modules.keys.admin.resources.empty")}</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              (rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name || "—"}</TableCell>
                  <TableCell>
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {r.url}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setAssignFor(r)}
                        title={t("modules.keys.admin.resources.users")}
                      >
                        <UsersIcon className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setOpenForm({ id: r.id, name: r.name ?? "", url: r.url ?? "" })}
                        title={t("common.edit")}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setConfirmDel(r)}
                        className="text-destructive hover:bg-destructive/10"
                        title={t("common.delete")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ResourceFormDialog
        open={openForm !== null}
        initial={openForm ?? { name: "", url: "" }}
        pending={save.isPending}
        onClose={() => setOpenForm(null)}
        onSubmit={(v) => save.mutate(v)}
      />

      <Dialog open={confirmDel !== null} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("modules.keys.admin.resources.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("modules.keys.admin.resources.deleteDesc", { url: confirmDel?.url ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDel(null)} disabled={del.isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={del.isPending}
              onClick={() => confirmDel && del.mutate(confirmDel.id)}
            >
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ResourceUsersDialog
        resource={assignFor}
        onClose={() => { setAssignFor(null); refetch(); }}
      />
    </div>
  );
}

function ResourceFormDialog({
  open, initial, pending, onClose, onSubmit,
}: {
  open: boolean;
  initial: { id?: number; name: string; url: string };
  pending: boolean;
  onClose: () => void;
  onSubmit: (v: { id?: number; name: string; url: string }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial.name);
  const [url, setUrl] = useState(initial.url);
  // Reset local state when the initial changes (dialog opens for a different row).
  const key = `${initial.id ?? "new"}-${open}`;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} key={key}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial.id ? t("modules.keys.admin.resources.editTitle") : t("modules.keys.admin.resources.newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block">
            <div className="text-xs font-medium text-muted-foreground mb-1">{t("modules.keys.admin.resources.colName")}</div>
            <Input
              defaultValue={initial.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Didox"
            />
          </label>
          <label className="block">
            <div className="text-xs font-medium text-muted-foreground mb-1">{t("modules.keys.admin.resources.colUrl")}</div>
            <Input
              defaultValue={initial.url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://didox.uz/"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>{t("common.cancel")}</Button>
          <Button
            disabled={pending || !url.trim()}
            onClick={() => onSubmit({ id: initial.id, name: name.trim(), url: url.trim() })}
          >
            {initial.id ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResourceUsersDialog({
  resource, onClose,
}: {
  resource: Resource | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const open = resource != null;
  const { data, isLoading } = useResourceUsers(resource?.id ?? null);
  const { data: allUsers, isLoading: usersLoading } = useKmUsersList();

  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<Set<number> | null>(null);
  // Seed the local set once per open — otherwise every fetch re-writes user
  // edits mid-flight.
  if (open && selected === null && data?.user_ids) {
    setSelected(new Set(data.user_ids));
  }
  if (!open && selected !== null) {
    setSelected(null);
  }

  const save = async () => {
    if (!resource || !selected) return;
    setPending(true);
    try {
      await api.put(`/keys/admin/resources/${resource.id}/users`, {
        user_ids: Array.from(selected),
      });
      qc.invalidateQueries({ queryKey: ["km", "admin", "resources", resource.id, "users"] });
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("modules.keys.admin.resources.accessTitle", { url: resource?.url ?? "" })}</DialogTitle>
          <DialogDescription>
            {t("modules.keys.admin.resources.accessDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
          {isLoading || usersLoading ? (
            <div className="text-sm text-muted-foreground text-center py-8">{t("common.loading", { defaultValue: "Yuklanmoqda…" })}</div>
          ) : (allUsers ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              {t("modules.keys.admin.resources.noUsers")}
            </div>
          ) : (
            (allUsers ?? []).map((u) => {
              const checked = selected?.has(u.id) ?? false;
              return (
                <label
                  key={u.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/60 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(selected ?? []);
                      if (e.target.checked) next.add(u.id);
                      else next.delete(u.id);
                      setSelected(next);
                    }}
                  />
                  <span className="text-sm">{u.first_name || u.username}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{u.username}</span>
                </label>
              );
            })
          )}
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={pending || selected === null}>{t("common.save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
