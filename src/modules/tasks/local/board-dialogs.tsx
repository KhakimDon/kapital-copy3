import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  AlignLeft, Archive, ArrowLeft, Calendar, CalendarClock, Camera, Check, ChevronDown, ChevronUp, ChevronsUpDown, Clock,
  Flag, FolderPlus, Hash, Image as ImageIcon, ListChecks, ListTree, Lock, Maximize2, MessageSquare, Minimize2,
  Plus, Rows3, Send, Settings2, ShieldCheck, SlidersHorizontal, Tag, Trash2, User, Users, X, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/shared/lib/utils";
import { useUrlState } from "@/shared/hooks/use-url-state";
import { useTasksStore } from "./store";
import { useDensity, setDensity } from "./use-density";
import {
  DEFAULT_CARD_CONFIG, SWATCHES, SWIMLANES, TASK_PERMISSIONS, type Attachment, type Card, type CardConfig,
  type ColumnCategory, type Priority, type Project, type ProjectAccess, type Swimlane,
  type TaskPermission, type TaskRole,
} from "./model";
import { myPerms } from "./perms";
import { AutotasksSection } from "./autotasks-section";
import { useMe } from "@/shared/api/me";
import { MemberPicker, PriorityBadge, PriorityMenu } from "./pieces";
import { AttachmentsSection, RichDescription, htmlToText, imageCover, imageThumbFile } from "./attachments";
import { uploadToFolder, useResolvedSrc } from "@/shared/files/media";
import { useCompany } from "@/shared/store/company";
import { MemberAvatar, resolveMember, uid } from "./util";

// Per-(project, me) "last chosen assignee" memory for the New Task dialog, so
// after you assign e.g. Asliddin once, the next new task in that project
// pre-selects him — until you change it. `__none__` records an explicit
// "unassigned" so that also persists. Scoped to this browser/account.
const NONE = "__none__";
const lastAssigneeKey = (projectId: string, me: string | null) =>
  `aiba:tasks:lastAssignee:${projectId}:${me ?? "-"}`;
function readLastAssignee(projectId: string, me: string | null): string | null | undefined {
  try {
    const v = localStorage.getItem(lastAssigneeKey(projectId, me));
    if (v === null) return undefined; // never recorded → fall back to project default
    return v === NONE ? null : v;
  } catch {
    return undefined;
  }
}
function writeLastAssignee(projectId: string, me: string | null, assignee: string | null) {
  try {
    localStorage.setItem(lastAssigneeKey(projectId, me), assignee ?? NONE);
  } catch {
    /* ignore quota/availability */
  }
}
import { TelegramSection } from "./telegram-section";
import { AutomationSection } from "./automation-section";

// ── project avatar ────────────────────────────────────────────────────────────
/** Read-only project avatar: the uploaded image (files: ref / data-URL) when
 *  set, otherwise the classic coloured square with the project KEY initials. */
function ProjectAvatar({
  project,
  size = 20,
  rounded = "rounded",
  initialsLen = 2,
  className,
}: {
  project: Pick<Project, "avatar" | "color" | "key">;
  size?: number;
  rounded?: string;
  initialsLen?: number;
  className?: string;
}) {
  const { src, loading } = useResolvedSrc(project.avatar ?? null);
  const px = `${size}px`;
  if (project.avatar && src) {
    return (
      <img
        src={src}
        alt=""
        className={cn("shrink-0 object-cover", rounded, className)}
        style={{ width: px, height: px }}
      />
    );
  }
  if (project.avatar && loading) {
    return <span className={cn("shrink-0 animate-pulse bg-muted", rounded, className)} style={{ width: px, height: px }} />;
  }
  return (
    <span
      className={cn("grid shrink-0 place-items-center font-bold text-white", rounded, className)}
      style={{ width: px, height: px, background: project.color, fontSize: size * 0.4 }}
    >
      {project.key.slice(0, initialsLen)}
    </span>
  );
}

/** Editable project avatar (top of the create / settings form). Empty state =
 *  the coloured KEY-initials square with a camera overlay; click to upload,
 *  X to clear. Online → optimized thumbnail uploaded to Files (`avatar` = ref);
 *  offline (no company) → a downscaled data-URL so it still works. */
function ProjectAvatarField({
  avatar,
  color,
  projectKey,
  name,
  companyId,
  onChange,
}: {
  avatar: string | null;
  color: string;
  projectKey: string;
  name: string;
  companyId: number | null;
  onChange: (avatar: string | null) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { src, loading } = useResolvedSrc(avatar);
  const keyText = (projectKey || name || "P").toUpperCase();

  const pick = async (file: File) => {
    setBusy(true);
    try {
      if (companyId && companyId > 0) {
        try {
          const thumb = await imageThumbFile(file, 256);
          const { ref } = await uploadToFolder(companyId, ["Tasks", name || keyText, "avatar"], thumb);
          onChange(ref);
          return;
        } catch {
          /* fall through to an inline data-URL so it still works */
        }
      }
      onChange(await imageCover(file, 256, 256));
    } catch {
      /* ignore bad image */
    } finally {
      setBusy(false);
    }
  };

  const showImg = !!avatar && !!src;
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        title={t("modules.tasks.project.avatarUpload", { defaultValue: "Rasm yuklash" })}
        className="group relative grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-2xl ring-1 ring-black/10 transition hover:opacity-95 dark:ring-white/10"
        style={showImg ? undefined : { background: color }}
      >
        {showImg ? (
          <img src={src!} alt="" className="size-full object-cover" />
        ) : avatar && loading ? (
          <span className="size-full animate-pulse bg-black/10" />
        ) : (
          <span className="text-xl font-bold text-white">{keyText.slice(0, 2)}</span>
        )}
        {/* camera overlay hint */}
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/40 py-1 text-white opacity-0 transition group-hover:opacity-100">
          {busy ? (
            <span className="size-3.5 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
          ) : (
            <Camera className="size-3.5" />
          )}
        </span>
      </button>
      <div className="min-w-0">
        <div className="text-sm font-medium">{t("modules.tasks.project.avatar", { defaultValue: "Loyiha avatari" })}</div>
        <div className="mt-0.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {t("modules.tasks.project.avatarUpload", { defaultValue: "Rasm yuklash" })}
          </button>
          {avatar && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-destructive"
            >
              <X className="size-3" /> {t("common.delete", { defaultValue: "O'chirish" })}
            </button>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pick(f); }}
      />
    </div>
  );
}

