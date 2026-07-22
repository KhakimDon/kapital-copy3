// Dashboard widget registry — the ONE manifest that lists which modules
// contribute widgets. Each module owns its widget code and exports `WIDGETS`;
// here we merely aggregate them into a `type -> WidgetDef` map. Adding a widget
// to the dashboard = add one import line below (plus the module's WIDGETS entry).
//
// Everything else (layout, gating, crash isolation) is driven off this map, so
// the core dashboard never hard-codes a widget list.
import type { WidgetDef } from "./widget-kit";

import { WIDGETS as financeWidgets } from "./finance-widgets";
import { WIDGETS as coreWidgets } from "./core-widgets";
import { WIDGETS as taskWidgets } from "@/modules/tasks/dashboard-widgets";
import { WIDGETS as calendarWidgets } from "@/modules/calendar/dashboard-widgets";
import { WIDGETS as messengerWidgets } from "@/modules/messenger/dashboard-widgets";
import { WIDGETS as wikiWidgets } from "@/modules/wiki/dashboard-widgets";
import { WIDGETS as employeeWidgets } from "@/modules/employees/dashboard-widgets";
import { WIDGETS as companyWidgets } from "@/modules/companies/dashboard-widgets";

export const WIDGET_LIST: WidgetDef[] = [
  ...financeWidgets,
  ...coreWidgets,
  ...taskWidgets,
  ...calendarWidgets,
  ...messengerWidgets,
  ...wikiWidgets,
  ...employeeWidgets,
  ...companyWidgets,
];

/** type -> WidgetDef. Unknown types (removed/renamed modules) resolve to undefined. */
export const REGISTRY: Record<string, WidgetDef> = Object.fromEntries(
  WIDGET_LIST.map((w) => [w.type, w]),
);

export function getWidgetDef(type: string): WidgetDef | undefined {
  return REGISTRY[type];
}

/** A widget is usable when its owning module isn't disabled for the tenant. */
export function isModuleEnabled(def: WidgetDef, disabled: Set<string>): boolean {
  return def.module === "dashboard" || !disabled.has(def.module);
}
