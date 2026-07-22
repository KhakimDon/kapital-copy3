import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/shared/lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // Kapitalbank B2B: подчёркнутые табы на общей hairline-линии.
      "flex w-full items-center gap-6 border-b border-[#EDEEF0] text-muted-foreground",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // Kapitalbank B2B: underline-таб — активный чёрный текст с фиолетовым
      // подчёркиванием, неактивный серый (как «Сотрудники / Заявки» в макете).
      "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent pb-3 pt-1 text-[15px] font-medium text-[#83888B] ring-offset-background transition-all hover:text-[#101010] focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-[#101010]",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    // Без focus-ring: Radix фокусирует контент при открытии в диалоге,
    // и фиолетовая обводка вокруг всего блока выглядела как баг.
    tabIndex={-1}
    className={cn("mt-4 focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
