import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ModulePage } from "@/modules/module-page";
import { FinDashboard } from "@/modules/dashboard/fin/fin-dashboard";
import { SoliqRouter } from "@/modules/soliq";
import { LauncherPage } from "@/modules/home/launcher";

// Detail pages — lazy so they're loaded only when the user navigates.
const DocumentDetailPage = lazy(() =>
  import("@/modules/documents/detail-page").then((m) => ({ default: m.DocumentDetailPage })),
);
const DocumentCreatePage = lazy(() =>
  import("@/modules/documents/create-page").then((m) => ({ default: m.DocumentCreatePage })),
);

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="p-6 text-muted-foreground">Yuklanmoqda…</div>}>{children}</Suspense>;
}

/**
 * The authenticated module route tree, rendered once per open tab inside its
 * own MemoryRouter (see TabsHost). Public routes (/login, /s/:token) live in
 * the outer BrowserRouter — not here.
 *
 * Пилот AIBA × Kapitalbank (ТЗ P26015) — остаются только маршруты пилота:
 * дашборд (финансовая аналитика), ЭСФ (documents), банк (остатки на р/с),
 * налоги/отчётность (soliq, включая кассу /soliq/cheques).
 */
export function TabRoutes() {
  return (
    <Routes>
      {/* Лаунчер — блоки разделов вместо сайдбара/хидера */}
      <Route path="/" element={<LauncherPage />} />

      {/* Налоги + касса + отчёт по налогу с оборота */}
      <Route path="/soliq/*" element={<SoliqRouter />} />

      {/* ЭСФ: формирование / просмотр */}
      <Route path="/documents/create" element={<Lazy><DocumentCreatePage /></Lazy>} />
      <Route path="/documents/:id" element={<Lazy><DocumentDetailPage /></Lazy>} />

      {/* Финансовая аналитика */}
      <Route path="/dashboard" element={<FinDashboard />} />

      {/* Страница банка отключена в пилоте — на неё нельзя перейти */}
      <Route path="/bank" element={<Navigate to="/" replace />} />

      {/* Списки модулей пилота (/documents) */}
      <Route path="/:slug" element={<ModulePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
