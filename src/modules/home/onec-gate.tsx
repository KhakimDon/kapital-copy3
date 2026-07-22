import { Plug, Check, Download } from "lucide-react";

/**
 * Карточка-приглашение подключить AIBA Connector, когда 1С не подключён.
 * Дизайн — по макету Figma (лавандовый градиент, превью «закрытых» блоков справа).
 * Показывается вместо блока «Финансовая аналитика» в издании `gated` (Копия 2).
 */

const FEATURES = [
  "Анализ ликвидности и денежных потоков",
  "Дебиторская и кредиторская задолженность",
  "Прогнозирование финансовых показателей",
];

export function OnecGate() {
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-[#EAE4F5] bg-gradient-to-bl from-[#ECE4FF] via-[#F5F1FF] to-[#FCFBFF] shadow-[0_1px_3px_rgba(16,16,16,0.03)]">
      {/* Верхняя градиентная подсветка — ярче в правом углу */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#A98BFF] to-[#6E1BE6]" />

      <div className="flex flex-col gap-10 p-8 lg:flex-row lg:items-center lg:justify-between lg:p-10">
        {/* Левая часть — оффер */}
        <div className="max-w-[620px]">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-[14px] font-semibold text-[#7000FF] shadow-[0_2px_8px_rgba(112,0,255,0.08)]">
            <Plug className="size-4" /> Требуется подключение
          </span>

          <h2 className="mt-5 text-[28px] font-bold leading-tight text-[#101010]">Аналитика 1С</h2>
          <p className="mt-3 max-w-[560px] text-[16px] leading-relaxed text-[#83888B]">
            Подключите AIBA Connector для синхронизации данных из 1С и получите полную
            картину финансов вашей компании.
          </p>

          <ul className="mt-6 space-y-4">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-[16px] text-[#101010]">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#E7DEFF] text-[#7000FF]">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                {f}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex items-center gap-4">
            <a
              href="https://aiba.uz/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center gap-2.5 rounded-full bg-[#7000FF] px-6 text-[16px] font-semibold text-white shadow-[0_6px_16px_rgba(112,0,255,0.25)] transition hover:bg-[#5E00D6]"
            >
              <Download className="size-5" /> Скачать AIBA Connector
            </a>
            <span className="text-[16px] text-[#9DA4A8]">Бесплатно</span>
          </div>
        </div>

        {/* Правая часть — превью «закрытых» блоков */}
        <div className="hidden w-full shrink-0 flex-col gap-3.5 lg:flex lg:w-[42%] lg:max-w-[540px]">
          <PreviewCard label="Ликвидность">
            <div className="flex gap-2">
              <span className="h-2.5 flex-[5] rounded-full bg-[#A7E3B4]" />
              <span className="h-2.5 flex-[2] rounded-full bg-[#F3ABAB]" />
              <span className="h-2.5 flex-[2] rounded-full bg-[#F5D68A]" />
              <span className="h-2.5 flex-[2] rounded-full bg-[#A9C6F4]" />
            </div>
          </PreviewCard>
          <PreviewCard label="Денежные потоки">
            <div className="flex gap-2">
              <span className="h-2.5 flex-[2] rounded-full bg-[#A6E0E6]" />
              <span className="h-2.5 flex-[3] rounded-full bg-[#B9A6F5]" />
            </div>
          </PreviewCard>
          <PreviewCard label="Прогноз задолженности">
            <div className="h-2.5 w-full rounded-full bg-[#ECECEC]">
              <div className="h-2.5 w-[42%] rounded-full bg-[#F5D68A]" />
            </div>
          </PreviewCard>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[#EFEBF7] bg-white p-4">
      <div className="mb-3 text-[14px] text-[#B6BAC2]">{label}</div>
      {children}
    </div>
  );
}
