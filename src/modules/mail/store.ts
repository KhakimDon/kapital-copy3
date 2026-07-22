// Mail module — local-first store (zustand + persist), the single source of
// truth for the standalone shell. Seeded with mock messages so /mail renders a
// believable mailbox out of the box. When wiring a real backend, replace the
// seed + the mutating actions with API calls (keep the same action names/shapes
// so page.tsx doesn't change).
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { MailDraft, MailFolderId, MailLabel, MailMessage } from "./types";

export const FOLDERS: { id: MailFolderId; icon: string; labelKey: string; label: string }[] = [
  { id: "inbox", icon: "Inbox", labelKey: "modules.mail.folders.inbox", label: "Inbox" },
  { id: "starred", icon: "Star", labelKey: "modules.mail.folders.starred", label: "Starred" },
  { id: "sent", icon: "Send", labelKey: "modules.mail.folders.sent", label: "Sent" },
  { id: "drafts", icon: "FileText", labelKey: "modules.mail.folders.drafts", label: "Drafts" },
  { id: "archive", icon: "Archive", labelKey: "modules.mail.folders.archive", label: "Archive" },
  { id: "spam", icon: "ShieldAlert", labelKey: "modules.mail.folders.spam", label: "Spam" },
  { id: "trash", icon: "Trash2", labelKey: "modules.mail.folders.trash", label: "Trash" },
];

export const SEED_LABELS: MailLabel[] = [
  { id: "work", name: "Work", color: "#3390ec" },
  { id: "finance", name: "Finance", color: "#22c55e" },
  { id: "personal", name: "Personal", color: "#f59e0b" },
];

// A tiny deterministic seed (no Date.now() so it stays stable across reloads).
const SEED: MailMessage[] = [
  {
    id: "m1",
    folder: "inbox",
    from: { name: "AIBA Team", email: "team@aiba.uz" },
    to: [{ name: "You", email: "you@company.uz" }],
    subject: "Welcome to AIBA Mail",
    preview: "Your mailbox is ready. This is a scaffold you can build on…",
    body:
      "Salom!\n\nThis Mail module is a standalone shell running on a local mock store.\n\nStart wiring real functionality in this folder — it's isolated from the rest of the app.\n\n— AIBA",
    date: "2026-07-18T09:15:00.000Z",
    read: false,
    starred: true,
    labelIds: ["work"],
    attachments: [],
  },
  {
    id: "m2",
    folder: "inbox",
    from: { name: "Ipak Yo'li Bank", email: "noreply@ipakyulibank.uz" },
    to: [{ name: "You", email: "you@company.uz" }],
    subject: "Hisobingiz bo'yicha oylik hisobot",
    preview: "Iyun oyi bo'yicha hisobot tayyor. Ilova qilingan faylni ko'ring.",
    body: "Hurmatli mijoz,\n\nIyun oyi bo'yicha hisobingiz hisoboti tayyor.\n\nHurmat bilan,\nBank",
    date: "2026-07-17T14:02:00.000Z",
    read: false,
    starred: false,
    labelIds: ["finance"],
    attachments: [{ id: "a1", name: "hisobot-iyun.pdf", size: 248000, mime: "application/pdf" }],
  },
  {
    id: "m3",
    folder: "inbox",
    from: { name: "Jasurbek", email: "jasurbek@company.uz" },
    to: [{ name: "You", email: "you@company.uz" }],
    subject: "Loyiha bo'yicha uchrashuv",
    preview: "Ertaga soat 15:00 da uchrashamizmi? Kun tartibini ilova qildim.",
    body: "Assalomu alaykum,\n\nErtaga 15:00 da loyiha bo'yicha uchrashsak bo'ladimi?\n\nRahmat.",
    date: "2026-07-16T11:30:00.000Z",
    read: true,
    starred: false,
    labelIds: ["work"],
    attachments: [],
  },
  {
    id: "m4",
    folder: "sent",
    from: { name: "You", email: "you@company.uz" },
    to: [{ name: "Jasurbek", email: "jasurbek@company.uz" }],
    subject: "Re: Loyiha bo'yicha uchrashuv",
    preview: "Ha, 15:00 menga mos. Zoom havolasini yuboraman.",
    body: "Ha, 15:00 menga mos keladi.\n\nZoom havolasini keyinroq yuboraman.",
    date: "2026-07-16T12:05:00.000Z",
    read: true,
    starred: false,
    labelIds: [],
    attachments: [],
  },
  {
    id: "m5",
    folder: "drafts",
    from: { name: "You", email: "you@company.uz" },
    to: [{ name: "", email: "" }],
    subject: "(qoralama)",
    preview: "Hisob-faktura bo'yicha savol…",
    body: "Hisob-faktura bo'yicha bir savol bor edi…",
    date: "2026-07-15T08:00:00.000Z",
    read: true,
    starred: false,
    labelIds: [],
    attachments: [],
  },
];