// ── project picker ──────────────────────────────────────────────────────────
export function ProjectPicker({
  projects,
  activeId,
  onSelect,
  onNew,
  onSettings,
}: {
  projects: Project[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSettings?: () => void;
}) {
  const { t } = useTranslation();
  const active = projects.find((p) => p.id === activeId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 hover:bg-muted/50 transition-colors">
          {active ? (
            <>
              <ProjectAvatar project={active} size={20} />
              <span className="text-sm font-semibold max-w-[180px] truncate">{active.name}</span>
              {active.private && <Lock className="size-3 text-muted-foreground" />}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">{t("modules.tasks.project.pick", { defaultValue: "Loyiha tanlang" })}</span>
          )}
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("modules.tasks.project.projects", { defaultValue: "Loyihalar" })}</DropdownMenuLabel>
        {projects.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground">{t("modules.tasks.project.none", { defaultValue: "Loyiha yo'q" })}</div>
        )}
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} onClick={() => onSelect(p.id)} className="gap-2">
            <ProjectAvatar project={p} size={20} />
            <span className="flex-1 truncate">{p.name}</span>
            {p.private && <Lock className="size-3 text-muted-foreground" />}
            {p.id === activeId && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {active && onSettings && (
          <DropdownMenuItem onClick={onSettings} className="gap-2">
            <Settings2 className="size-4" /> {t("modules.tasks.project.settings", { defaultValue: "Loyiha sozlamalari" })}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onNew} className="gap-2">
          <FolderPlus className="size-4" /> {t("modules.tasks.project.new", { defaultValue: "Yangi loyiha" })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── project list landing (shown when several projects are accessible) ─────────
export function ProjectList({
  projects,
  cards,
  onOpen,
  onNew,
}: {
  projects: Project[];
  cards: Card[];
  onOpen: (p: Project) => void;
  onNew: () => void;
}) {
  const { t } = useTranslation();
  const countByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) if (!c.parentId) m.set(c.projectId, (m.get(c.projectId) ?? 0) + 1);
    return m;
  }, [cards]);
  return (
    <div className="animate-in fade-in-50 duration-300">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("modules.tasks.project.pickTitle", { defaultValue: "Loyihani tanlang" })}
        </h2>
        <Button size="sm" variant="outline" onClick={onNew} className="gap-1.5">
          <FolderPlus className="size-4" /> {t("modules.tasks.project.new", { defaultValue: "Yangi loyiha" })}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpen(p)}
            className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2.5">
              <ProjectAvatar project={p} size={36} rounded="rounded-lg" initialsLen={3} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold">{p.name}</span>
                  {p.private && <Lock className="size-3 shrink-0 text-muted-foreground" />}
                </div>
                <div className="font-mono text-xs text-muted-foreground">{p.key}</div>
              </div>
            </div>
            {p.description && (
              <div className="line-clamp-2 text-xs text-muted-foreground">{htmlToText(p.description)}</div>
            )}
            <div className="mt-auto pt-1 text-xs text-muted-foreground">
              {t("modules.tasks.project.taskCount", { defaultValue: "{{n}} ta vazifa", n: countByProject.get(p.id) ?? 0 })}
            </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── task roles manager (tenant-wide permission scheme) ────────────────────────
