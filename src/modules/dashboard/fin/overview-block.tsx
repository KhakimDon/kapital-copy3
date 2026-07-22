// Компактная карточка-вход в финансовый дашборд на главной (лаунчере).
// Без дублирования KPI/баланса — вся аналитика внутри /dashboard.
import { useNavigate } from "react-router-dom";
import { ChevronRight, LineChart } from "lucide-react";

export function FinancialOverview() {
  const nav = useNavigate();
  const go = () => nav("/dashboard");
  return (
    <div
      onClick={go}
      className="group flex cursor-pointer flex-wrap items-center gap-4 rounded-[24px] bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(68,83,113,0.10)]"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#F8F2FF] text-primary">
        <LineChart className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[20px] font-bold leading-tight text-[#101010]">Финансовая аналитика</h2>
        <div className="mt-0.5 text-[14px] text-[#83888B]">
          Выручка, прибыль, расходы и денежные потоки в графиках за 2021–2025
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); go(); }}
        className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-[#7000FF] px-4 text-[14px] font-semibold text-white transition hover:bg-[#5E00D6]"
      >
        Открыть дашборд <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
