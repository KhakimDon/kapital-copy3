import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/reveal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useMeta } from "../api";
import { fmtSum } from "../types";
import { Metric } from "../components";

// ════ VIEW: Accountants (salary calc) ════ (1:1 with NC recalcSalary, computed client-side from meta)
export function AccountantsView() {
  const { t } = useTranslation();
  const { data: meta, isLoading, refetch } = useMeta();
  const cats = useMemo(() => (meta ? Object.keys(meta.accountantSalary) : []), [meta]);
  const [cat, setCat] = useState<string>("");
  const [ball, setBall] = useState("0");
  const [coll, setColl] = useState("100");
  const [bonus, setBonus] = useState("0");

  if (isLoading)
    return <div className="space-y-3 max-w-2xl">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!meta) return <ErrorState onRetry={() => refetch()} />;

  const activeCat = cat || cats[0] || "";
  const spb = meta.sumPerBall;
  const target = meta.accountantSalary[activeCat] ? meta.accountantSalary[activeCat] / spb : 0;
  const ballN = parseFloat(ball) || 0;
  const collF = Math.max(0, Math.min(1, (parseFloat(coll) || 0) / 100));
  const bonusF = Math.max(0, (parseFloat(bonus) || 0) / 100);
  const base = ballN * spb;
  const collected = base * collF;
  const bonusAmt = collected * bonusF;
  const total = collected + bonusAmt;

  return (
    <div className="max-w-2xl rounded-lg border border-border bg-card animate-in fade-in-0 duration-300">
      <div className="px-4 py-2.5 border-b border-border text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Users className="size-3.5" /> {t("modules.baholash.accountants.title")}
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t("modules.baholash.accountants.fields.category")}>
            <Select value={activeCat} onValueChange={setCat}>
              <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {cats.map((k) => (
                  <SelectItem key={k} value={k}>{k} — {fmtSum(meta.accountantSalary[k])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("modules.baholash.accountants.fields.targetBall")}>
            <Input readOnly value={`${target} ${t("modules.baholash.accountants.ballSuffix")}`} className="h-9" />
          </Field>
          <Field label={t("modules.baholash.accountants.fields.collectedBall")}>
            <Input type="number" step="0.1" min="0" value={ball} onChange={(e) => setBall(e.target.value)} className="h-9" />
          </Field>
          <Field label={t("modules.baholash.accountants.fields.collection")}>
            <Input type="number" step="1" min="0" max="100" value={coll} onChange={(e) => setColl(e.target.value)} className="h-9" />
          </Field>
          <Field label={t("modules.baholash.accountants.fields.bonus")}>
            <Input type="number" step="1" min="0" value={bonus} onChange={(e) => setBonus(e.target.value)} className="h-9" />
          </Field>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label={`${t("modules.baholash.accountants.fields.ballTimes")} ${fmtSum(spb)}`} value={fmtSum(base)} />
          <Metric label={t("modules.baholash.accountants.fields.collection")} value={`${Math.round(collF * 100)}%`} />
          <Metric label={t("modules.baholash.accountants.fields.bonus")} value={`${Math.round(bonusF * 100)}%`} />
          <Metric label={t("modules.baholash.accountants.fields.salary")} value={fmtSum(total)} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
