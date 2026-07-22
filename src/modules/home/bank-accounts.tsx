import { Landmark, Wallet } from "lucide-react";

/**
 * Блок «Счета» — остатки по расчётным счетам из банка (Kapitalbank B2B API).
 * Не зависит от 1С, поэтому показывается в изданиях без полной 1С-аналитики
 * (gated/off) вместо блока «Финансовая аналитика», чтобы главная не пустовала.
 */

const ACCOUNTS = [
  { name: "Расчётный счёт", number: "2020 8000 9001 2345", currency: "UZS", balance: "148 900 000", icon: "bank" as const },
  { name: "Специальный счёт", number: "2260 0000 1234 5678", currency: "UZS", balance: "3 400 000", icon: "wallet" as const },
];

export function BankAccounts() {
  return (
    <div className="rounded-[24px] bg-white p-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold leading-tight text-[#101010]">Счета</h2>
          <div className="mt-0.5 text-[14px] text-[#83888B]">Остатки по расчётным счетам · из банка</div>
        </div>
        <div className="text-right">
          <div className="text-[13px] text-[#83888B]">Всего на счетах, UZS</div>
          <div className="text-[26px] font-bold leading-tight tabular-nums text-[#101010]">152,3 млн</div>
        </div>
      </div>

      <div className="divide-y divide-[#F0F1F3] border-t border-[#F0F1F3]">
        {ACCOUNTS.map((a) => (
          <div key={a.number} className="flex items-center justify-between gap-3 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#F8F2FF] text-[#7000FF]">
                {a.icon === "bank" ? <Landmark className="size-5" /> : <Wallet className="size-5" />}
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-medium text-[#101010]">{a.name}</div>
                <div className="truncate text-[13px] text-[#83888B]">№ {a.number} · {a.currency}</div>
              </div>
            </div>
            <div className="shrink-0 text-[16px] font-semibold tabular-nums text-[#101010]">
              {a.balance} <span className="text-[13px] font-normal text-[#9DA4A8]">{a.currency}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-[13px] text-[#9DA4A8]">Обновлено сегодня · данные Kapitalbank</div>
    </div>
  );
}
