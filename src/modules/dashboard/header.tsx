// Dashboard header — приветствие + дата/компания + строка бизнес-показателей
// (Всего денег / Прибыль за месяц / Налоги к уплате). Слева — кнопка «Назад».
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Wallet, TrendingUp, Receipt, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useMe } from "@/shared/api/me";
import { useCompany } from "@/shared/store/company";

function localeFor(lang: string): string {
  if (lang.startsWith("ru") || lang === "uz_Cyrl") return "ru-RU";
  if (lang.startsWith("en")) return "en-US";
  return "uz-UZ";
}

function StatChip({
  icon: Icon,
  value,
  label,
  tone = "neutral",
}: {
  icon: LucideIcon;
  value: React.ReactNode;
  label: string;
  tone?: "neutral" | "green" | "red";
}) {
  return (
    <div className="flex min-w-[11rem] shrink-0 items-center gap-3 rounded-2xl border border-[#EDEEF0] bg-white px-4 py-3 shadow-[0_2px_10px_rgba(68,83,113,0.06)]">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full",
          tone === "green" && "bg-[#09B849]/10 text-[#09B849]",
          tone === "red" && "bg-[#F24835]/10 text-[#F24835]",
          tone === "neutral" && "bg-[#F8F2FF] text-[#7000FF]",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate text-2xl font-semibold leading-tight tracking-tight tabular-nums",
            tone === "red"
              ? "text-[#F24835]"
              : tone === "green"
                ? "text-[#09B849]"
                : "text-[#101010]",
          )}
        >
          {value}
        </span>
        <span className="block truncate text-xs text-[#83888B]">{label}</span>
      </span>
    </div>
  );
}

export function DashHeader() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const tr = (k: string, d: string) => t(`modules.dashboard.${k}`, { defaultValue: d });
  const me = useMe();
  const company = useCompany((s) => s.current);

  const name =
    me.data?.profile?.firstName?.trim()
      ? `${me.data.profile.firstName} ${me.data.profile.lastName ?? ""}`.trim()
      : me.data?.username ?? "";

  const todayStr = useMemo(() => {
    try {
      return new Date().toLocaleDateString(localeFor(i18n.language), {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      return new Date().toLocaleDateString();
    }
  }, [i18n.language]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => nav("/")}
            title={t("nav.back", { defaultValue: "Назад" })}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#EDEEF0] text-[#101010] transition-colors hover:bg-[#F3F4F6]"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-[#101010] md:text-4xl">
              {tr("welcome", "Xush kelibsiz")}{name ? `, ${name}` : ""}
            </h1>
            <p className="mt-1 truncate text-sm capitalize text-[#83888B]">
              {todayStr}
              {company?.name ? <span className="normal-case"> · {company.name}</span> : null}
            </p>
          </div>
        </div>
      </div>

      {/* Строка бизнес-показателей */}
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <StatChip icon={Wallet} value="160,8 млн" label="Всего денег, UZS" />
        <StatChip icon={TrendingUp} value="+124,4 млн" label="Прибыль за июнь" tone="green" />
        <StatChip icon={Receipt} value="37,6 млн" label="Налоги к уплате" tone="red" />
      </div>
    </div>
  );
}
