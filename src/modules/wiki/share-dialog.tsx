import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Lock, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/shared/lib/utils";
import { useWikiStore } from "./local/store";
import type { AccessRole, Space } from "./local/model";

const COLORS = ["#f97316", "#0ea5e9", "#10b981", "#a855f7", "#ec4899", "#eab308", "#3b82f6", "#14b8a6"];
function Avatar({ name }: { name: string }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  const initials = name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium text-white" style={{ background: COLORS[Math.abs(h) % COLORS.length] }}>
      {initials}
    </span>
  );
}

export function ShareDialog({ space, open, onClose }: { space: Space | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const members = useWikiStore((s) => s.members);
  const setAccess = useWikiStore((s) => s.setSpaceAccess);
  const setEveryone = useWikiStore((s) => s.setSpaceEveryone);
  const [q, setQ] = useState("");

  const list = useMemo(
    () => members.filter((m) => m.id !== space?.ownerId && m.name.toLowerCase().includes(q.trim().toLowerCase())),
    [members, space?.ownerId, q],
  );
  if (!space) return null;
  const owner = members.find((m) => m.id === space.ownerId);

  const roleOf = (id: string): AccessRole | "none" => space.access[id] ?? "none";
  const everyoneVal: string = space.everyone ?? "none";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{space.icon}</span> {t("modules.wiki.shareTitle", { defaultValue: "Kirish huquqi" })} · {space.name}
          </DialogTitle>
        </DialogHeader>

        {/* everyone in the firm */}
        <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
          <span className="grid size-7 place-items-center rounded-full bg-muted">
            {space.everyone ? <Globe className="size-4" /> : <Lock className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t("modules.wiki.everyone", { defaultValue: "Korxonadagi hamma" })}</div>
            <div className="text-xs text-muted-foreground">{space.everyone ? t("modules.wiki.everyoneOn", { defaultValue: "Barcha xodimlar ko'ra oladi" }) : t("modules.wiki.everyoneOff", { defaultValue: "Faqat tanlangan a'zolar" })}</div>
          </div>
          <RoleSelect value={everyoneVal} onChange={(v) => setEveryone(space.id, v === "none" ? null : (v as AccessRole))} />
        </div>

        {/* per-member */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("modules.wiki.searchMember", { defaultValue: "Xodim qidirish…" })} className="h-9 pl-8" />
        </div>

        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {owner && (
            <div className="flex items-center gap-2.5 rounded-md px-1 py-1.5">
              <Avatar name={owner.name} />
              <div className="min-w-0 flex-1"><div className="truncate text-sm">{owner.name}</div></div>
              <span className="text-xs text-muted-foreground">{t("modules.wiki.owner", { defaultValue: "Egasi" })}</span>
            </div>
          )}
          {list.map((m) => (
            <div key={m.id} className={cn("flex items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-muted/50")}>
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1"><div className="truncate text-sm">{m.name}</div></div>
              <RoleSelect value={roleOf(m.id)} onChange={(v) => setAccess(space.id, m.id, v === "none" ? null : (v as AccessRole))} />
            </div>
          ))}
          {list.length === 0 && <div className="py-4 text-center text-xs text-muted-foreground">{t("modules.wiki.noMembers", { defaultValue: "Xodim yo'q" })}</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[136px] shrink-0 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("modules.wiki.roleNone", { defaultValue: "Yopiq" })}</SelectItem>
        <SelectItem value="view">{t("modules.wiki.roleView", { defaultValue: "Ko'rish" })}</SelectItem>
        <SelectItem value="edit">{t("modules.wiki.roleEdit", { defaultValue: "Tahrirlash" })}</SelectItem>
      </SelectContent>
    </Select>
  );
}
