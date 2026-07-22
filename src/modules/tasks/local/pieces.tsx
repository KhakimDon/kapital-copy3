import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check, ChevronDown, ChevronsDown, ChevronsUp, ChevronUp, Equal, Plus, Search, Tag, X,
} from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/lib/utils";
import { Zap } from "lucide-react";
import { PRIORITY_META, PRIORITIES, SWATCHES, type EpicRef, type Member, type Priority } from "./model";
import { MemberAvatar, resolveMember } from "./util";

// ── epic chip + picker ──────────────────────────────────────────────────────
export function EpicChip({ epic, onRemove }: { epic: EpicRef; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none"
      style={{ background: `${epic.color}22`, color: epic.color }}
      title={`${epic.projectKey}-${epic.seq} · ${epic.title}`}
    >
      <Zap className="size-2.5 shrink-0" />
      <span className="truncate">{epic.title}</span>
      {onRemove && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="hover:opacity-70">
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}

export function EpicSelect({
  epics,
  value,
  onChange,
}: {
  epics: EpicRef[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const cur = epics.find((e) => e.id === value);
  const list = epics.filter((e) => (e.title + e.projectKey).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex w-full items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-left hover:bg-muted/50">
          {cur ? (
            <EpicChip epic={cur} />
          ) : (
            <span className="text-sm text-muted-foreground">{t("modules.tasks.epic.none", { defaultValue: "Epik yo'q" })}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="p-2 pb-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("modules.tasks.epic.search", { defaultValue: "Epik qidirish…" })} className="h-8 pl-7 text-sm" autoFocus />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-foreground/[0.06]">
            {t("modules.tasks.epic.none", { defaultValue: "Epik yo'q" })}
            {!value && <Check className="ml-auto size-4 text-primary" />}
          </button>
          {list.map((e) => (
            <button key={e.id} type="button" onClick={() => { onChange(e.id); setOpen(false); }} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-foreground/[0.06]">
              <span className="size-2 shrink-0 rounded-full" style={{ background: e.color }} />
              <span className="font-mono text-[11px] text-muted-foreground">{e.projectKey}-{e.seq}</span>
              <span className="flex-1 truncate text-left">{e.title}</span>
              {value === e.id && <Check className="size-4 text-primary" />}
            </button>
          ))}
          {list.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">{t("modules.tasks.epic.empty", { defaultValue: "Epik topilmadi" })}</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── priority ──────────────────────────────────────────────────────────────────
export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  // Guard against an unknown/empty priority (bad/legacy data) — never crash.
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  const Icon =
    meta.icon === "urgent" ? ChevronsUp
      : meta.icon === "up" ? ChevronUp
      : meta.icon === "eq" ? Equal
      : meta.icon === "down" ? ChevronDown
      : ChevronsDown;
  return <Icon className={cn("size-4 shrink-0", className)} style={{ color: meta.color }} />;
}

export function PriorityBadge({ priority, showLabel = true }: { priority: Priority; showLabel?: boolean }) {
  const { t } = useTranslation();
  const meta = PRIORITY_META[priority];
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <PriorityIcon priority={priority} />
      {showLabel && <span style={{ color: meta.color }}>{t(meta.labelKey, { defaultValue: meta.label })}</span>}
    </span>
  );
}

export function PriorityMenu({
  value,
  onChange,
  children,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {PRIORITIES.map((p) => {
          const meta = PRIORITY_META[p];
          return (
            <DropdownMenuItem key={p} onClick={() => onChange(p)} className="gap-2">
              <PriorityIcon priority={p} />
              <span className="flex-1">{t(meta.labelKey, { defaultValue: meta.label })}</span>
              {value === p && <Check className="size-3.5 opacity-70" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── avatars ───────────────────────────────────────────────────────────────────
export function AvatarStack({
  memberIds,
  members,
  size = 22,
  max = 4,
}: {
  memberIds: string[];
  members: Member[];
  size?: number;
  max?: number;
}) {
  const shown = memberIds.slice(0, max);
  const extra = memberIds.length - shown.length;
  return (
    <div className="flex items-center" style={{ paddingLeft: shown.length > 1 ? 4 : 0 }}>
      {shown.map((id, i) => {
        const m = resolveMember(members, id);
        return (
          <span key={id} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: max - i }}>
            <MemberAvatar member={m} size={size} ring />
          </span>
        );
      })}
      {extra > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-medium ring-2 ring-background"
          style={{ width: size, height: size, fontSize: size * 0.38, marginLeft: -6 }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

// ── member picker (multi or single) ─────────────────────────────────────────
export function MemberPicker({
  members,
  selected,
  onToggle,
  single = false,
  trigger,
  align = "start",
  title,
}: {
  members: Member[];
  selected: string[];
  onToggle: (id: string) => void;
  single?: boolean;
  trigger: React.ReactNode;
  align?: "start" | "end" | "center";
  title?: string;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const list = useMemo(
    () => members.filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase())),
    [members, q],
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-0">
        {title && <div className="px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">{title}</div>}
        <div className="p-2 pb-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("modules.tasks.pickers.searchMember", { defaultValue: "Xodim qidirish…" })}
              className="h-8 pl-7 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {list.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {t("modules.tasks.pickers.noMember", { defaultValue: "Topilmadi" })}
            </div>
          )}
          {list.map((m) => {
            const on = selected.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onToggle(m.id);
                  if (single) setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-foreground/[0.06] transition-colors"
              >
                <MemberAvatar member={m} size={22} />
                <span className="flex-1 truncate text-left">{m.name}</span>
                {on && <Check className="size-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── label picker ────────────────────────────────────────────────────────────
export function LabelPicker({
  allLabels,
  selected,
  onToggle,
  trigger,
}: {
  allLabels: string[];
  selected: string[];
  onToggle: (label: string) => void;
  trigger: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const query = q.trim();
  const matches = allLabels.filter((l) => l.toLowerCase().includes(query.toLowerCase()));
  const canCreate = query && !allLabels.some((l) => l.toLowerCase() === query.toLowerCase());
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <div className="p-2 pb-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("modules.tasks.pickers.labelPlaceholder", { defaultValue: "Yorliq…" })}
            className="h-8 text-sm"
            autoFocus
          />
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {matches.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => onToggle(l)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-foreground/[0.06] transition-colors"
            >
              <LabelChip label={l} />
              <span className="flex-1" />
              {selected.includes(l) && <Check className="size-4 text-primary" />}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onClick={() => { onToggle(query); setQ(""); }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-foreground/[0.06] transition-colors"
            >
              <Plus className="size-3.5" />
              <span>{t("modules.tasks.pickers.createLabel", { defaultValue: 'Yaratish' })}: “{query}”</span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const labelColor = (label: string): string => {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) & 0xffffffff;
  return SWATCHES[Math.abs(h) % SWATCHES.length];
};

export function LabelChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  const c = labelColor(label);
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none"
      style={{ background: `${c}22`, color: c }}
    >
      <Tag className="size-2.5" />
      {label}
      {onRemove && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="hover:opacity-70">
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}
