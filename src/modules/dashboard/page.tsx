// Fully dynamic, role-aware widget dashboard. The saved LAYOUT drives the whole
// page: which widgets, their order and colspan. Users see their role's layout
// read-only; admins get an in-place editor. The editor is a proper design tool:
// a clear edit-mode chrome (role targeting + unsaved-state), pointer-driven
// drag-reorder with a lifted ghost + live neighbour shift, keyboard move
// up/down, per-card resize/remove (with undo), and a searchable, module-grouped
// "Add widget" drawer that shows the REAL widgets as a faithful preview. Every
// widget stays crash-isolated (WidgetErrorBoundary) and gated on the tenant's
// enabled modules, so a disabled module or a broken widget never blanks the page.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Settings2,
  Plus,
  X,
  GripVertical,
  Check,
  Columns2,
  Square,
  ArrowUp,
  ArrowDown,
  Search,
  LayoutGrid,
  Undo2,
  AlertTriangle,
  PencilRuler,
  Eye,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/utils";
import { useMe } from "@/shared/api/me";
import { DashHeader } from "./header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WidgetErrorBoundary, WidgetSkeleton } from "./widget-kit";
import { getWidgetDef, isModuleEnabled } from "./registry";
import {
  useDashCatalog,
  useDashLayout,
  useDashLayouts,
  useSaveDashLayout,
  type LayoutWidget,
} from "./dashboard-api";

