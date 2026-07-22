// Mail module — domain types. Self-contained: this module is a standalone email
// web-client shell that runs entirely on a local mock store (see ./store.ts) so
// it can be built out in isolation without any backend. When a backend arrives,
// keep these shapes as the contract and swap the store's data source.

export type MailFolderId =
  | "inbox"
  | "starred"
  | "sent"
  | "drafts"
  | "archive"
  | "spam"
  | "trash";

export type MailAddress = {
  name: string;
  email: string;
};

export type MailAttachment = {
  id: string;
  name: string;
  size: number; // bytes
  mime: string;
};

export type MailLabel = {
  id: string;
  name: string;
  color: string; // hex
};

export type MailMessage = {
  id: string;
  folder: MailFolderId;
  from: MailAddress;
  to: MailAddress[];
  cc?: MailAddress[];
  subject: string;
  /** Short plain-text snippet shown in the list. */
  preview: string;
  /** Full body — plain text for the scaffold; swap to sanitized HTML later. */
  body: string;
  date: string; // ISO
  read: boolean;
  starred: boolean;
  labelIds: string[];
  attachments: MailAttachment[];
};

/** Draft being composed (a subset of a message). */
export type MailDraft = {
  to: string;
  cc?: string;
  subject: string;
  body: string;
};
