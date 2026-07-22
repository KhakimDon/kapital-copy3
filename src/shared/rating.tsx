import { cn } from "@/shared/lib/utils";

// Tax-rating scale — 1:1 with the cloud `aiba_integration` `.aiba-rating-*` tags
// (js/companies.js `ratingHtml` + css/companies.css). Classified by the FIRST
// letter so multi-letter grades (AAA, BB, CC, …) resolve correctly:
//   A* → green, B* → blue, C* → violet, D → red, empty/unknown → grey.
// Light colours mirror the reference hex exactly (Tailwind -100/-800 == the
// #dcfce7/#166534 … values); dark-mode variants keep the same hue.
export function ratingClass(rating?: string | null): string {
  const r = (rating ?? "").toUpperCase();
  if (r.startsWith("A")) return "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300";
  if (r.startsWith("B")) return "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300";
  if (r.startsWith("C")) return "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300";
  if (r === "D") return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
  return "bg-muted text-muted-foreground";
}

/**
 * Enterprise tax-rating indicator: a rounded pill showing the grade (and, when
 * provided, its points in parentheses like the cloud app: "A (92)"). Renders a
 * grey "—" pill when the rating is unknown.
 */
export function RatingTag({
  rating,
  points,
  className,
}: {
  rating?: string | null;
  points?: number | null;
  className?: string;
}) {
  const text = rating
    ? points != null
      ? `${rating} (${points})`
      : rating
    : "—";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-bold leading-none",
        ratingClass(rating),
        className,
      )}
    >
      {text}
    </span>
  );
}
