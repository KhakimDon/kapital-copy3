import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Clock, Eye, History } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/shared/lib/utils";
import { useWikiStore } from "./local/store";
import type { Page, PageHistory } from "./local/model";
import { avatarColor, avatarInitials, fmtDateTime, relAgo } from "./local/util";

function Avatar({ name, size = 24, ring }: { name: string; size?: number; ring?: boolean }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-medium text-white", ring && "ring-2 ring-background")}
      style={{ width: size, height: size, fontSize: size * 0.4, background: avatarColor(name) }}
      title={name}
    >
      {avatarInitials(name)}
    </span>
  );
}

export function PageMeta({ page }: { page: Page }) {
  const { t } = useTranslation();
  const views = useWikiStore((s) => s.views);
  const history = useWikiStore((s) => s.history);
  const members = useWikiStore((s) => s.members);
  const me = useWikiStore((s) => s.currentUserId);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? t("modules.wiki.someone", { defaultValue: "Kimdir" });

  const pageViews = views[page.id] ?? {};
  const viewers = useMemo(
    () => Object.entries(pageViews).map(([uid, v]) => ({ uid, at: v.at })).sort((a, b) => b.at.localeCompare(a.at)),
    [pageViews],
  );
  const viewCount = useMemo(() => Object.values(pageViews).reduce((n, v) => n + (v.count || 0), 0), [pageViews]);
  const now = Date.now();
  const present = viewers.filter((v) => now - new Date(v.at).getTime() < 2 * 60_000);
  const lastOther = viewers.find((v) => v.uid !== me) ?? viewers[0];

  const pageHistory = useMemo(
    () => history.filter((h) => h.pageId === page.id).sort((a, b) => b.at.localeCompare(a.at)),
    [history, page.id],
  );

  const kindText = (h: PageHistory) => {
    switch (h.kind) {
      case "created": return t("modules.wiki.hist.created", { defaultValue: "yaratdi" });
      case "renamed": return t("modules.wiki.hist.renamed", { defaultValue: "nomini o'zgartirdi" });
      case "moved": return t("modules.wiki.hist.moved", { defaultValue: "ko'chirdi" });
      default: return t("modules.wiki.hist.edited", { defaultValue: "tahrirladi" });
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* presence avatars (who's here now) */}
      {present.length > 0 && (
        <div className="flex items-center" title={t("modules.wiki.presence", { defaultValue: "Hozir ko'rayotganlar" })}>
          {present.slice(0, 4).map((v, i) => (
            <span key={v.uid} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 10 - i }}>
              <Avatar name={nameOf(v.uid)} size={24} ring />
            </span>
          ))}
        </div>
      )}

      {/* last viewer */}
      {lastOther && (
        <span className="hidden items-center gap-1 text-xs text-muted-foreground lg:inline-flex" title={fmtDateTime(lastOther.at)}>
          <Eye className="size-3.5" />
          {t("modules.wiki.lastSeen", { defaultValue: "{{name}} · {{ago}}", name: nameOf(lastOther.uid), ago: relAgo(lastOther.at, t) })}
        </span>
      )}

      {/* view count */}
      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex" title={t("modules.wiki.viewsTitle", { defaultValue: "Ko'rishlar" })}>
        {viewCount} {t("modules.wiki.views", { defaultValue: "ko'rish" })}
      </span>

      {/* saved + edited-ago + history */}
      <Popover>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            <Check className="size-3.5 text-success" />
            <span className="hidden sm:inline">{t("modules.wiki.saved", { defaultValue: "Saqlandi" })}</span>
            <span className="text-muted-foreground/70" title={fmtDateTime(page.updatedAt)}>· {relAgo(page.updatedAt, t)}</span>
            <History className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b px-3 py-2 text-sm font-medium">{t("modules.wiki.historyTitle", { defaultValue: "Sahifa tarixi" })}</div>
          <div className="max-h-80 overflow-y-auto py-1">
            {pageHistory.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t("modules.wiki.noHistory", { defaultValue: "Tarix yo'q" })}</div>}
            {pageHistory.map((h) => (
              <div key={h.id} className="flex items-start gap-2 px-3 py-1.5 text-sm">
                <Avatar name={nameOf(h.userId)} size={22} />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{nameOf(h.userId)}</span>{" "}
                  <span className="text-muted-foreground">{kindText(h)}</span>
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground" title={fmtDateTime(h.at)}>
                  <Clock className="mr-0.5 inline size-3" />{relAgo(h.at, t)}
                </span>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