export function RolesDialog({ companyId, open, onClose }: { companyId: number; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const roles = useTasksStore((s) => s.roles);
  const saveRole = useTasksStore((s) => s.saveRole);
  const removeRole = useTasksStore((s) => s.removeRole);

  const permLabel = (p: TaskPermission) => t(`modules.tasks.perm.${p}`, { defaultValue: p });
  const addRole = () => {
    const id = uid();
    saveRole(companyId, { id, key: `r-${id.slice(0, 6)}`, name: t("modules.tasks.roles.newName", { defaultValue: "Yangi rol" }), isSystem: false, permissions: ["view", "comment"] });
  };
  const togglePerm = (role: TaskRole, p: TaskPermission) =>
    saveRole(companyId, { ...role, permissions: role.permissions.includes(p) ? role.permissions.filter((x) => x !== p) : [...role.permissions, p] });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("modules.tasks.roles.title", { defaultValue: "Rollar va ruxsatlar" })}</DialogTitle></DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-2 py-1.5 text-left">{t("modules.tasks.roles.role", { defaultValue: "Rol" })}</th>
                {TASK_PERMISSIONS.map((p) => (
                  <th key={p} className="px-1 py-1.5 text-center font-medium" title={permLabel(p)}>{permLabel(p)}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-b">
                  <td className="px-2 py-1.5">
                    {role.isSystem ? (
                      <span className="font-medium">{t(`modules.tasks.systemRole.${role.key}`, { defaultValue: role.name })}</span>
                    ) : (
                      <Input value={role.name} onChange={(e) => saveRole(companyId, { ...role, name: e.target.value })} className="h-8 w-36 text-sm" />
                    )}
                  </td>
                  {TASK_PERMISSIONS.map((p) => (
                    <td key={p} className="px-1 py-1.5 text-center">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-primary disabled:opacity-40"
                        checked={role.permissions.includes(p)}
                        disabled={role.isSystem}
                        onChange={() => togglePerm(role, p)}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1.5 text-right">
                    {!role.isSystem && (
                      <button type="button" onClick={() => removeRole(companyId, role.id)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between pt-2">
          <Button variant="outline" size="sm" onClick={addRole}><Plus className="size-4" /> {t("modules.tasks.roles.add", { defaultValue: "Rol qo'shish" })}</Button>
          <Button size="sm" onClick={onClose}>{t("common.done", { defaultValue: "Tayyor" })}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── new project dialog ────────────────────────────────────────────────────────
export function NewProjectDialog({
  companyId,
  open,
  onClose,
  onCreated,
}: {
  companyId: number | null;
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const create = useTasksStore((s) => s.createProject);
  const members = useTasksStore((s) => s.members);
  const me = useTasksStore((s) => s.currentUserId);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [color, setColor] = useState(SWATCHES[2]);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [priv, setPriv] = useState(true); // private by default
  const [memberIds, setMemberIds] = useState<string[]>(me ? [me] : []);
  const [defAssignee, setDefAssignee] = useState<string | null>(null);
  const [defReporter, setDefReporter] = useState<string | null>(me ?? null);

  useEffect(() => {
    if (open) {
      setName(""); setKey(""); setColor(SWATCHES[2]); setAvatar(null); setPriv(true);
      setMemberIds(me ? [me] : []); setDefAssignee(null); setDefReporter(me ?? null);
    }
  }, [open, me]);

  const autoKey = (key || name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);

  const submit = () => {
    if (!name.trim()) return;
    const id = create({
      companyId, name: name.trim(), key: autoKey, color, avatar, private: priv, memberIds,
      defaultAssigneeId: defAssignee, defaultReporterId: defReporter,
    });
    onCreated(id);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("modules.tasks.project.new", { defaultValue: "Yangi loyiha" })}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <ProjectAvatarField
            avatar={avatar}
            color={color}
            projectKey={autoKey}
            name={name}
            companyId={companyId}
            onChange={setAvatar}
          />
          <LabeledField label={t("modules.tasks.project.name", { defaultValue: "Nomi" })}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={t("modules.tasks.project.namePlaceholder", { defaultValue: "Masalan: Buxgalteriya" })} />
          </LabeledField>
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label={t("modules.tasks.project.key", { defaultValue: "Kalit (prefiks)" })}>
              <Input value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder={autoKey || "PRJ"} maxLength={5} />
            </LabeledField>
            <LabeledField label={t("modules.tasks.columns.color", { defaultValue: "Rang" })}>
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)} className="size-6 rounded-full grid place-items-center" style={{ background: c }}>
                    {color === c && <Check className="size-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </LabeledField>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{t("modules.tasks.project.private", { defaultValue: "Yopiq loyiha" })}</div>
                <div className="text-xs text-muted-foreground">{t("modules.tasks.project.privateHint", { defaultValue: "Faqat tanlangan a'zolar ko'radi" })}</div>
              </div>
            </div>
            <Switch checked={priv} onCheckedChange={setPriv} />
          </div>
          {priv && (
            <LabeledField label={t("modules.tasks.project.members", { defaultValue: "A'zolar" })}>
              <MemberPicker
                members={members}
                selected={memberIds}
                onToggle={(id) => setMemberIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))}
                trigger={
                  <button className="flex w-full items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 min-h-[38px] flex-wrap">
                    {memberIds.length === 0 && <span className="text-sm text-muted-foreground">{t("modules.tasks.project.pickMembers", { defaultValue: "A'zolarni tanlang" })}</span>}
                    {memberIds.map((id) => {
                      const m = members.find((x) => x.id === id);
                      return <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted px-1 py-0.5 text-xs"><MemberAvatar member={m} size={16} /> {m?.name}</span>;
                    })}
                  </button>
                }
              />
            </LabeledField>
          )}
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label={t("modules.tasks.project.defaultAssignee", { defaultValue: "Standart mas'ul" })}>
              <SingleMemberSelect members={members} value={defAssignee} onChange={setDefAssignee} placeholder={t("modules.tasks.unassigned", { defaultValue: "Tayinlanmagan" })} />
            </LabeledField>
            <LabeledField label={t("modules.tasks.project.defaultReporter", { defaultValue: "Standart muallif" })}>
              <SingleMemberSelect members={members} value={defReporter} onChange={setDefReporter} placeholder="—" />
            </LabeledField>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t("modules.tasks.actions.cancel", { defaultValue: "Bekor qilish" })}</Button>
          <Button onClick={submit} disabled={!name.trim()}>{t("modules.tasks.actions.create", { defaultValue: "Yaratish" })}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── project settings PAGE (dedicated route with a secondary sidebar nav) ───────
type SettingsSection = "general" | "access" | "columns" | "automation" | "autotasks" | "telegram" | "danger";

const SETTINGS_NAV: { key: SettingsSection; label: string; Icon: typeof Settings2; danger?: boolean; perm?: TaskPermission }[] = [
  { key: "general", label: "Umumiy", Icon: Settings2 },
  { key: "access", label: "Kirish va rollar", Icon: ShieldCheck },
  { key: "columns", label: "Ustunlar", Icon: Rows3 },
  { key: "automation", label: "Avtomatlashtirish", Icon: Zap },
  // Gated: only roles granted the "autotask" permission see this entry.
  { key: "autotasks", label: "Avtotasklar", Icon: CalendarClock, perm: "autotask" },
  { key: "telegram", label: "Telegram", Icon: Send },
  { key: "danger", label: "Xavfli zona", Icon: Trash2, danger: true },
];

export function ProjectSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projectKey] = useUrlState("project", "");
  const [sectionRaw, setSection] = useUrlState("s", "general");
  const section = sectionRaw as SettingsSection;

  const projects = useTasksStore((s) => s.projects);
  const project = useMemo(
    () => projects.find((p) => p.key.toLowerCase() === projectKey.toLowerCase()) ?? null,
    [projects, projectKey],
  );

  const update = useTasksStore((s) => s.updateProject);
  const remove = useTasksStore((s) => s.deleteProject);
  const members = useTasksStore((s) => s.members);
  const roles = useTasksStore((s) => s.roles);

  // Autotasks is opt-in per role: hide both the nav entry and the panel unless
  // this user's role carries the "autotask" permission.
  const meId = useTasksStore((s) => s.currentUserId);
  const { data: meInfo } = useMe();
  const perms = useMemo(
    () => myPerms(project, meId, !!(meInfo?.is_admin || meInfo?.is_superadmin), roles),
    [project, meId, meInfo, roles],
  );
  const canAutotask = perms.has("autotask");
  const visibleNav = useMemo(
    () => SETTINGS_NAV.filter((n) => !n.perm || perms.has(n.perm)),
    [perms],
  );

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [color, setColor] = useState(SWATCHES[0]);
  const [priv, setPriv] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [defAssignee, setDefAssignee] = useState<string | null>(null);
  const [defReporter, setDefReporter] = useState<string | null>(null);
  const [access, setAccess] = useState<ProjectAccess[]>([]);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // Seed the form from the resolved project (same as the dialog did on open).
  const projectId = project?.id;
  useEffect(() => {
    if (!project) return;
    setName(project.name); setKey(project.key); setDescription(project.description ?? "");
    setAvatar(project.avatar ?? null);
    setColor(project.color); setPriv(project.private); setMemberIds(project.memberIds);
    setOwnerId(project.ownerId || null); setAccess(project.access ?? []);
    setDefAssignee(project.defaultAssigneeId ?? null); setDefReporter(project.defaultReporterId ?? null);
    setConfirmDel(false);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const backToBoard = () => navigate(`/tasks?project=${project?.key ?? ""}`);

  if (!project) {
    return (
      <div className="flex h-[calc(100dvh-66px)] flex-col items-center justify-center gap-4 text-center max-md:h-[calc(100dvh-56px)]">
        <div className="grid size-16 place-items-center rounded-2xl bg-muted"><Settings2 className="size-8 text-muted-foreground" /></div>
        <div className="text-base font-semibold">{t("modules.tasks.settingsNav.projectNotFound", { defaultValue: "Loyiha topilmadi" })}</div>
        <Button variant="outline" className="gap-1.5" onClick={() => navigate("/tasks")}>
          <ArrowLeft className="size-4" /> {t("modules.tasks.settingsNav.backToBoard", { defaultValue: "Doskaga qaytish" })}
        </Button>
      </div>
    );
  }

  const companyId = project.companyId ?? 0;

  const save = () => {
    update(project.id, {
      name: name.trim() || project.name,
      key: (key.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || project.key).slice(0, 16),
      description: description.trim(),
      avatar,
      color, private: priv, memberIds, access,
      ownerId: ownerId ?? project.ownerId,
      defaultAssigneeId: defAssignee, defaultReporterId: defReporter,
    });
    backToBoard();
  };
  const setMemberRole = (userId: string, roleKey: string) =>
    setAccess((a) => a.map((x) => (x.userId === userId ? { ...x, roleKey } : x)));
  const addAccess = (userId: string) =>
    setAccess((a) => (a.some((x) => x.userId === userId) ? a : [...a, { userId, roleKey: "member" }]));
  const removeAccess = (userId: string) => setAccess((a) => a.filter((x) => x.userId !== userId));

  const archive = () => { update(project.id, { archived: true }); navigate("/tasks"); };
  const del = () => { remove(project.id); navigate("/tasks"); };

  const navLabel = (key: SettingsSection, fallback: string) => t(`modules.tasks.settingsNav.${key}`, { defaultValue: fallback });

  const generalSection = (
    <div className="space-y-3">
      <ProjectAvatarField
        avatar={avatar}
        color={color}
        projectKey={key}
        name={name}
        companyId={project.companyId}
        onChange={setAvatar}
      />
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <LabeledField label={t("modules.tasks.project.name", { defaultValue: "Nomi" })}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </LabeledField>
        <LabeledField label={t("modules.tasks.project.key", { defaultValue: "Kalit (prefiks)" })}>
          <Input value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} maxLength={16} className="w-28 font-mono" />
        </LabeledField>
      </div>
      <LabeledField label={t("modules.tasks.project.description", { defaultValue: "Tavsif" })}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          placeholder={t("modules.tasks.project.descriptionPlaceholder", { defaultValue: "Loyiha haqida qisqacha…" })} />
      </LabeledField>
      <LabeledField label={t("modules.tasks.columns.color", { defaultValue: "Rang" })}>
        <div className="flex flex-wrap gap-1.5">
          {SWATCHES.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} className="size-6 rounded-full grid place-items-center" style={{ background: c }}>
              {color === c && <Check className="size-3.5 text-white" />}
            </button>
          ))}
        </div>
      </LabeledField>
    </div>
  );

  const accessSection = (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t("modules.tasks.project.private", { defaultValue: "Yopiq loyiha" })}</span>
        </div>
        <Switch checked={priv} onCheckedChange={setPriv} />
      </div>
      {priv && (
        <LabeledField label={t("modules.tasks.project.members", { defaultValue: "A'zolar" })}>
          <MemberPicker
            members={members}
            selected={memberIds}
            onToggle={(id) => setMemberIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))}
            trigger={
              <button className="flex w-full items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 min-h-[38px] flex-wrap">
                {memberIds.map((id) => {
                  const m = members.find((x) => x.id === id);
                  return <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted px-1 py-0.5 text-xs"><MemberAvatar member={m} size={16} /> {m?.name}</span>;
                })}
              </button>
            }
          />
        </LabeledField>
      )}
      <div className="grid grid-cols-2 gap-3">
        <LabeledField label={t("modules.tasks.project.owner", { defaultValue: "Egasi" })}>
          <SingleMemberSelect members={members} value={ownerId} onChange={setOwnerId} placeholder="—" />
        </LabeledField>
        <LabeledField label={t("modules.tasks.project.defaultAssignee", { defaultValue: "Standart mas'ul" })}>
          <SingleMemberSelect members={members} value={defAssignee} onChange={setDefAssignee} placeholder={t("modules.tasks.unassigned", { defaultValue: "Tayinlanmagan" })} />
        </LabeledField>
        <LabeledField label={t("modules.tasks.project.defaultReporter", { defaultValue: "Standart muallif" })}>
          <SingleMemberSelect members={members} value={defReporter} onChange={setDefReporter} placeholder="—" />
        </LabeledField>
      </div>

      {/* access — who has which role in this project */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{t("modules.tasks.access.title", { defaultValue: "Ruxsatlar (kim, qaysi rol)" })}</span>
          <button type="button" onClick={() => setRolesOpen(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
            <ShieldCheck className="size-3.5" /> {t("modules.tasks.access.manageRoles", { defaultValue: "Rollarni boshqarish" })}
          </button>
        </div>
        {access.map((a) => {
          const m = members.find((x) => x.id === a.userId);
          return (
            <div key={a.userId} className="flex items-center gap-2 rounded-lg border bg-background p-1.5">
              <MemberAvatar member={m} size={22} />
              <span className="flex-1 truncate text-sm">{m?.name ?? a.userId}</span>
              <Select value={a.roleKey} onValueChange={(v) => setMemberRole(a.userId, v)}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.key} value={r.key}>{r.isSystem ? t(`modules.tasks.systemRole.${r.key}`, { defaultValue: r.name }) : r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => removeAccess(a.userId)} className="rounded p-1 text-muted-foreground hover:text-destructive"><X className="size-3.5" /></button>
            </div>
          );
        })}
        <MemberPicker
          members={members.filter((m) => !access.some((a) => a.userId === m.id))}
          selected={[]}
          single
          onToggle={(id) => addAccess(id)}
          trigger={
            <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
              <Plus className="size-3.5" /> {t("modules.tasks.access.addMember", { defaultValue: "A'zo qo'shish" })}
            </button>
          }
        />
      </div>
    </div>
  );

  const dangerSection = (
    <div className="space-y-2 rounded-lg border border-destructive/30 p-3">
      <button onClick={archive} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline">
        <Archive className="size-4" /> {t("modules.tasks.project.archive", { defaultValue: "Loyihani arxivlash" })}
      </button>
      <div className="h-px bg-border" />
      {confirmDel ? (
        <div className="space-y-2">
          <div className="text-sm text-destructive">{t("modules.tasks.project.confirmDelete", { defaultValue: "Loyiha va uning barcha vazifalari o'chiriladi. Davom etasizmi?" })}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={del}>{t("modules.tasks.actions.delete", { defaultValue: "O'chirish" })}</Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmDel(false)}>{t("modules.tasks.actions.cancel", { defaultValue: "Bekor qilish" })}</Button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline">
          <Trash2 className="size-4" /> {t("modules.tasks.project.delete", { defaultValue: "Loyihani o'chirish" })}
        </button>
      )}
    </div>
  );

  return (
    <div className="-m-6 flex h-[calc(100dvh-66px)] overflow-hidden max-md:h-[calc(100dvh-56px)]">
      <RolesDialog companyId={companyId} open={rolesOpen} onClose={() => setRolesOpen(false)} />

      {/* Left: secondary settings nav (desktop only). */}
      <nav className="hidden w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-muted/30 p-2 md:flex">
        {visibleNav.map(({ key: k, label, Icon, danger }) => (
          <button
            key={k}
            type="button"
            onClick={() => setSection(k)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
              danger && "text-destructive",
              section === k ? "bg-foreground/[0.06] font-medium" : "hover:bg-foreground/[0.03]",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{navLabel(k, label)}</span>
          </button>
        ))}
      </nav>

      <main className="flex min-w-0 flex-1 flex-col">
        {/* header */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <button type="button" onClick={backToBoard} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("modules.tasks.settingsNav.backToBoard", { defaultValue: "Doskaga qaytish" })}>
            <ArrowLeft className="size-4" />
          </button>
          <ProjectAvatar project={project} size={24} />
          <span className="truncate text-sm font-semibold">{project.name}</span>
          <div className="ml-auto">
            <Button size="sm" onClick={save}>{t("modules.tasks.actions.save", { defaultValue: "Saqlash" })}</Button>
          </div>
        </div>

        {/* mobile section chips */}
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b p-2 md:hidden">
          {visibleNav.map(({ key: k, label, Icon, danger }) => (
            <button
              key={k}
              type="button"
              onClick={() => setSection(k)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
                danger && "text-destructive",
                section === k ? "bg-foreground/[0.06] font-medium" : "bg-muted/50 hover:bg-muted",
              )}
            >
              <Icon className="size-3.5" />
              <span>{navLabel(k, label)}</span>
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="max-w-2xl space-y-4 p-4 md:p-6">
            {section === "general" && generalSection}
            {section === "access" && accessSection}
            {section === "columns" && <ColumnManager projectId={project.id} />}
            {section === "automation" && <AutomationSection companyId={companyId} projectId={project.id} />}
            {section === "autotasks" && canAutotask && <AutotasksSection companyId={companyId} projectId={project.id} />}
            {section === "telegram" && <TelegramSection companyId={companyId} projectId={project.id} />}
            {section === "danger" && dangerSection}
          </div>
        </div>
      </main>
    </div>
  );
}

// ── column management (live edits: add / rename / recolor / category / WIP / reorder / delete) ──
const CATEGORY_ORDER: ColumnCategory[] = ["todo", "inprogress", "done"];

function ColumnManager({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const columns = useTasksStore((s) => s.columns);
  const roles = useTasksStore((s) => s.roles);
  const addColumn = useTasksStore((s) => s.addColumn);
  const updateColumn = useTasksStore((s) => s.updateColumn);
  const deleteColumn = useTasksStore((s) => s.deleteColumn);
  const reorderColumns = useTasksStore((s) => s.reorderColumns);

  const cols = useMemo(
    () => columns.filter((c) => c.projectId === projectId).sort((a, b) => a.order - b.order),
    [columns, projectId],
  );

  const move = (id: string, dir: -1 | 1) => {
    const ids = cols.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderColumns(projectId, ids);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {t("modules.tasks.project.columns", { defaultValue: "Ustunlar" })}
        </span>
        <button
          type="button"
          onClick={() => addColumn(projectId, t("modules.tasks.columns.newName", { defaultValue: "Yangi ustun" }))}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <Plus className="size-3.5" /> {t("modules.tasks.columns.add", { defaultValue: "Ustun qo'shish" })}
        </button>
      </div>
      <div className="space-y-1.5">
        {cols.map((col, i) => (
          <div key={col.id} className="flex items-center gap-1.5 rounded-lg border bg-background p-1.5">
            <div className="flex flex-col">
              <button type="button" disabled={i === 0} onClick={() => move(col.id, -1)} className="text-muted-foreground disabled:opacity-30 hover:text-foreground"><ChevronUp className="size-3.5" /></button>
              <button type="button" disabled={i === cols.length - 1} onClick={() => move(col.id, 1)} className="text-muted-foreground disabled:opacity-30 hover:text-foreground"><ChevronDown className="size-3.5" /></button>
            </div>
            <ColorDot color={col.color} onPick={(c) => updateColumn(col.id, { color: c })} />
            <Input value={col.name} onChange={(e) => updateColumn(col.id, { name: e.target.value })} className="h-8 flex-1 text-sm" />
            <Select value={col.category} onValueChange={(v) => updateColumn(col.id, { category: v as ColumnCategory })}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_ORDER.map((c) => (
                  <SelectItem key={c} value={c}>{t(`modules.tasks.category.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              value={col.wipLimit ?? ""}
              onChange={(e) => updateColumn(col.id, { wipLimit: e.target.value ? Number(e.target.value) : null })}
              placeholder={t("modules.tasks.columns.wipShort", { defaultValue: "WIP" })}
              title={t("modules.tasks.columns.wip", { defaultValue: "WIP limit" })}
              className="h-8 w-16 text-xs"
            />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title={t("modules.tasks.columns.moveRoles", { defaultValue: "Ustunga o'tkaza oladigan rollar" })}
                  className={cn("rounded p-1.5 hover:bg-muted", (col.moveRoles?.length ?? 0) > 0 ? "text-primary" : "text-muted-foreground")}
                >
                  <Lock className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <div className="px-1 pb-1 text-xs text-muted-foreground">
                  {t("modules.tasks.columns.moveRolesHint", { defaultValue: "Kim bu ustunga taskni o'tkaza oladi (bo'sh = hamma)" })}
                </div>
                {roles.map((r) => {
                  const on = (col.moveRoles ?? []).includes(r.key);
                  return (
                    <label key={r.key} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-primary"
                        checked={on}
                        onChange={() => {
                          const cur = col.moveRoles ?? [];
                          updateColumn(col.id, { moveRoles: on ? cur.filter((x) => x !== r.key) : [...cur, r.key] });
                        }}
                      />
                      {r.isSystem ? t(`modules.tasks.systemRole.${r.key}`, { defaultValue: r.name }) : r.name}
                    </label>
                  );
                })}
              </PopoverContent>
            </Popover>
            <button
              type="button"
              disabled={cols.length <= 1}
              onClick={() => deleteColumn(col.id)}
              title={t("modules.tasks.columns.delete", { defaultValue: "Ustunni o'chirish" })}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColorDot({ color, onPick }: { color: string; onPick: (c: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="size-5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: color }} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="flex flex-wrap gap-1.5" style={{ width: 132 }}>
          {SWATCHES.map((c) => (
            <button key={c} type="button" onClick={() => onPick(c)} className="size-5 rounded-full grid place-items-center" style={{ background: c }}>
              {color === c && <Check className="size-3 text-white" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── create task dialog (full form) ────────────────────────────────────────────
export function CreateTaskDialog({
  project,
  open,
  onClose,
  defaultColumnId,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
  defaultColumnId?: string;
}) {
  const { t } = useTranslation();
  const dlgCompanyId = useCompany((st) => st.current)?.id ?? null;
  const columnsAll = useTasksStore((s) => s.columns);
  const columns = useMemo(
    () => columnsAll.filter((c) => c.projectId === project.id).sort((a, b) => a.order - b.order),
    [columnsAll, project.id],
  );
  const members = useTasksStore((s) => s.members);
  const me = useTasksStore((s) => s.currentUserId);
  const create = useTasksStore((s) => s.createCard);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [columnId, setColumnId] = useState(defaultColumnId ?? columns[0]?.id ?? "");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [cover, setCover] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(""); setDesc(""); setPriority("medium");
      setColumnId(defaultColumnId ?? columns[0]?.id ?? "");
      // Seed the assignee: the last one chosen for this project (per my
      // account) if recorded, otherwise the project's default assignee
      // (= the creator), otherwise nobody.
      const remembered = readLastAssignee(project.id, me);
      setAssignee(remembered !== undefined ? remembered : project.defaultAssigneeId ?? null);
      setDue("");
      setAttachments([]); setCover(null);
    }
  }, [open, defaultColumnId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!title.trim() || !columnId) return;
    // Remember this pick (incl. "unassigned") for the next new task here.
    writeLastAssignee(project.id, me, assignee);
    create({
      projectId: project.id, columnId, title: title.trim(), description: desc.trim(),
      priority, assigneeIds: assignee ? [assignee] : [], dueDate: due || null,
      attachments, cover,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t("modules.tasks.newTask", { defaultValue: "Yangi vazifa" })}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <LabeledField label={t("modules.tasks.fields.title", { defaultValue: "Sarlavha" })}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder={t("modules.tasks.placeholders.title", { defaultValue: "Vazifa nomi" })} />
          </LabeledField>
          <LabeledField label={t("modules.tasks.fields.description", { defaultValue: "Tavsif" })}>
            <RichDescription
              docKey={open ? "new" : "closed"}
              initialHtml=""
              onCommit={setDesc}
              onAddAttachment={(a) => {
                setAttachments((prev) => {
                  if (!cover && a.mime.startsWith("image/") && !prev.some((x) => x.mime.startsWith("image/"))) setCover(a.id);
                  return [...prev, a];
                });
              }}
              placeholder={t("modules.tasks.detail.descriptionPlaceholder", { defaultValue: "Vazifa tavsifi…" })}
              uploadTo={dlgCompanyId ? { companyId: dlgCompanyId, folder: ["Tasks", project.name] } : null}
            />
          </LabeledField>
          <AttachmentsSection
            attachments={attachments}
            cover={cover}
            onAttachmentsChange={setAttachments}
            onCoverChange={setCover}
            uploadTo={dlgCompanyId ? { companyId: dlgCompanyId, folder: ["Tasks", project.name] } : null}
          />
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label={t("modules.tasks.fields.status", { defaultValue: "Ustun" })}>
              <Select value={columnId} onValueChange={setColumnId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </LabeledField>
            <LabeledField label={t("modules.tasks.fields.priority", { defaultValue: "Muhimlik" })}>
              <PriorityMenu value={priority} onChange={setPriority}>
                <button className="flex h-9 w-full items-center rounded-lg border px-2.5"><PriorityBadge priority={priority} /></button>
              </PriorityMenu>
            </LabeledField>
            <LabeledField label={t("modules.tasks.fields.assignee", { defaultValue: "Mas'ul" })}>
              <MemberPicker
                members={members}
                selected={assignee ? [assignee] : []}
                single
                onToggle={(id) => setAssignee((v) => (v === id ? null : id))}
                trigger={
                  <button className="flex h-9 w-full items-center gap-1.5 rounded-lg border px-2.5 overflow-hidden">
                    {assignee ? (
                      <><MemberAvatar member={resolveMember(members, assignee)} size={20} /><span className="truncate text-sm">{resolveMember(members, assignee)?.name}</span></>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("modules.tasks.unassigned", { defaultValue: "Tayinlanmagan" })}</span>
                    )}
                  </button>
                }
              />
            </LabeledField>
            <LabeledField label={t("modules.tasks.fields.due", { defaultValue: "Muddat" })}>
              <DatePicker value={due} onChange={setDue} className="h-9 w-full" />
            </LabeledField>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t("modules.tasks.actions.cancel", { defaultValue: "Bekor qilish" })}</Button>
          <Button onClick={submit} disabled={!title.trim() || !columnId}>{t("modules.tasks.actions.create", { defaultValue: "Yaratish" })}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── card config menu ("Card setup") ───────────────────────────────────────────
const CONFIG_FIELDS: { key: keyof CardConfig; labelKey: string; label: string; Icon: typeof Rows3 }[] = [
  { key: "key", labelKey: "modules.tasks.cardConfig.key", label: "Kalit (ID)", Icon: Hash },
  { key: "priority", labelKey: "modules.tasks.cardConfig.priority", label: "Muhimlik", Icon: Flag },
  { key: "assignees", labelKey: "modules.tasks.cardConfig.assignees", label: "Mas'ullar", Icon: Users },
  { key: "labels", labelKey: "modules.tasks.cardConfig.labels", label: "Yorliqlar", Icon: Tag },
  { key: "dueDate", labelKey: "modules.tasks.cardConfig.dueDate", label: "Muddat", Icon: Calendar },
  { key: "subtaskCount", labelKey: "modules.tasks.cardConfig.subtaskCount", label: "Kichik vazifalar soni", Icon: ListChecks },
  { key: "commentCount", labelKey: "modules.tasks.cardConfig.commentCount", label: "Izohlar soni", Icon: MessageSquare },
  { key: "daysInColumn", labelKey: "modules.tasks.cardConfig.daysInColumn", label: "Ustunda necha kun", Icon: Clock },
  { key: "description", labelKey: "modules.tasks.cardConfig.description", label: "Tavsif", Icon: AlignLeft },
  { key: "cover", labelKey: "modules.tasks.cardConfig.cover", label: "Muqova (rasm)", Icon: ImageIcon },
  { key: "subtasks", labelKey: "modules.tasks.cardConfig.subtasks", label: "Kichik vazifalar (ro'yxat)", Icon: ListTree },
];

export function SwimlaneMenu({ value, onChange }: { value: Swimlane; onChange: (s: Swimlane) => void }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Rows3 className="size-4" />
          <span className="hidden sm:inline">{t("modules.tasks.swimlane.title", { defaultValue: "Swimlane" })}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t("modules.tasks.swimlane.groupBy", { defaultValue: "Guruhlash" })}</DropdownMenuLabel>
        {SWIMLANES.map((s) => (
          <DropdownMenuItem key={s} onClick={() => onChange(s)} className="gap-2">
            <span className="flex-1">{t(`modules.tasks.swimlane.${s}`, { defaultValue: s })}</span>
            {value === s && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Control-Center-style grouping card + section title (mirrors the topbar's
// ControlCenterDark look) so the "Вид" popover reads like the OS control center.
function VcCard({ children }: { children: ReactNode }) {
  return <div className="rounded-xl bg-foreground/[0.04] p-1.5">{children}</div>;
}
function VcTitle({ children }: { children: ReactNode }) {
  return <div className="px-1 pb-1.5 pt-0.5 text-[11px] font-semibold text-muted-foreground">{children}</div>;
}

export function CardConfigMenu() {
  const { t } = useTranslation();
  const config = useTasksStore((s) => s.cardConfig);
  const setConfig = useTasksStore((s) => s.setCardConfig);
  const density = useDensity();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">{t("modules.tasks.cardConfig.title", { defaultValue: "Karta ko'rinishi" })}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 p-2">
        {/* Interface density — Control-Center "Тема"-style circular icon toggles. */}
        <VcCard>
          <VcTitle>{t("modules.tasks.view.interface", { defaultValue: "Interfeys" })}</VcTitle>
          <div className="grid grid-cols-2 gap-1">
            {([
              { d: "full" as const, Icon: Maximize2, labelKey: "modules.tasks.view.full", label: "To'liq" },
              { d: "compact" as const, Icon: Minimize2, labelKey: "modules.tasks.view.compact", label: "Ixcham" },
            ]).map(({ d, Icon, labelKey, label }) => {
              const on = density === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-1.5 transition-colors hover:bg-foreground/5"
                >
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full transition-colors [&_svg]:size-[18px]",
                      on ? "bg-primary text-primary-foreground shadow-sm" : "bg-foreground/10 text-foreground",
                    )}
                  >
                    <Icon />
                  </span>
                  <span className={cn("text-[11px]", on ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {t(labelKey, { defaultValue: label })}
                  </span>
                </button>
              );
            })}
          </div>
        </VcCard>

        {/* What shows on a card — each row with a leading icon, like the CC rows. */}
        <VcCard>
          <VcTitle>{t("modules.tasks.cardConfig.hint", { defaultValue: "Kartada nimalar ko'rinsin" })}</VcTitle>
          {CONFIG_FIELDS.map((f) => (
            <label
              key={f.key}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-foreground/5"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <f.Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{t(f.labelKey, { defaultValue: f.label })}</span>
              </span>
              <Switch checked={!!config[f.key]} onCheckedChange={(v) => setConfig({ [f.key]: v })} />
            </label>
          ))}
        </VcCard>

        {/* Hide done cards after N days. */}
        <VcCard>
          <VcTitle>{t("modules.tasks.cardConfig.hideDone", { defaultValue: "Bajarilganlarni yashirish" })}</VcTitle>
          <div className="flex flex-wrap gap-1">
            {[null, 3, 7, 14, 30].map((d) => {
              const on = config.hideDoneAfterDays === d;
              return (
                <button
                  key={String(d)}
                  type="button"
                  onClick={() => setConfig({ hideDoneAfterDays: d })}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                    on
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/10",
                  )}
                >
                  {d === null
                    ? t("modules.tasks.cardConfig.hideDoneOff", { defaultValue: "O'chiq" })
                    : t("modules.tasks.cardConfig.days", { defaultValue: "{{n}} kun", n: d })}
                </button>
              );
            })}
          </div>
        </VcCard>

        <button
          type="button"
          onClick={() => setConfig(DEFAULT_CARD_CONFIG)}
          className="w-full rounded-lg px-2 py-1.5 text-center text-xs text-muted-foreground transition-colors hover:bg-foreground/5"
        >
          {t("modules.tasks.cardConfig.reset", { defaultValue: "Standartga qaytarish" })}
        </button>
      </PopoverContent>
    </Popover>
  );
}

// ── assignee quick filter ─────────────────────────────────────────────────────
/** Sentinel in the assignee filter selection meaning "cards with no assignee". */
export const UNASSIGNED_FILTER = "__unassigned__";

export function AssigneeFilter({
  members,
  memberIds,
  selected,
  onToggle,
  onClear,
}: {
  members: { id: string; name: string; avatar?: string | null; color?: string | null }[];
  memberIds: string[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const list = useMemo(
    () => memberIds.map((id) => members.find((m) => m.id === id)).filter(Boolean) as typeof members,
    [memberIds, members],
  );
  if (list.length === 0) return null;
  const unOn = selected.includes(UNASSIGNED_FILTER);
  // Overlapping avatar stack. A 2px background ring separates neighbours; a
  // selected chip swaps that for a primary ring and lifts to the FRONT so its
  // ring is never clipped by the next avatar's white ring.
  const chip = (on: boolean, i: number) =>
    cn(
      "relative grid place-items-center rounded-full ring-2 transition-transform",
      i > 0 && "-ml-2",
      on
        ? "z-20 -translate-y-0.5 ring-primary"
        : "z-0 ring-background hover:z-10 hover:-translate-y-0.5",
    );
  return (
    <div className="flex items-center">
      {list.slice(0, 8).map((m, i) => {
        const on = selected.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            title={m.name}
            onClick={() => onToggle(m.id)}
            style={{ zIndex: on ? 20 : list.length - i }}
            className={cn(chip(on, i), !on && "opacity-90 hover:opacity-100")}
          >
            <MemberAvatar member={m} size={24} />
          </button>
        );
      })}
      {/* Unassigned — the trailing grey person, filters cards with no assignee. */}
      <button
        type="button"
        title={t("modules.tasks.unassigned", { defaultValue: "Tayinlanmagan" })}
        onClick={() => onToggle(UNASSIGNED_FILTER)}
        className={cn(
          chip(unOn, list.length),
          "size-6 bg-muted",
          unOn ? "text-foreground" : "text-muted-foreground opacity-90 hover:opacity-100",
        )}
      >
        <User className="size-3.5" />
      </button>
      {selected.length > 0 && (
        <button onClick={onClear} className="ml-2 text-xs text-muted-foreground hover:text-foreground">
          {t("modules.tasks.filter.clear", { defaultValue: "Tozalash" })}
        </button>
      )}
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/** Single-member select used for a project's default assignee / reporter. */
function SingleMemberSelect({
  members,
  value,
  onChange,
  placeholder,
}: {
  members: { id: string; name: string; avatar?: string | null; color?: string | null }[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
}) {
  const m = members.find((x) => x.id === value);
  return (
    <MemberPicker
      members={members}
      selected={value ? [value] : []}
      single
      onToggle={(id) => onChange(value === id ? null : id)}
      trigger={
        <button type="button" className="flex h-9 w-full items-center gap-1.5 rounded-lg border px-2.5 overflow-hidden">
          {m ? (
            <><MemberAvatar member={m} size={20} /><span className="truncate text-sm">{m.name}</span></>
          ) : (
            <span className="text-sm text-muted-foreground">{placeholder}</span>
          )}
        </button>
      }
    />
  );
}
