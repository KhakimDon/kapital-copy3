import { Plug, Check, Download } from "lucide-react";

/**
 * Карточка-приглашение подключить AIBA Connector, когда 1С не подключён.
 * Показывается вместо блока «Финансовая аналитика» в издании `gated` (Копия 2).
 */

const FEATURES = [
  "Анализ ликвидности и денежных потоков",
  "Дебиторская и кредиторская задолженность",
  "Прогнозирование финансовых показателей",
];

export function OnecGate() {
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-[#EDEEF0] bg-white">
      {/* Верхняя градиентная полоса-акцент */}
      <div className="h-1.5 w-full bg-gradient-to-r from-[#B98CFF] via-[#8A3DFF] to-[#7000FF]" />

      <div className="flex flex-col gap-8 p-8 lg:flex-row lg:items-center lg:justify-between lg:p-10">
        {/* Левая часть — оффер */}
        <div className="max-w-[560px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F1ECFF] px-3 py-1.5 text-[13px] font-semibold text-[#7000FF]">
            <Plug className="size-3.5" /> Требуется подключение
          </span>

          <h2 className="mt-4 text-[28px] font-bold leading-tight text-[#101010]">Аналитика 1С</h2>
          <p className="mt-3 text-[16px] leading-relaxed text-[#83888B]">
            Подключите AIBA Connector для синхронизации данных из 1С и получите полную
            картину финансов вашей компании.
          </p>

          <ul className="mt-5 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-[15px] text-[#101010]">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#EDE7FF] text-[#7000FF]">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                {f}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex items-center gap-3">
            <a
              href="https://aiba.uz/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#7000FF] px-5 text-[15px] font-semibold text-white transition hover:bg-[#5E00D6]"
            >
              <Download className="size-4" /> Скачать AIBA Connector
            </a>
            <span className="text-[15px] text-[#9DA4A8]">Бесплатно</span>
          </div>
        </div>

        {/* Правая часть — превью «закрытых» блоков */}
        <div className="hidden w-full max-w-[340px] shrink-0 flex-col gap-3 lg:flex">
          <PreviewCard label="Ликвидность">
            <div className="flex gap-1.5">
              <span className="h-2 flex-[3] rounded-full bg-[#A7E8C4]" />
              <span className="h-2 flex-[2] rounded-full bg-[#F4B8B8]" />
              <span className="h-2 flex-[2] rounded-full bg-[#F5D5A0]" />
              <span className="h-2 flex-1 rounded-full bg-[#A8C5F0]" />
            </div>
          </PreviewCard>
          <PreviewCard label="Денежные потоки">
            <div className="flex gap-1.5">
              <span className="h-2 flex-[2] rounded-full bg-[#A0E4E4]" />
              <span className="h-2 flex-[3] rounded-full bg-[#C4A8F0]" />
            </div>
          </PreviewCard>
          <PreviewCard label="Прогноз задолженности">
            <div className="h-2 w-full rounded-full bg-[#F0F1F3]">
              <div className="h-2 w-[45%] rounded-full bg-[#F5D5A0]" />
            </div>
          </PreviewCard>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#EDEEF0] bg-white p-4">
      <div className="mb-2.5 text-[14px] font-medium text-[#C4C8CC]">{label}</div>
      {children}
    </div>
  );
}
