import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePipelineStatus } from "@/shared/api/gitlab";
import { AnimatedLogo } from "./aiba-logo";
import { MatrixLogo } from "./matrix-logo";

/**
 * The sidebar logo, deploy-aware. While any watched repo has a pipeline running
 * (usePipelineStatus, backend-proxied), the resting AIBA mark is replaced by the
 * "matrix" build-up animation and a hover tooltip explains that an update is on
 * the way and which repo is building. Info-only, visible to everyone.
 */
export function LogoSlot({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const { data } = usePipelineStatus();
  const building = data?.building ?? false;
  const buildingRepos = (data?.repos ?? []).filter((r) =>
    ["running", "pending", "preparing", "created", "waiting_for_resource", "scheduled"].includes(
      r.status,
    ),
  );

  const sizeCls = cn("transition-[width,height] duration-200", collapsed ? "size-9" : "size-16");

  if (!building) return <AnimatedLogo className={sizeCls} />;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Same footprint as the resting logo; the mark is centred at 60% so it
            matches the plain AIBA monogram's rendered size exactly. */}
        <span className={cn("relative block", sizeCls)}>
          <span className="absolute left-1/2 top-1/2 size-[78%] -translate-x-1/2 -translate-y-1/2">
            <MatrixLogo className="h-full w-full" />
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-56">
        <div className="text-xs font-medium">
          {t("deploy.updating", { defaultValue: "Yangilanish chiqmoqda…" })}
        </div>
        {buildingRepos.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {buildingRepos.map((r) => (
              <div key={r.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {r.name}
                <span className="opacity-60">· {r.status}</span>
              </div>
            ))}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