type MailState = {
  messages: MailMessage[];
  labels: MailLabel[];
  markRead: (id: string, read?: boolean) => void;
  toggleStar: (id: string) => void;
  move: (id: string, folder: MailFolderId) => void;
  remove: (id: string) => void; // → trash, or permanent if already in trash
  send: (draft: MailDraft) => string; // adds to "sent", returns new id
  saveDraft: (draft: MailDraft) => string;
};

/** Split a comma/semicolon list of addresses into MailAddress[]. */
function parseAddrs(v: string): { name: string; email: string }[] {
  return v
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((email) => ({ name: email.split("@")[0], email }));
}

// Stable id counter seeded high so it never collides with the mock ids. Uses a
// module-level counter (not Date.now) to stay deterministic.
let idc = 100;
const nextId = () => `m${idc++}`;

export const useMailStore = create<MailState>()(
  persist(
    (set) => ({
      messages: SEED,
      labels: SEED_LABELS,
      markRead: (id, read = true) =>
        set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, read } : m)) })),
      toggleStar: (id) =>
        set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, starred: !m.starred } : m)) })),
      move: (id, folder) =>
        set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, folder } : m)) })),
      remove: (id) =>
        set((s) => ({
          messages: s.messages
            .map((m) => (m.id === id && m.folder !== "trash" ? { ...m, folder: "trash" as MailFolderId } : m))
            .filter((m) => !(m.id === id && m.folder === "trash")),
        })),
      send: (draft) => {
        const id = nextId();
        set((s) => ({
          messages: [
            {
              id,
              folder: "sent",
              from: { name: "You", email: "you@company.uz" },
              to: parseAddrs(draft.to),
              cc: draft.cc ? parseAddrs(draft.cc) : undefined,
              subject: draft.subject || "(mavzusiz)",
              preview: draft.body.slice(0, 80),
              body: draft.body,
              // Stamped by page code after send (store stays Date.now-free); a
              // placeholder ISO keeps ordering sane until then.
              date: new Date(0).toISOString(),
              read: true,
              starred: false,
              labelIds: [],
              attachments: [],
            },
            ...s.messages,
          ],
        }));
        return id;
      },
      saveDraft: (draft) => {
        const id = nextId();
        set((s) => ({
          messages: [
            {
              id,
              folder: "drafts",
              from: { name: "You", email: "you@company.uz" },
              to: parseAddrs(draft.to),
              subject: draft.subject || "(qoralama)",
              preview: draft.body.slice(0, 80),
              body: draft.body,
              date: new Date(0).toISOString(),
              read: true,
              starred: false,
              labelIds: [],
              attachments: [],
            },
            ...s.messages,
          ],
        }));
        return id;
      },
    }),
    { name: "aiba-mail", version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);

/** Unread count per folder (inbox-like folders). */
export function unreadByFolder(messages: MailMessage[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of messages) if (!m.read) out[m.folder] = (out[m.folder] ?? 0) + 1;
  return out;
}
