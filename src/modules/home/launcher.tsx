import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronDown, RotateCw, LineChart } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { HAS_ONEC, ONEC_GATED } from "@/config/edition";
import { OnecGate } from "./onec-gate";
import { BankAccounts } from "./bank-accounts";

/**
 * «Аналитика бизнеса» — главный экран mini-app в ДБО Kapital Business.
 * Точная копия макета Figma «Аналитика бизнеса AIBA» (кобренд uzum business ×
 * KAPITALBANK): карточки Всего денег / Прибыль / Выручка, таблица ЭСФ,
 * Налоги, Отчёты, Ликвидность. Цифры — из макета/ТЗ P26015.
 */

/* ---------- примитивы дизайн-системы (B2B Components) ---------- */

function PillButton({
  children, dark, brand, onClick, className,
}: { children: React.ReactNode; dark?: boolean; brand?: boolean; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition",
        brand
          ? "bg-[#7000FF] text-white hover:bg-[#5E00D6]"
          : dark
            ? "bg-[#101010] text-white hover:bg-[#2a2a2a]"
            : "bg-[#F0F1F3] text-[#101010] hover:bg-[#E4E6E9]",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[24px] bg-white p-7", className)}>{children}</div>
  );
}

function Badge({ tone, children }: { tone: "red" | "orange" | "green"; children: React.ReactNode }) {
  const tones = {
    red: "bg-[#F24835] text-white",
    orange: "bg-[#F48C2C] text-white",
    green: "bg-[#09B849] text-white",
  };
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[13px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function LauncherPage() {
  const nav = useNavigate();

  return (
    <div className="w-full">
      {/* Заголовок страницы */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[32px] font-bold leading-10 text-[#101010]">Аналитика бизнеса</h1>
        <div className="flex items-center gap-4">
          <span className="text-[15px] text-[#101010]">Данные на конец дня 25.06</span>
          <PillButton dark>
            <RotateCw className="size-4" /> Обновить
          </PillButton>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* full — блок фин.аналитики (1С); иначе (gated/off) — «Счета» из банка (без 1С) */}
        {HAS_ONEC ? (
        <div className="rounded-[24px] bg-white">
          {/* Шапка блока */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-7 pb-5 pt-6">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#F8F2FF] text-[#7000FF]">
                <LineChart className="size-6" />
              </span>
              <div>
                <h2 className="text-[20px] font-bold leading-tight text-[#101010]">Финансовая аналитика</h2>
                <div className="mt-0.5 text-[14px] text-[#83888B]">Деньги, прибыль и выручка · на конец дня 25.06</div>
              </div>
            </div>
            <PillButton brand onClick={() => nav("/dashboard")}>
              Открыть дашборд <ChevronRight className="size-4" />
            </PillButton>
          </div>

          {/* Тело: 3 метрики через разделители */}
          <div className="grid grid-cols-1 divide-y divide-[#F0F1F3] border-t border-[#F0F1F3] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {/* Всего денег */}
            <div className="px-7 py-6">
              <div className="text-[15px] text-[#83888B]">Всего денег, UZS</div>
              <div className="mt-1 text-[28px] font-bold leading-9 text-[#101010]">160,8 млн</div>
              <div className="mt-5 space-y-3">
                <div className="flex w-full items-center justify-between text-[15px]">
                  <span className="text-[#101010]">На счетах</span>
                  <span className="font-medium text-[#101010]">152,3 млн</span>
                </div>
                <button type="button" onClick={() => nav("/soliq/cheques")} className="group flex w-full items-center justify-between text-[15px]">
                  <span className="text-[#101010]">В кассах</span>
                  <span className="flex items-center gap-1 font-medium text-[#101010]">
                    8,4 млн <ChevronRight className="size-4 text-[#9DA4A8] group-hover:text-[#101010]" />
                  </span>
                </button>
              </div>
            </div>

            {/* Прибыль */}
            <div className="px-7 py-6">
              <div className="flex items-center justify-between">
                <span className="text-[15px] text-[#83888B]">Прибыль за июнь, UZS</span>
                <button type="button" className="flex items-center gap-1 text-[14px] text-[#101010]">
                  30 дн <ChevronDown className="size-3.5 text-[#9DA4A8]" />
                </button>
              </div>
              <div className="mt-1 text-[28px] font-bold leading-9 text-[#09B849]">+124,4 млн</div>
              <div className="mt-5 space-y-3 text-[15px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#101010]">Доходы</span>
                  <span className="font-medium text-[#101010]">480,0 млн</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#101010]">Расходы</span>
                  <span className="font-medium text-[#101010]">355,6 млн</span>
                </div>
              </div>
            </div>

            {/* Выручка */}
            <div className="px-7 py-6">
              <div className="text-[15px] text-[#83888B]">Выручка, UZS</div>
              <div className="mt-1 text-[28px] font-bold leading-9 text-[#101010]">412,7 млн</div>
              <div className="mt-4 flex h-2.5 overflow-hidden rounded-full">
                <div className="w-[72%] bg-[#CDE87F]" />
                <div className="w-[28%] bg-[#22E2E2]" />
              </div>
              <div className="mt-3 flex items-center justify-between text-[14px]">
                <span className="flex items-center gap-1.5 text-[#101010]">
                  <span className="size-2 rounded-full bg-[#CDE87F]" /> Товары
                </span>
                <span className="flex items-center gap-1.5 text-[#101010]">
                  <span className="size-2 rounded-full bg-[#22E2E2]" /> Услуги
                </span>
              </div>
              <div className="mt-2 text-[14px] font-medium text-[#F48C2C]">Возвраты: 7,3 млн (6 шт)</div>
            </div>
          </div>
        </div>
        ) : (
          <BankAccounts />
        )}

        {/* ЭСФ / Налоги / Отчёты — кликабельные блоки-разделы */}
        <div className="grid grid-cols-3 gap-5">
          <SectionBlock
            title="Электронные счета-фактуры"
            subtitle={HAS_ONEC ? "Взаиморасчёты с контрагентами" : "Счёт-фактуры и акты"}
            onClick={() => nav("/documents")}
          >
            {HAS_ONEC ? (
              <div className="space-y-2.5 text-[15px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#83888B]">Нам должны</span>
                  <span className="font-semibold text-[#101010]">86,2 млн</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#83888B]">Мы должны</span>
                  <span className="font-semibold text-[#101010]">61,3 млн</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#F24835]">Просрочено</span>
                  <span className="font-semibold text-[#F24835]">32,2 млн</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 text-[15px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#83888B]">Входящие</span>
                  <span className="font-semibold text-[#101010]">14</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#83888B]">Исходящие</span>
                  <span className="font-semibold text-[#101010]">9</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#F48C2C]">Ожидают подписи</span>
                  <span className="font-semibold text-[#F48C2C]">3</span>
                </div>
              </div>
            )}
          </SectionBlock>

          <SectionBlock
            title="Налоги"
            subtitle="К уплате за июль 2026"
            badge={<Badge tone="red">Есть пени</Badge>}
            onClick={() => nav("/soliq")}
          >
            <div className="space-y-2.5 text-[15px]">
              <div className="flex items-center justify-between">
                <span className="text-[#83888B]">НДС</span>
                <span className="font-semibold text-[#101010]">23,5 млн</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#F24835]">Пени по НДС</span>
                <span className="font-semibold text-[#F24835]">150 210,01</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#83888B]">Всего к оплате</span>
                <span className="font-bold text-[#101010]">37,6 млн</span>
              </div>
            </div>
          </SectionBlock>

          <SectionBlock
            title="Отчёты"
            subtitle="Налог с оборота за 2026"
            onClick={() => nav("/soliq")}
          >
            <div className="space-y-2.5 text-[15px]">
              <div className="flex items-center justify-between">
                <span className="text-[#101010]">Июль</span>
                <span className="text-[14px] text-[#83888B]">срок до 15.08</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#101010]">Июнь</span>
                <Badge tone="orange">На проверке</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#101010]">Май</span>
                <Badge tone="green">Принят</Badge>
              </div>
            </div>
          </SectionBlock>
        </div>

        {/* Ликвидность (1С) — только при подключённом 1С */}
        {HAS_ONEC && (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-[22px] font-bold text-[#101010]">Ликвидность</h2>
            <div className="text-[14px] text-[#83888B]">
              7 дн <span className="mx-1 text-[#9DA4A8]">•</span>
              <span className="font-bold text-[#101010]">14 дн</span>
              <span className="mx-1 text-[#9DA4A8]">•</span> 30 дн
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <LiquidityRow label="Деньги сейчас, UZS" value="160,8 млн" bar={{ w: 100, x: 0, color: "#D6C6FF" }} />
            <LiquidityRow label="Кредиторка к 09.07, UZS" value="-61,3 млн" negative bar={{ w: 38, x: 62, color: "#FAD6D9" }} />
            <LiquidityRow label="Налоги, UZS" value="-37,6 млн" negative bar={{ w: 23, x: 77, color: "#FAD6D9" }} />
            <LiquidityRow label="Дебиторка без просрочки, UZS" value="+54,0 млн" positive bar={{ w: 34, x: 0, color: "#CDE87F" }} />
          </div>

          <div className="mt-5 flex items-center gap-3 border-t border-[#F0F1F3] pt-4">
            <span className="text-[15px] font-semibold text-[#101010]">Позиция на 09.07, UZS</span>
            <span className="text-[15px] font-bold text-[#09B849]">+115,9 млн</span>
            <span className="text-[14px] text-[#83888B]">пессимистично +61,9 млн</span>
          </div>
          <div className="mt-3 text-[14px] text-[#9DA4A8]">Прогноз по данным учёта из 1С</div>
        </Card>
        )}

        {/* Гейт «Аналитика 1С» (gated) — внизу страницы */}
        {ONEC_GATED && <OnecGate />}
      </div>
    </div>
  );
}

/** Кликабельный блок-раздел: заголовок + сводка, весь блок — переход. */
function SectionBlock({
  title, subtitle, badge, onClick, children,
}: {
  title: string; subtitle?: string; badge?: React.ReactNode;
  onClick: () => void; children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className="group flex h-full cursor-pointer flex-col rounded-[24px] bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(68,83,113,0.10)]"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold leading-tight text-[#101010]">{title}</h2>
          {subtitle && <div className="mt-0.5 text-[14px] text-[#83888B]">{subtitle}</div>}
        </div>
        {badge && <span className="flex items-center gap-2">{badge}</span>}
      </div>
      <div className="w-full">{children}</div>
      <div className="mt-auto pt-4">
        <PillButton brand onClick={onClick}>
          Перейти <ChevronRight className="size-4" />
        </PillButton>
      </div>
    </div>
  );
}

function LiquidityRow({
  label, value, bar, negative, positive,
}: {
  label: string; value: string;
  bar: { w: number; x: number; color: string };
  negative?: boolean; positive?: boolean;
}) {
  return (
    <div className="grid grid-cols-[280px_120px_1fr] items-center gap-4">
      <span className="text-[15px] text-[#101010]">{label}</span>
      <span
        className={cn(
          "text-right text-[15px] font-semibold tabular-nums",
          negative ? "text-[#F24835]" : positive ? "text-[#09B849]" : "text-[#101010]",
        )}
      >
        {value}
      </span>
      <div className="relative h-5">
        <div
          className="absolute top-0 h-5 rounded-lg"
          style={{ width: `${bar.w}%`, left: `${bar.x}%`, backgroundColor: bar.color }}
        />
      </div>
    </div>
  );
}
