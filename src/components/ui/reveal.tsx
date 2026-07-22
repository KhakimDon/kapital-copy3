import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Fade content in on mount — use to smooth a post-fetch state change so data
 * doesn't pop in abruptly. Renders a plain <div>; pass `className` for layout.
 *
 * <FadeIn className="space-y-2">{rows}</FadeIn>
 */
export function FadeIn({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("animate-in fade-in-0 duration-300", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Crossfade between a loading skeleton and resolved content. While `loading` is
 * true the skeleton renders as-is; once the fetch resolves the children fade in.
 * Replaces the common `{q.isLoading ? <Skel/> : <Content/>}` ternary so every
 * fetch-driven block gets the same smooth transition.
 *
 * <Reveal loading={q.isLoading} skeleton={<ListSkeleton rows={5} />}>
 *   {items.length ? <ul>…</ul> : <Empty/>}
 * </Reveal>
 */
export function Reveal({
  loading,
  skeleton,
  children,
  className,
}: {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  if (loading) return <>{skeleton}</>;
  return (
    <div className={cn("animate-in fade-in-0 duration-300", className)}>
      {children}
    </div>
  );
}

/**
 * Error / failed-fetch placeholder with an optional retry button. Use this as the
 * NOT-loading-but-no-data branch so a failed request shows a clear message +
 * retry instead of hanging on the loading skeleton forever — i.e. replace the
 * `if (isLoading || !data) return <Skeleton/>` anti-pattern with:
 *   if (isLoading) return <Skeleton/>;
 *   if (!data) return <ErrorState onRetry={refetch} />;
 */
export function ErrorState({
  onRetry,
  message,
  className,
}: {
  onRetry?: () => void;
  message?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-center animate-in fade-in-50 zoom-in-95 duration-300",
        className,
      )}
    >
      <div className="size-12 rounded-full bg-destructive/10 grid place-items-center">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <div className="text-sm text-muted-foreground">
        {message ?? t("common.loadError", { defaultValue: "Ma'lumotni yuklab bo'lmadi" })}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("common.retry", { defaultValue: "Qayta urinish" })}
        </Button>
      )}
    </div>
  );
}
