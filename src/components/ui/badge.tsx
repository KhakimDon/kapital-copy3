import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

// Kapitalbank B2B: статус-бейджи — цветные пилюли с белым текстом
// (зелёный «Принят», оранжевый «На проверке», красный «Есть пени»).
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-[#F0F1F3] text-[#101010]",
        destructive: "border-transparent bg-[#F24835] text-white",
        outline: "border-[#E4E6E9] text-foreground",
        success: "border-transparent bg-[#09B849] text-white",
        warning: "border-transparent bg-[#F48C2C] text-white",
        danger: "border-transparent bg-[#F24835] text-white",
        info: "border-transparent bg-[var(--kb-accent-soft)] text-primary",
        muted: "border-transparent bg-[#F0F1F3] text-[#83888B]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
