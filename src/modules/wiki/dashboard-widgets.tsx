// Dashboard widget contributed by the Wiki module: a pinned (settings.pageId)
// or most-recently-edited knowledge-base page rendered as a compact memo.
// Consumed by the dashboard registry.
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCompany } from "@/shared/store/company";
import {
  WidgetCard,
  EmptyRow,
  ListSkeleton,
  type WidgetDef,
  type WidgetProps,
} from "@/modules/dashboard/widget-kit";
import { getWiki } from "./wiki-api";

function WikiMemoWidget({ settings }: WidgetProps) {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? null;
  const pinnedId = settings?.pageId as string | undefined;
  const q = useQuery({
    queryKey: ["wiki", "dashboard", companyId],
    queryFn: () => getWiki(companyId as number),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const pages = q.data?.pages ?? [];
  const page =
    (pinnedId ? pages.find((p) => p.id === pinnedId) : undefined) ??
    [...pages].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0];
  const blocks = (q.data?.blocks ?? [])
    .filter((b) => page && b.pageId === page.id && b.type !== "divider" && b.type !== "image" && b.text.trim())
    .sort((a, b) => a.order - b.order)
    .slice(0, 6);

  return (
    <WidgetCard
      title={t("modules.dashboard.widget.wiki_memo", { defaultValue: "Wiki eslatma" })}
      icon={<BookOpen className="size-4" />}
      footer={
        <Link to="/wiki" className="hover:underline">
          {t("modules.dashboard.footer.goToWiki", { defaultValue: "Bilimlar bazasi" })}
        </Link>
      }
    >
      {!companyId ? (
        <EmptyRow text={t("modules.dashboard.pickCompany", { defaultValue: "Kompaniyani tanlang" })} />
      ) : q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : !page ? (
        <EmptyRow text={t("modules.dashboard.empty.noWiki", { defaultValue: "Sahifa yo'q" })} />
      ) : (
        <div className="animate-in fade-in-0 duration-300">
          <div className="mb-2 flex items-center gap-1.5 font-medium text-foreground">
            <span>{page.icon || "📄"}</span>
            <span className="truncate">{page.title || t("modules.dashboard.empty.noWiki", { defaultValue: "Sahifa" })}</span>
          </div>
          {blocks.length ? (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {blocks.map((b) => (
                <li key={b.id} className={`truncate ${b.type.startsWith("h") ? "font-medium text-foreground" : ""}`}>
                  {b.text}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyRow text={t("modules.dashboard.empty.emptyPage", { defaultValue: "Sahifa bo'sh" })} />
          )}
        </div>
      )}
    </WidgetCard>
  );
}

export const WIDGETS: WidgetDef[] = [
  {
    type: "wiki_memo",
    module: "wiki",
    titleKey: "modules.dashboard.widget.wiki_memo",
    title: "Wiki eslatma",
    icon: BookOpen,
    defaultColspan: 1,
    Component: WikiMemoWidget,
  },
];
