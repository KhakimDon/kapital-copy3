import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Settings as SettingsIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { useSubConfig, usePatchSubConfig, errMessage } from "./payments-api";

// Per-subscription Settings modal.
//
// Shown when the user clicks the ⚙️ button on a Bank holati card. Two knobs:
//   reg_date          — start of the backfill window (the user moves this back
//                       to fetch older transactions on the next sweep).
//   sync_period_days  — rolling refresh window for periodic sweeps.
//
// Saving fires a PATCH; the next sweep (or per-account "Yuklash" click) picks
// up the new values automatically.
export function SubSettingsModal({
  open, onClose, companyId, subId, bankLabel,
}: {
  open: boolean;
  onClose: () => void;
  companyId: number;
  subId: string | null;
  bankLabel: string;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useSubConfig(companyId, subId);
  const patch = usePatchSubConfig(companyId, subId);

  const [regDate, setRegDate] = useState("");
  const [periodDays, setPeriodDays] = useState("30");

  // Sync local form state with the freshly loaded config — only on each open
  // so an in-flight save doesn't get overwritten by an old GET response.
  useEffect(() => {
    if (open && data?.config) {
      // Central returns reg_date as a full datetime ("2025-11-01T00:00:00");
      // the DatePicker needs a bare "YYYY-MM-DD" or it renders empty. Slice.
      setRegDate((String(data.config.reg_date || "").slice(0, 10)) || "2026-01-01");
      setPeriodDays(String(data.config.sync_period_days ?? 30));
    }
  }, [open, data]);

  const save = () => {
    if (!subId) return;
    patch.mutate(
      {
        reg_date: regDate,
        sync_period_days: Number(periodDays) || 30,
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="size-4" /> {bankLabel} — {t("modules.bank.subSettings.title", "Sozlamalar")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "modules.bank.subSettings.desc",
              "Bu sub uchun tranzaksiyalarni qaysi sanadan boshlab olib kelish va qancha vaqtga yangilab turishni belgilang.",
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 flex items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin mr-2" /> Yuklanmoqda…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("modules.bank.subSettings.regDate", "Boshlanish sanasi (reg_date)")}
              </label>
              <DatePicker value={regDate} onChange={setRegDate} />
              <p className="text-[11px] text-muted-foreground">
                {t(
                  "modules.bank.subSettings.regDateHint",
                  "Birinchi marta ulаgan vaqtda bu sanadan bugungacha hamma tranzaksiya olib kelinadi. Eski tranzaksiyalarni olish uchun ortga qaytaring.",
                )}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("modules.bank.subSettings.period", "Yangilash davriyligi")}
              </label>
              <Select value={periodDays} onValueChange={setPeriodDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Oxirgi 7 kun</SelectItem>
                  <SelectItem value="30">Oxirgi 30 kun</SelectItem>
                  <SelectItem value="90">Oxirgi 90 kun</SelectItem>
                  <SelectItem value="365">Oxirgi yil</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {t(
                  "modules.bank.subSettings.periodHint",
                  "Periodik sweep har oraliqда shu davrdaги o'zgargan tranzaksiyalarni qaytarib yuklab oladi.",
                )}
              </p>
            </div>

            {patch.isError && (
              <div className="text-sm text-destructive">{errMessage(patch.error)}</div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={patch.isPending}>
            {t("modules.bank.actions.cancel", "Bekor qilish")}
          </Button>
          <Button onClick={save} disabled={patch.isPending || isLoading}>
            {patch.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
            {t("modules.bank.actions.save", "Saqlash")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
