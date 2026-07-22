/**
 * Generic module page.
 *
 *  - state=native      → render the module's React component (registered in nativeRegistry)
 *  - state=proxy       → iframe NC `/apps/{nc_app}/` (works today, replaced module-by-module)
 *  - state=placeholder → "coming soon" card
 *
 * As each module ships its native React component, register it in `nativeRegistry`
 * and flip `state` to `native` in the backend registry — no router change needed.
 */

import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { useModules, type Module } from "@/shared/modules";
import { usePerm } from "@/shared/api/authz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompaniesPage } from "@/modules/companies/page";
import { DocumentsPage } from "@/modules/documents/page";
import { EmployeesPage } from "@/modules/employees/page";
import { FilesPage } from "@/modules/files/page";
import { AttendancePage } from "@/modules/attendance/page";
import { BankPage } from "@/modules/bank/page";
import { BaholashPage } from "@/modules/baholash/page";
import { TasksPage } from "@/modules/tasks/page";
import { WarehousePage } from "@/modules/warehouse/page";
import { KontragentPage } from "@/modules/kontragent/page";
import { MarkirovkaPage } from "@/modules/markirovka/page";
import { VedPage } from "@/modules/ved/page";
import { DashboardPage } from "@/modules/dashboard/page";
import { KeysPage } from "@/modules/keys/page";
import { OnecPage } from "@/modules/onec/page";
import { AvtoprovodkaPage } from "@/modules/avtoprovodka/page";
import { AutodocPage } from "@/modules/autodoc/page";
import { AutopayPage } from "@/modules/autopay/page";
import { AichatPage } from "@/modules/aichat/page";

// As you build native modules, register the React component here.
// NOTE: modules with their own sub-routing (e.g. soliq) are handled in app/router.tsx
// directly — those entries below are placeholders so the sidebar finds them.
const nativeRegistry: Record<string, React.ComponentType> = {
  companies: CompaniesPage,
  documents: DocumentsPage,
  employees: EmployeesPage,
  files: FilesPage,
  attendance: AttendancePage,
  bank: BankPage,
  baholash: BaholashPage,
  tasks: TasksPage,
  warehouse: WarehousePage,
  kontragent: KontragentPage,
  markirovka: MarkirovkaPage,
  ved: VedPage,
  dashboard: DashboardPage,
  keys: KeysPage,
  onec: OnecPage,
  avtoprovodka: AvtoprovodkaPage,
  autodoc: AutodocPage,
  autopay: AutopayPage,
  aichat: AichatPage,
};

export function ModulePage() {
  const { slug = "" } = useParams();
  const { t } = useTranslation();
  const { data: modules } = useModules();
  const { canModule, privileged, ready: permReady } = usePerm();
  const mod = modules?.find((m) => m.slug === slug);

  if (!mod) return <p className="text-muted-foreground">{t("common.empty")}</p>;

  // RBAC route guard: a native module the user can't view is blocked outright
  // (nav hides it too, but a direct/restored URL must not slip through).
  if (mod.state === "native" && permReady && !privileged && !canModule(slug)) {
    return <NoAccess mod={mod} />;
  }

  if (mod.state === "native") {
    const Comp = nativeRegistry[slug];
    if (!Comp) return <NotImplemented mod={mod} />;
    return <Comp />;
  }

  if (mod.state === "placeholder") return <Placeholder mod={mod} />;

  return <ProxyFrame mod={mod} />;
}

function Placeholder({ mod }: { mod: Module }) {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>{mod.title}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground">
        Tez orada ishga tushadi.
        {mod.description && <p className="text-xs mt-2">{mod.description}</p>}
      </CardContent>
    </Card>
  );
}

function NoAccess({ mod }: { mod: Module }) {
  const { t } = useTranslation();
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4 text-muted-foreground" />
          {mod.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        {t("permissions.noModuleAccess", {
          defaultValue: "Bu modulga ruxsatingiz yo'q. Administratorga murojaat qiling.",
        })}
      </CardContent>
    </Card>
  );
}

function NotImplemented({ mod }: { mod: Module }) {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>{mod.title}</CardTitle>
      </CardHeader>
      <CardContent className="text-destructive text-sm">
        Native module is registered in backend but no React component bound yet.
        Add an entry to <code>nativeRegistry</code> in <code>module-page.tsx</code>.
      </CardContent>
    </Card>
  );
}

function ProxyFrame({ mod }: { mod: Module }) {
  // Strangler proxy: backend forwards /api/v2/{slug}/* → NC /apps/{nc_app}/*.
  // For the iframe we render NC's UI directly through the same nginx so cookies+CSRF flow.
  const src = `/apps/${ncAppFor(mod.slug)}/`;
  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-7rem)]">
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <span className="px-1.5 py-0.5 rounded bg-secondary uppercase">proxy</span>
        <span>{mod.title}</span>
        <span className="ml-auto opacity-60">{src}</span>
      </div>
      <iframe
        src={src}
        title={mod.title}
        className="flex-1 w-full border rounded-lg bg-background"
        // The NC sandbox needs same-origin so its own scripts can run.
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
      />
    </div>
  );
}

// Minimal slug → NC app id map (mirrors backend registry; safe duplication).
function ncAppFor(slug: string): string {
  const map: Record<string, string> = {
    soliq: "aiba_soliq",
    documents: "aiba_documents",
    bank: "aiba_bank",
    keys: "aiba_keys",
    onec: "aiba_onec",
    dashboard: "aiba_dashboard",
    avtoprovodka: "aiba_avtoprovodka",
    warehouse: "aiba_warehouse",
    employees: "aiba_employees",
    attendance: "aiba_attendance",
    baholash: "aiba_baholash",
    tasks: "aiba_tasks",
    autodoc: "aiba_integration",
    autopay: "aiba_integration",
    devices: "aiba_devices",
    rdp: "aiba_rdp",
    aichat: "aiba_integration",
    tweb: "aiba_tweb",
  };
  return map[slug] ?? slug;
}