const uid = () =>
  (crypto as { randomUUID?: () => string }).randomUUID?.() ??
  `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const colspanClass = (colspan: number) => (colspan >= 2 ? "md:col-span-2" : "");

const prettyModule = (m: string) => (m ? m.charAt(0).toUpperCase() + m.slice(1) : m);

/** Immutable array-move (remove `from`, re-insert at `to`) — sortable semantics. */
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length || from === to) return arr;
  const next = arr.slice();
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

// ── one rendered widget (read mode + faithful editor preview) ─────────────────

function RenderWidget({ w }: { w: LayoutWidget }) {
  const { t } = useTranslation();
  const def = getWidgetDef(w.type);
  if (!def) return null; // unknown type — skip (kept in saved data)
  const Component = def.Component;
  return (
    <WidgetErrorBoundary
      label={t("modules.dashboard.widgetFailed", { defaultValue: "Vidjet yuklanmadi" })}
      title={t(def.titleKey, { defaultValue: def.title })}
    >
      <Suspense fallback={<WidgetSkeleton />}>
        <Component settings={w.settings} />
      </Suspense>
    </WidgetErrorBoundary>
  );
}

// ── a compact icon control used across the per-card toolbar ────────────────────

function IconControl({
  label,
  onClick,
  disabled,
  danger,
  children,
  className,
  ...rest
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors",
            "hover:bg-foreground/[0.06] hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-30",
            danger && "hover:bg-destructive/15 hover:text-destructive",
            className,
          )}
          {...rest}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// ── one editable widget (edit mode) ──────────────────────────────────────────

function EditableWidget({
  w,
  index,
  count,
  disabledModule,
  dragging,
  registerRef,
  onHandlePointerDown,
  onMove,
  onToggleColspan,
  onRemove,
}: {
  w: LayoutWidget;
  index: number;
  count: number;
  disabledModule: boolean;
  dragging: boolean;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  onHandlePointerDown: (e: React.PointerEvent, w: LayoutWidget) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onToggleColspan: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const def = getWidgetDef(w.type);
  const title = def ? t(def.titleKey, { defaultValue: def.title }) : w.type;
  const wide = w.colspan >= 2;

  return (
    <div
      ref={(el) => registerRef(w.id, el)}
      className={cn(
        "group/edit relative flex h-full flex-col overflow-hidden rounded-3xl border bg-card/90 transition-all",
        "border-border/70 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.25)]",
        dragging
          ? "opacity-40 ring-2 ring-dashed ring-primary/60"
          : "hover:border-primary/50 hover:shadow-[0_16px_50px_-20px_rgba(0,0,0,0.3)]",
      )}
    >
      {/* Toolbar — always visible so the controls are never hidden. */}
      <div className="flex items-center gap-1 border-b border-border/60 bg-foreground/[0.02] px-1.5 py-1.5">
        <button
          type="button"
          aria-label={t("modules.dashboard.edit.drag", { defaultValue: "Sudrash" })}
          onPointerDown={(e) => onHandlePointerDown(e, w)}
          style={{ touchAction: "none" }}
          className="grid size-7 shrink-0 cursor-grab place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {title}
          {count > 1 && (
            <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">×{count}</span>
          )}
        </span>
        <IconControl
          label={t("modules.dashboard.edit.moveUp", { defaultValue: "Yuqoriga" })}
          onClick={() => onMove(w.id, -1)}
          disabled={index === 0}
        >
          <ArrowUp className="size-3.5" />
        </IconControl>
        <IconControl
          label={t("modules.dashboard.edit.moveDown", { defaultValue: "Pastga" })}
          onClick={() => onMove(w.id, 1)}
          disabled={index === count - 1}
        >
          <ArrowDown className="size-3.5" />
        </IconControl>
        <IconControl
          label={
            wide
              ? t("modules.dashboard.edit.narrow", { defaultValue: "Toraytirish" })
              : t("modules.dashboard.edit.widen", { defaultValue: "Kengaytirish" })
          }
          onClick={() => onToggleColspan(w.id)}
          className={cn(wide && "text-primary")}
        >
          {wide ? <Square className="size-3.5" /> : <Columns2 className="size-3.5" />}
        </IconControl>
        <IconControl
          label={t("modules.dashboard.edit.remove", { defaultValue: "O'chirish" })}
          onClick={() => onRemove(w.id)}
          danger
        >
          <X className="size-3.5" />
        </IconControl>
      </div>

      {/* Faithful, non-interactive live preview. */}
      <div className="pointer-events-none flex-1 select-none p-1.5">
        {disabledModule ? (
          <div className="grid h-full min-h-[7rem] place-items-center rounded-2xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
            {t("modules.dashboard.edit.moduleOff", { defaultValue: "Modul o'chirilgan" })}
          </div>
        ) : def ? (
          <RenderWidget w={w} />
        ) : (
          <div className="grid h-full min-h-[7rem] place-items-center rounded-2xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
            {t("modules.dashboard.edit.unknown", { defaultValue: "Noma'lum vidjet" })}: {w.type}
          </div>
        )}
      </div>
    </div>
  );
}

// ── the floating "lifted" ghost that follows the pointer while dragging ────────

function DragGhost({
  ghost,
}: {
  ghost: { x: number; y: number; w: number; offX: number; offY: number; title: string; type: string };
}) {
  const def = getWidgetDef(ghost.type);
  const Icon = def?.icon;
  return (
    <div
      className="pointer-events-none fixed z-[70] rounded-2xl border border-primary/40 bg-card/95 px-3 py-2.5 shadow-[0_28px_60px_-18px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      style={{
        left: ghost.x - ghost.offX,
        top: ghost.y - ghost.offY,
        width: ghost.w,
        transform: "rotate(-2deg) scale(1.02)",
      }}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="size-4 text-primary/70" />
        {Icon ? <Icon className="size-4 text-primary" /> : null}
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {ghost.title}
        </span>
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { t } = useTranslation();
  const me = useMe();

  const layoutQ = useDashLayout();
  const disabled = useMemo(
    () => new Set(me.data?.disabled_modules ?? []),
    [me.data?.disabled_modules],
  );
  const isAdmin = !!me.data?.is_admin;
  const editable = !!layoutQ.data?.editable && isAdmin;

  // Admin-only READ-mode preview: view the dashboard as another role sees it
  // (its widget layout). null = the admin's own view.
  const [previewRole, setPreviewRole] = useState<string | null>(null);

  // ── edit state ──
  const [editing, setEditing] = useState(false);
  const [editRole, setEditRole] = useState<string>("");
  const [draft, setDraft] = useState<LayoutWidget[]>([]);
  const [draftRole, setDraftRole] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [toast, setToast] = useState<{ msg: string; action?: { label: string; fn: () => void } } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [confirm, setConfirm] = useState<
    { title: string; desc: string; confirmLabel: string; onConfirm: () => void } | null
  >(null);

  const catalogQ = useDashCatalog();
  // All per-role layouts — needed by the admin editor AND the read-mode role
  // preview.
  const layoutsQ = useDashLayouts(editing || (isAdmin && previewRole !== null));
  const save = useSaveDashLayout();

  // Default the role to the caller's own when entering edit mode.
  useEffect(() => {
    if (editing && !editRole)
      setEditRole(layoutQ.data?.role ?? catalogQ.data?.roles?.[0]?.key ?? "");
  }, [editing, editRole, layoutQ.data?.role, catalogQ.data?.roles]);

  // (Re)load the draft (+ baseline) from the server copy when the role changes.
  useEffect(() => {
    if (!editing || !editRole) return;
    if (draftRole === editRole) return;
    const rows = layoutsQ.data?.items.find((r) => r.role === editRole)?.widgets;
    if (rows) {
      const copy = rows.map((r) => ({ ...r, settings: { ...(r.settings ?? {}) } }));
      setDraft(copy);
      setDraftRole(editRole);
      setBaseline(JSON.stringify(copy));
    }
  }, [editing, editRole, draftRole, layoutsQ.data]);

  const loaded = editing && draftRole === editRole;
  const isDirty =
    loaded && baseline !== null && JSON.stringify(draft) !== baseline && !save.isPending;

  const showToast = (msg: string, action?: { label: string; fn: () => void }) => {
    window.clearTimeout(toastTimer.current);
    setToast({ msg, action });
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 6000 : 2500);
  };

  // ── edit ops ──
  const move = useCallback((id: string, dir: -1 | 1) => {
    setDraft((d) => {
      const i = d.findIndex((w) => w.id === id);
      if (i < 0) return d;
      return arrayMove(d, i, i + dir);
    });
  }, []);
  const toggleColspan = (id: string) =>
    setDraft((d) => d.map((w) => (w.id === id ? { ...w, colspan: w.colspan >= 2 ? 1 : 2 } : w)));
  const removeWidget = (id: string) => {
    let stash: { widget: LayoutWidget; index: number } | null = null;
    setDraft((d) => {
      const idx = d.findIndex((w) => w.id === id);
      if (idx < 0) return d;
      stash = { widget: d[idx], index: idx };
      return d.filter((w) => w.id !== id);
    });
    if (stash) {
      const { widget, index } = stash;
      showToast(t("modules.dashboard.edit.removed", { defaultValue: "Vidjet o'chirildi" }), {
        label: t("modules.dashboard.edit.undo", { defaultValue: "Qaytarish" }),
        fn: () =>
          setDraft((d) => {
            const next = d.slice();
            next.splice(Math.min(index, next.length), 0, widget);
            return next;
          }),
      });
    }
  };
  const addWidget = (type: string) => {
    const def = getWidgetDef(type);
    const fromCatalog = catalogQ.data?.widgets.find((c) => c.type === type);
    setDraft((d) => [
      ...d,
      { id: uid(), type, colspan: def?.defaultColspan ?? fromCatalog?.defaultColspan ?? 1, settings: {} },
    ]);
  };

  // ── pointer drag-reorder ──
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const orderRef = useRef<string[]>([]);
  orderRef.current = draft.map((w) => w.id);
  const dragIdRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<
    { x: number; y: number; w: number; offX: number; offY: number; title: string; type: string } | null
  >(null);

  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
    const draggingId = dragIdRef.current;
    if (!draggingId) return;
    const ids = orderRef.current;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < ids.length; i++) {
      const el = cardRefs.current.get(ids[i]);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = (e.clientX - cx) ** 2 + (e.clientY - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0 || ids[best] === draggingId) return;
    setDraft((d) => arrayMove(d, d.findIndex((w) => w.id === draggingId), best));
  }, []);

  const endDrag = useCallback(() => {
    dragIdRef.current = null;
    setDragId(null);
    setGhost(null);
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [onPointerMove]);

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent, w: LayoutWidget) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const el = cardRefs.current.get(w.id);
      const r = el?.getBoundingClientRect();
      const def = getWidgetDef(w.type);
      dragIdRef.current = w.id;
      setDragId(w.id);
      setGhost({
        x: e.clientX,
        y: e.clientY,
        w: r?.width ?? 280,
        offX: r ? e.clientX - r.left : 20,
        offY: r ? e.clientY - r.top : 16,
        title: def ? t(def.titleKey, { defaultValue: def.title }) : w.type,
        type: w.type,
      });
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    },
    [onPointerMove, endDrag, t],
  );

  useEffect(() => () => endDrag(), [endDrag]);

  // ── save / cancel / role switch (with dirty guards) ──
  const doSave = () => {
    const snapshot = draft;
    save.mutate(
      { role: editRole, widgets: snapshot },
      {
        onSuccess: () => {
          setBaseline(JSON.stringify(snapshot));
          showToast(t("modules.dashboard.edit.saved", { defaultValue: "Saqlandi" }));
        },
      },
    );
  };
  const exitEdit = () => {
    setEditing(false);
    setDraft([]);
    setDraftRole(null);
    setEditRole("");
    setBaseline(null);
    setAddOpen(false);
  };
  const requestCancel = () => {
    if (isDirty)
      setConfirm({
        title: t("modules.dashboard.edit.discardTitle", { defaultValue: "O'zgarishlar bekor qilinsinmi?" }),
        desc: t("modules.dashboard.edit.discardDesc", {
          defaultValue: "Saqlanmagan o'zgarishlar yo'qoladi.",
        }),
        confirmLabel: t("modules.dashboard.edit.discard", { defaultValue: "Bekor qilish" }),
        onConfirm: exitEdit,
      });
    else exitEdit();
  };
  const requestRole = (v: string) => {
    if (v === editRole) return;
    const go = () => {
      setEditRole(v);
      setDraftRole(null);
    };
    if (isDirty)
      setConfirm({
        title: t("modules.dashboard.edit.switchTitle", { defaultValue: "Boshqa rolga o'tilsinmi?" }),
        desc: t("modules.dashboard.edit.switchDesc", {
          defaultValue: "Ushbu roldagi saqlanmagan o'zgarishlar yo'qoladi.",
        }),
        confirmLabel: t("modules.dashboard.edit.switchConfirm", { defaultValue: "O'tish" }),
        onConfirm: go,
      });
    else go();
  };

  // ── read-mode widget list (known type + enabled module) ──
  // When an admin is previewing another role, render THAT role's layout (from
  // the per-role layouts) instead of the caller's own.
  const visible = useMemo(() => {
    const rows =
      (previewRole
        ? layoutsQ.data?.items.find((r) => r.role === previewRole)?.widgets
        : layoutQ.data?.widgets) ?? [];
    return rows.filter((w) => {
      const def = getWidgetDef(w.type);
      return def && isModuleEnabled(def, disabled);
    });
  }, [previewRole, layoutsQ.data?.items, layoutQ.data?.widgets, disabled]);

  // ── catalog for the "Add widget" drawer (grouped by module, disabled greyed) ──
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const w of draft) m[w.type] = (m[w.type] ?? 0) + 1;
    return m;
  }, [draft]);

  const catalogGroups = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    const items = (catalogQ.data?.widgets ?? [])
      .map((c) => ({ c, def: getWidgetDef(c.type) }))
      .filter((x): x is { c: (typeof x)["c"]; def: NonNullable<(typeof x)["def"]> } => !!x.def)
      .filter(({ c }) => !c.adminOnly || isAdmin)
      .filter(
        ({ def }) =>
          !q ||
          t(def.titleKey, { defaultValue: def.title }).toLowerCase().includes(q) ||
          def.module.toLowerCase().includes(q),
      );
    const map = new Map<string, typeof items>();
    for (const it of items) {
      const arr = map.get(it.def.module) ?? [];
      arr.push(it);
      map.set(it.def.module, arr);
    }
    return [...map.entries()].map(([module, list]) => ({ module, list }));
  }, [catalogQ.data?.widgets, isAdmin, addSearch, t]);

  const editLoading = editing && (layoutsQ.isLoading || !loaded);

  // Clean light Kapitalbank surface — the mini-app lives inside a light DBO, so
  // the dashboard paints its own #F3F4F6 wash instead of the old frosted glass.
  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative min-h-full pb-28">
        {/* Clean light wash that bleeds past the shell's p-8 padding so the
            dark desktop wallpaper (shell goes transparent for the dashboard)
            never shows through — the mini-app must read as a light surface. */}
        <div aria-hidden className="pointer-events-none absolute -inset-8 -z-10 bg-[#F3F4F6]" />
        <div className="relative space-y-5">
          {/* Role-preview banner (admin, read mode) — sits above the header:
              solid dark, borderless, rounded-xl. */}
          {previewRole && !editing && (
            <div className="flex items-center gap-3 rounded-xl bg-neutral-900 px-4 py-2.5 text-white dark:bg-neutral-800">
              <Eye className="size-4 shrink-0 text-white/70" />
              <span className="min-w-0 flex-1 text-sm">
                {t("modules.dashboard.preview.banner", {
                  defaultValue: "«{{role}}» roli ko'zi bilan ko'ryapsiz — shu rol ko'radigan vidjetlar.",
                  role: catalogQ.data?.roles.find((r) => r.key === previewRole)?.name ?? previewRole,
                })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-white/80 hover:bg-white/10 hover:text-white"
                onClick={() => setPreviewRole(null)}
              >
                {t("modules.dashboard.preview.exit", { defaultValue: "Chiqish" })}
              </Button>
            </div>
          )}

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DashHeader />
            </div>
            {isAdmin && !editing && (
              <div className="flex shrink-0 items-center gap-2">
                {/* View the dashboard as another role sees it (admin only). */}
                <Select
                  value={previewRole ?? "__me"}
                  onValueChange={(v) => setPreviewRole(v === "__me" ? null : v)}
                >
                  <SelectTrigger className="h-9 w-auto gap-1.5 rounded-full border-[#EDEEF0] bg-white text-[#101010] shadow-[0_2px_10px_rgba(68,83,113,0.06)]">
                    <Eye className="size-4 text-[#83888B]" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__me">
                      {t("modules.dashboard.preview.myView", { defaultValue: "Mening ko'rinishim" })}
                    </SelectItem>
                    {(catalogQ.data?.roles ?? []).map((r) => (
                      <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editable && (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (previewRole) setEditRole(previewRole);
                      setEditing(true);
                    }}
                    className="rounded-full border-0 bg-[#7000FF] text-white shadow-none hover:bg-[#5E00D6]"
                  >
                    <Settings2 className="size-4" />
                    {t("modules.dashboard.edit.customize", { defaultValue: "Sozlash" })}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Editing chrome — role targeting + add + unsaved state. */}
          {editing && (
            <div className="sticky top-2 z-30 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-[#eef4fb] p-3 dark:bg-[#1a2740]">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                <PencilRuler className="size-[18px]" />
              </span>
              <div className="mr-1 min-w-0">
                <div className="text-sm font-semibold leading-tight text-foreground">
                  {t("modules.dashboard.edit.mode", { defaultValue: "Tahrirlash rejimi" })}
                </div>
                <div className="text-[11px] leading-tight text-muted-foreground">
                  {isDirty
                    ? t("modules.dashboard.edit.unsaved", { defaultValue: "Saqlanmagan o'zgarishlar" })
                    : t("modules.dashboard.edit.upToDate", { defaultValue: "Barcha o'zgarishlar saqlangan" })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("modules.dashboard.edit.role", { defaultValue: "Rol" })}
                </span>
                <Select value={editRole} onValueChange={requestRole}>
                  <SelectTrigger className="h-9 w-48 bg-background">
                    <SelectValue
                      placeholder={t("modules.dashboard.edit.pickRole", { defaultValue: "Rolni tanlang" })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(catalogQ.data?.roles ?? []).map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" />
                {t("modules.dashboard.edit.addWidget", { defaultValue: "Vidjet qo'shish" })}
              </Button>

              {loaded && (
                <Badge variant="muted" className="ml-auto rounded-full px-2.5 py-1">
                  {t("modules.dashboard.edit.count", { defaultValue: "{{n}} ta vidjet" }).replace(
                    "{{n}}",
                    String(draft.length),
                  )}
                </Badge>
              )}
            </div>
          )}

          {/* Grid */}
          {layoutQ.isLoading || editLoading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <WidgetSkeleton key={i} />
              ))}
            </div>
          ) : editing ? (
            draft.length ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {draft.map((w, i) => {
                  const def = getWidgetDef(w.type);
                  const disabledModule = !!def && !isModuleEnabled(def, disabled);
                  return (
                    <div key={w.id} className={colspanClass(w.colspan)}>
                      <EditableWidget
                        w={w}
                        index={i}
                        count={draft.length}
                        disabledModule={disabledModule}
                        dragging={dragId === w.id}
                        registerRef={registerRef}
                        onHandlePointerDown={onHandlePointerDown}
                        onMove={move}
                        onToggleColspan={toggleColspan}
                        onRemove={removeWidget}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              // Friendly empty state
              <div className="grid place-items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-16 text-center backdrop-blur-xl">
                <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <LayoutGrid className="size-7" />
                </span>
                <h3 className="text-base font-semibold text-foreground">
                  {t("modules.dashboard.edit.emptyTitle", { defaultValue: "Bu rol uchun vidjet yo'q" })}
                </h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {t("modules.dashboard.edit.emptyDesc", {
                    defaultValue: "Boshqaruv panelini birinchi vidjetni qo'shishdan boshlang.",
                  })}
                </p>
                <Button className="mt-5" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" />
                  {t("modules.dashboard.edit.addFirst", { defaultValue: "Birinchi vidjetni qo'shish" })}
                </Button>
              </div>
            )
          ) : !visible.length ? (
            <div className="rounded-2xl border border-[#EDEEF0] bg-white p-8 text-center text-[#83888B] shadow-[0_2px_10px_rgba(68,83,113,0.06)]">
              {t("modules.dashboard.empty.noWidgets", { defaultValue: "Vidjetlar sozlanmagan" })}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((w) => (
                <div key={w.id} className={colspanClass(w.colspan)}>
                  <RenderWidget w={w} />
                </div>
              ))}
            </div>
          )}

          {/* Sticky save bar */}
          {editing && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur-xl">
              <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      isDirty ? "bg-warning" : "bg-success",
                    )}
                  />
                  {isDirty
                    ? t("modules.dashboard.edit.unsaved", { defaultValue: "Saqlanmagan o'zgarishlar" })
                    : t("modules.dashboard.edit.upToDate", { defaultValue: "Barcha o'zgarishlar saqlangan" })}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="ghost" onClick={requestCancel} disabled={save.isPending}>
                    {t("modules.dashboard.edit.close", { defaultValue: "Yopish" })}
                  </Button>
                  <Button onClick={doSave} disabled={!isDirty || save.isPending}>
                    <Check className="size-4" />
                    {save.isPending
                      ? t("modules.dashboard.edit.saving", { defaultValue: "Saqlanmoqda..." })
                      : t("modules.dashboard.edit.save", { defaultValue: "Saqlash" })}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Add-widget drawer */}
          <Sheet open={addOpen} onOpenChange={setAddOpen}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md" hideClose>
              <div className="flex items-center gap-3 border-b border-border p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <LayoutGrid className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold">
                    {t("modules.dashboard.edit.catalog", { defaultValue: "Vidjetlar katalogi" })}
                  </h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("modules.dashboard.edit.catalogHint", {
                      defaultValue: "Panelga qo'shish uchun vidjetni bosing",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  aria-label={t("modules.dashboard.edit.close", { defaultValue: "Yopish" })}
                  className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="border-b border-border p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder={t("modules.dashboard.edit.search", { defaultValue: "Vidjet qidirish..." })}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-4">
                {catalogGroups.map(({ module, list }) => (
                  <div key={module}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {prettyModule(module)}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    <div className="space-y-2">
                      {list.map(({ c, def }) => {
                        const Icon = def.icon;
                        const off = !isModuleEnabled(def, disabled);
                        const added = typeCounts[c.type] ?? 0;
                        return (
                          <button
                            key={c.type}
                            type="button"
                            disabled={off}
                            onClick={() => !off && addWidget(c.type)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
                              off
                                ? "cursor-not-allowed border-border/60 opacity-60"
                                : "border-border hover:border-primary/50 hover:bg-accent",
                            )}
                          >
                            <span
                              className={cn(
                                "grid size-10 shrink-0 place-items-center rounded-xl",
                                off ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                              )}
                            >
                              <Icon className="size-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {t(def.titleKey, { defaultValue: def.title })}
                              </span>
                              {off ? (
                                <span className="text-[11px] text-muted-foreground">
                                  {t("modules.dashboard.edit.moduleOff", { defaultValue: "Modul o'chirilgan" })}
                                </span>
                              ) : added > 0 ? (
                                <span className="text-[11px] text-muted-foreground">
                                  {t("modules.dashboard.edit.alreadyAdded", {
                                    defaultValue: "Panelda: {{n}}",
                                  }).replace("{{n}}", String(added))}
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">
                                  {c.defaultColspan >= 2
                                    ? t("modules.dashboard.edit.wide", { defaultValue: "Keng vidjet" })
                                    : t("modules.dashboard.edit.standard", { defaultValue: "Oddiy vidjet" })}
                                </span>
                              )}
                            </span>
                            {off ? (
                              <Badge variant="muted" className="shrink-0 rounded-full">
                                {t("modules.dashboard.edit.disabled", { defaultValue: "O'chirilgan" })}
                              </Badge>
                            ) : (
                              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground/[0.04] text-muted-foreground">
                                <Plus className="size-4" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {!catalogGroups.length && (
                  <div className="grid place-items-center py-16 text-center text-sm text-muted-foreground">
                    <Search className="mb-3 size-6 opacity-40" />
                    {t("modules.dashboard.edit.noCatalog", { defaultValue: "Mavjud vidjet yo'q" })}
                  </div>
                )}
              </div>

              <div className="border-t border-border p-3">
                <Button className="w-full" variant="secondary" onClick={() => setAddOpen(false)}>
                  {t("modules.dashboard.edit.done", { defaultValue: "Tayyor" })}
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Discard / role-switch confirm */}
          <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-warning" />
                  {confirm?.title}
                </DialogTitle>
                <DialogDescription>{confirm?.desc}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirm(null)}>
                  {t("modules.dashboard.edit.keepEditing", { defaultValue: "Davom etish" })}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    confirm?.onConfirm();
                    setConfirm(null);
                  }}
                >
                  {confirm?.confirmLabel}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Toast (with optional undo action) */}
          {toast && (
            <div className="fixed bottom-20 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
              {toast.msg}
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.fn();
                    setToast(null);
                  }}
                  className="flex items-center gap-1 rounded-full bg-background/15 px-2 py-0.5 text-xs font-semibold hover:bg-background/25"
                >
                  <Undo2 className="size-3.5" />
                  {toast.action.label}
                </button>
              )}
            </div>
          )}

          {/* Lifted drag ghost */}
          {ghost && <DragGhost ghost={ghost} />}
        </div>
      </div>
    </TooltipProvider>
  );
}
