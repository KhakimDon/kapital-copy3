import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTH_KEYS = [
  "modules.soliq.months.jan", "modules.soliq.months.feb", "modules.soliq.months.mar",
  "modules.soliq.months.apr", "modules.soliq.months.may", "modules.soliq.months.jun",
  "modules.soliq.months.jul", "modules.soliq.months.aug", "modules.soliq.months.sep",
  "modules.soliq.months.oct", "modules.soliq.months.nov", "modules.soliq.months.dec",
];

export function PeriodNav({
  year, month, onChange,
}: {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}) {
  const { t } = useTranslation();
  const prev = () => {
    if (month === 1) onChange(year - 1, 12);
    else onChange(year, month - 1);
  };
  const next = () => {
    if (month === 12) onChange(year + 1, 1);
    else onChange(year, month + 1);
  };
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={prev}>
        <ChevronLeft className="size-4" />
      </Button>
      <div className="text-sm font-medium w-32 text-center">
        {t(MONTH_KEYS[month - 1])} {year}
      </div>
      <Button variant="outline" size="icon" onClick={next}>
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
