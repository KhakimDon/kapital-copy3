// Mail module — backend API (TanStack Query). Mirrors `crates/api/src/modules/
// mail.rs`; keep these shapes in sync with that file. The webmail is a CLIENT:
// each user attaches external IMAP/SMTP mailboxes and we sync/read/send on their
// behalf. All state is cached server-side; the UI reads it here.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type { MailFolderId } from "./types";

const BASE = "/mail";
/** Message-list page size (drives lazy scroll-to-load-older). */
export const PAGE_SIZE = 40;

// ── types (backend contract) ────────────────────────────────────────────────

export type MailProvider = {
  id: string;
  label: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  hint: string;
  custom: boolean;
};

export type MailAccount = {
  id: string;
  provider: string;
  email: string;
  displayName: string;
  color: string;
  lastSyncAt: string | null;
};

export type MailAddr = { name: string; email: string };

export type MailListItem = {
  id: string;
  accountId: string;
  folder: MailFolderId;
  from: MailAddr;
  to: MailAddr[];
  subject: string;
  preview: string;
  date: string;
  read: boolean;
  starred: boolean;
  hasAttachments: boolean;
};

export type MailAttachmentMeta = { name: string; size: number; mime: string };

export type MailMessageFull = MailListItem & {
  cc: MailAddr[];
  bodyHtml: string | null;
  bodyText: string | null;
  attachments: MailAttachmentMeta[];
};

// ── queries ─────────────────────────────────────────────────────────────────

export function useProviders() {
  return useQuery({
    queryKey: ["mail", "providers"],
    queryFn: async () => (await api.get<{ items: MailProvider[] }>(`${BASE}/providers`)).data.items,
    staleTime: Infinity,
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: ["mail", "accounts"],
    queryFn: async () => (await api.get<{ items: MailAccount[] }>(`${BASE}/accounts`)).data.items,
  });
}

/** Unread counts per canonical folder for the selected account (or "all"). */
export function useFolderUnread(account: string) {
  return useQuery({
    queryKey: ["mail", "folders", account],
    queryFn: async () =>
      (await api.get<{ unread: Record<string, number> }>(`${BASE}/folders`, { params: { account } })).data.unread,
  });
}

/** Paginated message list. Each page pull triggers an on-demand IMAP backfill on
 *  the backend, so scrolling keeps loading older mail (lazy history). */
export function useMessages(account: string, folder: MailFolderId, q: string) {
  return useInfiniteQuery({
    queryKey: ["mail", "messages", account, folder, q],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<{ items: MailListItem[]; page: number }>(`${BASE}/messages`, {
          params: { account, folder, q: q || undefined, page: pageParam, limit: PAGE_SIZE },
        })
      ).data.items,
    getNextPageParam: (lastPage, allPages) => (lastPage.length === PAGE_SIZE ? allPages.length : undefined),
  });
}

export function useMessage(id: string | null) {
  return useQuery({
    queryKey: ["mail", "message", id],
    enabled: !!id,
    queryFn: async () => (await api.get<MailMessageFull>(`${BASE}/messages/${id}`)).data,
  });
}

// ── mutations ────────────────────────────────────────────────────────────────

export type AddAccountInput = {
  provider: string;
  email: string;
  password: string;
  displayName?: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
};

export function useAddAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddAccountInput) => (await api.post<MailAccount>(`${BASE}/accounts`, input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail", "accounts"] });
      qc.invalidateQueries({ queryKey: ["mail", "messages"] });
      qc.invalidateQueries({ queryKey: ["mail", "folders"] });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`${BASE}/accounts/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail"] });
    },
  });
}

export function useSyncAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<{ synced: number }>(`${BASE}/accounts/${id}/sync`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail", "messages"] });
      qc.invalidateQueries({ queryKey: ["mail", "folders"] });
    },
  });
}

export function useSetFlags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, read, starred }: { id: string; read?: boolean; starred?: boolean }) =>
      (await api.post(`${BASE}/messages/${id}/flags`, { read, starred })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail", "messages"] });
      qc.invalidateQueries({ queryKey: ["mail", "folders"] });
    },
  });
}

export function useMoveMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, folder }: { id: string; folder: MailFolderId }) =>
      (await api.post(`${BASE}/messages/${id}/move`, { folder })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail", "messages"] });
      qc.invalidateQueries({ queryKey: ["mail", "folders"] });
    },
  });
}

export type SendInput = {
  accountId: string;
  to: string;
  cc?: string;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
};

export function useSendMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendInput) =>
      (
        await api.post(`${BASE}/send`, {
          account_id: Number(input.accountId),
          to: input.to,
          cc: input.cc,
          subject: input.subject,
          body_text: input.bodyText,
          body_html: input.bodyHtml,
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail", "messages"] });
    },
  });
}

// ── translation (reuses the shared AI endpoint) ──────────────────────────────

/** Whether the backend AI (OpenAI) integration is configured. */
export function useAiEnabled() {
  return useQuery({
    queryKey: ["ai", "status"],
    queryFn: async () => (await api.get<{ enabled: boolean }>("/ai/status")).data.enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export type TranslateAction = "translate_ru" | "translate_uz" | "translate_en";

/** Translate arbitrary text via `/ai/wiki` (same actions the wiki toolbar uses). */
export function useTranslate() {
  return useMutation({
    mutationFn: async ({ action, text }: { action: TranslateAction; text: string }) =>
      (await api.post<{ output: string }>("/ai/wiki", { action, text })).data.output,
  });
}

// ── per-user prefs (last-opened account view) ────────────────────────────────

/** The account view the user last opened ("all" or an account id; "" if none). */
export function useMailPrefs() {
  return useQuery({
    queryKey: ["mail", "prefs"],
    queryFn: async () => (await api.get<{ lastAccount: string }>(`${BASE}/prefs`)).data.lastAccount,
    staleTime: 60_000,
  });
}

/** Persist the account view the user just switched to. */
export function useSetMailPref() {
  return useMutation({
    mutationFn: async (lastAccount: string) => (await api.put(`${BASE}/prefs`, { last_account: lastAccount })).data,
  });
}
