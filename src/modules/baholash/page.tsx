import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Award, ClipboardCheck, Building2, Users, Tags,
  Upload, ListChecks, ArrowLeft, CheckCircle2, ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useMeta, useFirmById, useFirmByInn, useEvaluate,
} from "./api";
import {
  DOC_LABELS, SPHERE_LABELS, fmtSum,
  type EvaluationResult, type CompanyItem,
} from "./types";
import { ClassBadge, Metric, SrcChip } from "./components";
import { FirmsView } from "./views/firms";
import { AccountantsView } from "./views/accountants";
import { TariffsView } from "./views/tariffs";
import { CompanyPickerModal, KeyUploadModal } from "./views/modals";

type Section = "new" | "firms" | "accountants" | "tariffs";

// A selected firm to evaluate: either by ES-Key id or by INN (after a key upload).
type FirmRef = { kind: "id"; id: number; name?: string; inn?: string } | { kind: "inn"; inn: string; name?: string };

export function BaholashPage() {
  const { t } = useTranslation();
  const NAV: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: "new", label: t("modules.baholash.nav.new"), icon: <ClipboardCheck className="size-[18px]" /> },
    { key: "firms", label: t("modules.baholash.nav.firms"), icon: <Building2 className="size-[18px]" /> },
    { key: "accountants", label: t("modules.baholash.nav.accountants"), icon: <Users className="size-[18px]" /> },
    { key: "tariffs", label: t("modules.baholash.nav.tariffs"), icon: <Tags className="size-[18px]" /> },
  ];
  const [section, setSection] = useState<Section>("new");
  const [firmRef, setFirmRef] = useState<FirmRef | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);

  return (
    <div className="flex flex-col md:flex-row gap-0 rounded-lg border border-border bg-card overflow-hidden">
      {/* ── Sidebar (NC icon rail) ── */}
      <aside className="md:w-56 shrink-0 bg-sidebar border-b md:border-b-0 md:border-r border-border">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Award className="size-5 text-primary" /> <span className="font-semibold text-sidebar-foreground">{t("modules.baholash.title")}</span>
        </div>
        <nav className="flex md:flex-col gap-1 p-2 overflow-x-auto">
          {NAV.map((n) => (
            <Button
              key={n.key}
              variant="ghost"
              onClick={() => setSection(n.key)}
              className={`h-auto justify-start gap-2.5 px-3 py-2 text-sm whitespace-nowrap ${
                section === n.key
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium hover:bg-sidebar-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {n.icon} <span>{n.label}</span>
            </Button>
          ))}
        </nav>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 min-w-0 p-4">
        {section === "new" && (
          firmRef ? (
            <FirmForm firmRef={firmRef} onBack={() => setFirmRef(null)} />
          ) : (
            <NewIntro
              onUpload={() => setKeyOpen(true)}
              onPick={() => setPickerOpen(true)}
            />
          )
        )}
        {section === "firms" && <FirmsView />}
        {section === "accountants" && <AccountantsView />}
        {section === "tariffs" && <TariffsView />}
      </main>

      <CompanyPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(c: CompanyItem) => { setFirmRef({ kind: "id", id: c.id, name: c.name, inn: c.inn }); setSection("new"); }}
      />
      <KeyUploadModal
        open={keyOpen}
        onOpenChange={setKeyOpen}
        onResolved={(inn, name) => { setFirmRef({ kind: "inn", inn, name }); setSection("new"); }}
      />
    </div>
  );
}

// ════ New evaluation — intro ════
function NewIntro({ onUpload, onPick }: { onUpload: () => void; onPick: () => void }) {
  const { t } = useTranslation();
  const steps = [
    t("modules.baholash.steps.espKey"),
    t("modules.baholash.steps.innDetect"),
    t("modules.baholash.steps.aibaCheck"),
    t("modules.baholash.steps.autoEvaluate"),
  ];
  return (
    <div className="rounded-lg border border-border bg-card p-8 md:p-12 text-center">
      <div className="mx-auto size-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
        <ClipboardCheck className="size-8" />
      </div>
      <h2 className="mt-4 text-xl font-semibold">{t("modules.baholash.intro.heading")}</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        {t("modules.baholash.intro.body")}
      </p>
      <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
        <Button size="lg" onClick={onUpload}><Upload className="size-4" /> {t("modules.baholash.actions.uploadKey")}</Button>
        <Button size="lg" variant="outline" onClick={onPick}><ListChecks className="size-4" /> {t("modules.baholash.actions.pickFirm")}</Button>
      </div>
      <div className="mt-8 pt-6 border-t border-border">
        <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">{t("modules.baholash.howItWorks")}</div>
        <div className="flex items-center justify-center gap-2 flex-wrap text-sm">
          {steps.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1">
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{i + 1}</span>
                {s}
              </span>
              {i < steps.length - 1 && <ArrowRight className="size-4 text-muted-foreground" />}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════ New evaluation — firm form (auto-pulled inputs + docs grid + result) ════
function FirmForm({ firmRef, onBack }: { firmRef: FirmRef; onBack: () => void }) {
  const { t } = useTranslation();
  const { data: meta } = useMeta();
  const byId = useFirmById(firmRef.kind === "id" ? firmRef.id : null);
  const byInn = useFirmByInn(firmRef.kind === "inn" ? firmRef.inn : null, firmRef.name || "");
  const q = firmRef.kind === "id" ? byId : byInn;
  const firm = q.data;
  const loading = q.isLoading;

  // Editable form state (seeded from the firm result once it loads).
  const [turnover, setTurnover] = useState("");
  const [employees, setEmployees] = useState("");
  const [sphere, setSphere] = useState("");
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [saved, setSaved] = useState(false);

  const evaluate = useEvaluate();

  useEffect(() => {
    if (!firm) return;
    setTurnover(firm.turnover_year_bln ? String(firm.turnover_year_bln) : "");
    setEmployees(firm.employees ? String(firm.employees) : "");
    setSphere(firm.sphere || "startup");
    const d: Record<string, string> = {};
    Object.entries(firm.documents || {}).forEach(([k, v]) => { if (v) d[k] = String(v); });
    setDocs(d);
    setResult(null);
    setSaved(false);
  }, [firm]);

  const docTypes = meta?.docTypes ?? Object.keys(DOC_LABELS);
  const sphereKeys = meta ? Object.keys(meta.spheres) : Object.keys(SPHERE_LABELS);

  function collect(save: boolean) {
    const documents: Record<string, number> = {};
    Object.entries(docs).forEach(([k, v]) => {
      const n = parseInt(v, 10);
      if (n > 0) documents[k] = n;
    });
    return {
      inn: firm?.inn || "",
      name: firm?.name || "",
      oked: firm?.oked || "",
      sphere,
      turnover_year_bln: parseFloat(turnover) || 0,
      employees: parseInt(employees, 10) || 0,
      documents,
      save,
    };
  }

  function doEvaluate(save: boolean) {
    evaluate.mutate(collect(save), {
      onSuccess: (resp) => {
        setResult(resp.result);
        if (save && resp.saved) setSaved(true);
      },
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack} title={t("modules.baholash.actions.back")}><ArrowLeft className="size-5" /></Button>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{firm?.name || firmRef.name || "…"}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            {(firm?.inn || firmRef.inn) && (
              <span className="font-mono">INN {firm?.inn || firmRef.inn}</span>
            )}
            {loading ? (
              <Skeleton className="h-4 w-16 rounded-full" />
            ) : firm ? (
              <span className="animate-in fade-in-0 duration-300">
                {firm.in_aiba ? (
                  <Badge variant="success">{t("modules.baholash.inAiba")}</Badge>
                ) : (
                  <Badge variant="warning">{t("modules.baholash.notInAiba")}</Badge>
                )}
              </span>
            ) : null}
          </div>
        </div>
        <Button onClick={() => doEvaluate(false)} disabled={loading || evaluate.isPending}>
          <CheckCircle2 className="size-4" /> {t("modules.baholash.actions.evaluate")}
        </Button>
      </div>

      {/* Main indicators */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-2.5 border-b border-border text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("modules.baholash.mainIndicators")}</div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={<>{t("modules.baholash.fields.turnover")} <SrcChip src={firm?.sources?.turnover_year_bln} /></>}>
            {loading ? <Skeleton className="h-9 w-full" /> :
              <Input type="number" step="0.01" min="0" value={turnover} onChange={(e) => setTurnover(e.target.value)} className="h-9 animate-in fade-in-0 duration-300" />}
          </Field>
          <Field label={<>{t("modules.baholash.fields.employees")} <SrcChip src={firm?.sources?.employees} /></>}>
            {loading ? <Skeleton className="h-9 w-full" /> :
              <Input type="number" step="1" min="0" value={employees} onChange={(e) => setEmployees(e.target.value)} className="h-9 animate-in fade-in-0 duration-300" />}
          </Field>
          <Field label={<>{t("modules.baholash.fields.sphere")} <SrcChip src={firm?.sources?.sphere} /></>}>
            {loading ? <Skeleton className="h-9 w-full" /> : (
              <Select value={sphere} onValueChange={setSphere}>
                <SelectTrigger className="h-9 animate-in fade-in-0 duration-300"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sphereKeys.map((k) => <SelectItem key={k} value={k}>{SPHERE_LABELS[k] || k}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Field>
        </div>
      </div>

      {/* Documents grid (yearly counts) */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-2.5 border-b border-border text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("modules.baholash.documentsYearly")}</div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {loading ? (
            docTypes.map((k) => <Skeleton key={k} className="h-9 w-full" />)
          ) : (
            docTypes.map((k) => {
              const src = firm?.sources?.documents?.[k];
              return (
                <label key={k} className="flex items-center justify-between gap-3 py-1.5 border-b border-border animate-in fade-in-0 duration-300">
                  <span className="text-sm min-w-0 flex-1">
                    {DOC_LABELS[k] || k}{src && <SrcChip src={src} />}
                  </span>
                  <Input
                    type="number" min="0" step="1"
                    value={docs[k] ?? ""}
                    onChange={(e) => setDocs((d) => ({ ...d, [k]: e.target.value }))}
                    className="h-8 w-24 shrink-0"
                  />
                </label>
              );
            })
          )}
        </div>
      </div>

      {/* Result */}
      {result && (
        <ResultPanel
          result={result}
          saved={saved}
          onSave={() => doEvaluate(true)}
          saving={evaluate.isPending}
        />
      )}
    </div>
  );
}

function ResultPanel({ result, saved, onSave, saving }: {
  result: EvaluationResult; saved: boolean; onSave: () => void; saving: boolean;
}) {
  const { t } = useTranslation();
  const exceeded = useMemo(
    () => (result.exceededDocs || []).map((k) => DOC_LABELS[k] || k),
    [result.exceededDocs]
  );
  return (
    <div className="rounded-lg border border-border bg-muted p-4 space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <div className="flex items-center justify-between gap-3">
        <ClassBadge cls={result.class} />
        <Button onClick={onSave} disabled={saving || saved}>
          {saved ? t("modules.baholash.savedLabel") : t("modules.baholash.actions.save")}
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label={t("modules.baholash.metrics.ball")} value={`${result.ball}${result.empCoef !== 1 ? ` (×${result.empCoef})` : ""}`} />
        <Metric label={t("modules.baholash.metrics.budget")} value={fmtSum(result.budget)} />
        <Metric label={t("modules.baholash.metrics.tariff")} value={`${fmtSum(result.tariffSum)} ($${result.tariffUsd})`} />
        <Metric label={t("modules.baholash.metrics.oneBall")} value={fmtSum(result.sumPerBall)} />
      </div>
      <div className="text-sm">
        <BreakRow k={t("modules.baholash.breakdown.baseClass")} v={`${result.baseClass}  (${t("modules.baholash.breakdown.turnoverArrow")}${result.classByTurnover}, ${t("modules.baholash.breakdown.employeesArrow")}${result.classByEmployees})`} />
        <BreakRow k={t("modules.baholash.breakdown.docBump")} v={result.docBump ? "+1" : "0"} />
        {exceeded.length > 0 && <BreakRow k={t("modules.baholash.breakdown.exceededDocs")} v={exceeded.join(", ")} />}
      </div>
    </div>
  );
}

function BreakRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-t border-dashed border-border">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right text-foreground">{v}</span>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground flex items-center">{label}</span>
      {children}
    </label>
  );
}
