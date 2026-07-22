// Mime/extension → icon + color, NC-style file-type visuals.
import {
  File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet,
  FileText, FileVideo, Folder, type LucideIcon,
} from "lucide-react";
import type { FileNode } from "./types";

const EXT_MAP: Record<string, { icon: LucideIcon; cls: string }> = {
  pdf: { icon: FileText, cls: "text-red-500" },
  doc: { icon: FileText, cls: "text-blue-600" },
  docx: { icon: FileText, cls: "text-blue-600" },
  odt: { icon: FileText, cls: "text-blue-600" },
  xls: { icon: FileSpreadsheet, cls: "text-green-600" },
  xlsx: { icon: FileSpreadsheet, cls: "text-green-600" },
  ods: { icon: FileSpreadsheet, cls: "text-green-600" },
  csv: { icon: FileSpreadsheet, cls: "text-green-600" },
  zip: { icon: FileArchive, cls: "text-amber-600" },
  rar: { icon: FileArchive, cls: "text-amber-600" },
  "7z": { icon: FileArchive, cls: "text-amber-600" },
  js: { icon: FileCode, cls: "text-yellow-600" },
  ts: { icon: FileCode, cls: "text-yellow-600" },
  py: { icon: FileCode, cls: "text-yellow-600" },
  json: { icon: FileCode, cls: "text-yellow-600" },
  xml: { icon: FileCode, cls: "text-yellow-600" },
  html: { icon: FileCode, cls: "text-yellow-600" },
};

export function nodeVisual(n: Pick<FileNode, "is_dir" | "mime" | "name">): { Icon: LucideIcon; cls: string } {
  if (n.is_dir) return { Icon: Folder, cls: "text-primary" };
  const mime = n.mime || "";
  if (mime.startsWith("image/")) return { Icon: FileImage, cls: "text-violet-500" };
  if (mime.startsWith("video/")) return { Icon: FileVideo, cls: "text-pink-500" };
  if (mime.startsWith("audio/")) return { Icon: FileAudio, cls: "text-cyan-600" };
  const ext = n.name.includes(".") ? n.name.split(".").pop()!.toLowerCase() : "";
  const hit = EXT_MAP[ext];
  if (hit) return { Icon: hit.icon, cls: hit.cls };
  if (mime.startsWith("text/")) return { Icon: FileText, cls: "text-muted-foreground" };
  return { Icon: File, cls: "text-muted-foreground" };
}

const SHEET_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
]);
const SHEET_EXTS = new Set(["xlsx", "xls", "csv"]);

export type PreviewKind = "image" | "pdf" | "sheet" | "text" | null;

export function previewKind(n: FileNode): PreviewKind {
  if (n.is_dir) return null;
  const mime = n.mime || "";
  const ext = n.name.includes(".") ? n.name.split(".").pop()!.toLowerCase() : "";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (SHEET_MIMES.has(mime) || SHEET_EXTS.has(ext)) return "sheet";
  if (mime.startsWith("text/")) return "text";
  return null;
}

export const isPreviewable = (n: FileNode) => previewKind(n) !== null;
