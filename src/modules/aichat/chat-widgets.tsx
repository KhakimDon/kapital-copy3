// AI chat widget renderer — mirrors cloud's renderWidget / buildWidgetHtml
// catalog (see cloud-os/.../aiba_integration/js/ai-chat.js lines ~265-1080).
// Each widget reads a parsed widget_json blob and returns a NC-themed card.
// Everything routes through shadcn primitives (Card/Table/Button/Badge) and
// Tailwind theme tokens — no hardcoded colors, dark-mode safe.

import { useState, useMemo, type ReactNode } from "react";
import {
  Building2, FileText, Users, Receipt, BarChart3, CheckCircle2,
  Download, ExternalLink, ChevronRight, Wrench, Quote, FileDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Link } from "react-router-dom";
import { MdRenderer } from "./md-renderer";

// ---------- helpers ----------

type BadgeTone = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "danger" | "info" | "muted";

function toneVariant(t: BadgeTone): BadgeTone { return t; }

function fmtMoney(n: unknown): string {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? 0));
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("uz-UZ");
}

function fmtBytes(n: unknown): string {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? 0));
  if (!Number.isFinite(v) || v <= 0) return "";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${Math.max(1, Math.round(v / 1024))} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

function safeParse(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw !== "string") return raw;
  const s = raw.trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { return s; }
}

// Map cloud doctype codes → user-facing label (mirrors getDoctypeName in cloud).
function getDoctypeName(code: unknown): string {
  const c = String(code ?? "").replace(/^0+/, "") || "0";
  const map: Record<string, string> = {
    "0": "Shartnoma", "1": "Hisob-faktura", "2": "Faktura",
    "3": "Empowerment", "4": "Akt sverki", "5": "Dalolatnoma",
    "6": "TTN", "7": "QQS hisob-faktura", "8": "Boshqa",
  };
  return map[c] || "Hujjat";
}

// Status label + tone (mirrors getStatusLabel in cloud).
function docStatus(d: Record<string, unknown>): { label: string; tone: "success" | "danger" | "warning" | "muted" } {
  const s = parseInt(String(d.doc_status ?? d.status ?? 0), 10);
  const owner = parseInt(String(d.owner ?? 0), 10);
  if (s === 3 || s === 33 || s === 160 || s === 180) return { label: "Imzolangan", tone: "success" };
  if (s === 4 || s === 130 || s === 150 || s === 170 || s === 190) return { label: "Rad etilgan", tone: "danger" };
  if (s === 5 || s === 120) return { label: "O‘chirilgan", tone: "danger" };
  if (owner === 0 && (s === 2 || s === 22 || s === 110 || s === 140)) return { label: "Imzo kutilmoqda", tone: "warning" };
  if (owner === 1 && (s === 1 || s === 11)) return { label: "Hamkor imzosi kutilmoqda", tone: "warning" };
  if (s === 0) return { label: "Qoralama", tone: "muted" };
  return { label: `Jarayonda (${s})`, tone: "warning" };
}

function pickStr(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

function asArr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.rows)) return obj.rows;
  }
  return [];
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// ---------- shared card layout ----------

function WCard({ title, icon, children, accent }: {
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "my-2 overflow-hidden border-primary/50" : "my-2 overflow-hidden"}>
      <div className={`flex items-center gap-2 border-b border-border px-4 py-2.5 text-[13px] font-semibold ${accent ? "bg-primary/10 text-primary" : "bg-muted"}`}>
        {icon ?? <FileText className="h-4 w-4" />}
        <span className="truncate">{title}</span>
      </div>
      {children}
    </Card>
  );
}

function WRow({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: "success" | "danger" | "warning" | "muted" }) {
  const toneCls =
    tone === "success" ? "text-success" :
    tone === "danger" ? "text-destructive" :
    tone === "warning" ? "text-warning" :
    tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2 text-[13px] last:border-b-0">
      <span className="text-[11px] uppercase tracking-[0.5px] text-muted-foreground">{label}</span>
      <span className={`text-right ${toneCls}`}>{value}</span>
    </div>
  );
}

// ---------- file download widgets ----------

function FileDownloadCard({
  data, title, icon, lines, accent = true,
}: {
  data: Record<string, unknown>;
  title: string;
  icon: ReactNode;
  lines: { label: string; value: ReactNode; tone?: "success" | "danger" | "warning" | "muted" }[];
  accent?: boolean;
}) {
  const url = pickStr(data, "downloadUrl", "download_url", "url", "href");
  const preview = pickStr(data, "previewUrl", "preview_url");
  const filename = pickStr(data, "filename", "name");
  const size = fmtBytes(data.sizeBytes ?? data.size_bytes ?? data.size);
  return (
    <WCard title={title} icon={icon} accent={accent}>
      {lines.map((l, i) => (
        <WRow key={i} label={l.label} value={l.value} tone={l.tone} />
      ))}
      {filename ? (
        <WRow label="Fayl" value={
          <span className="font-mono text-[12px]">{filename}{size ? ` · ${size}` : ""}</span>
        } />
      ) : null}
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {url ? (
          <Button asChild size="sm" variant="default">
            <a href={url} download={filename || true}>
              <Download className="h-4 w-4" />Yuklab olish
            </a>
          </Button>
        ) : null}
        {preview ? (
          <Button asChild size="sm" variant="outline">
            <a href={preview} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />Ko‘rish
            </a>
          </Button>
        ) : null}
      </div>
    </WCard>
  );
}

function SverkaPdfWidget({ d }: { d: Record<string, unknown> }) {
  const period = asObj(d.period);
  const periodStr = period.from || period.to
    ? `${period.from ?? ""} → ${period.to ?? ""}`
    : "";
  return (
    <FileDownloadCard
      data={d}
      title="Akt sverka PDF tayyor"
      icon={<CheckCircle2 className="h-4 w-4" />}
      lines={[
        { label: "Kontragent", value: pickStr(d, "counterparty") || "—" },
        ...(periodStr ? [{ label: "Davr", value: periodStr }] : []),
      ]}
    />
  );
}

function InvoicePdfWidget({ d }: { d: Record<string, unknown> }) {
  const cur = pickStr(d, "currency") || "UZS";
  return (
    <FileDownloadCard
      data={d}
      title={`Hisob-faktura № ${pickStr(d, "invoice_no") || "—"}`}
      icon={<Receipt className="h-4 w-4" />}
      lines={[
        { label: "Sana", value: pickStr(d, "invoice_date") || "—" },
        { label: "Sotuvchi", value: pickStr(d, "seller_name") || "—" },
        { label: "Xaridor", value: pickStr(d, "buyer_name") || "—" },
        { label: "Naimenovaniya", value: String(d.items_count ?? 0) },
        { label: "Summa (НДСsiz)", value: `${fmtMoney(d.total_net)} ${cur}` },
        { label: "НДС", value: `${fmtMoney(d.total_vat)} ${cur}` },
        { label: "Jami", value: <strong>{fmtMoney(d.total_all)} {cur}</strong> },
      ]}
    />
  );
}

function SoliqXlsxWidget({ d }: { d: Record<string, unknown> }) {
  const totals = asObj(d.totals);
  const lines: { label: string; value: ReactNode }[] = [
    { label: "Forma", value: pickStr(d, "form") || "11101_19" },
    { label: "Davr", value: pickStr(d, "period_label", "period") || "—" },
  ];
  const inn = pickStr(d, "company_inn");
  if (inn) lines.push({ label: "INN", value: inn });
  if (d.employees_count != null) lines.push({ label: "Xodimlar", value: String(d.employees_count) });
  if (totals.period_base != null) {
    lines.push({ label: "База (oy)", value: `${fmtMoney(totals.period_base)} UZS` });
    lines.push({ label: "НДФЛ", value: `${fmtMoney((totals.period_ndfl as number ?? 0) + (totals.period_inps as number ?? 0))} UZS` });
  }
  return (
    <FileDownloadCard
      data={d}
      title="my.soliq.uz ga tayyor xlsx"
      icon={<FileDown className="h-4 w-4" />}
      lines={lines}
    />
  );
}

function InpsXlsxWidget({ d }: { d: Record<string, unknown> }) {
  const period = pickStr(d, "period_label") || `${d.year ?? "?"}-${d.month ?? "?"}`;
  return (
    <FileDownloadCard
      data={d}
      title={`ИНПС реестр — ${period}`}
      icon={<FileDown className="h-4 w-4" />}
      lines={[
        { label: "Kompaniya", value: `${pickStr(d, "company_name")}${pickStr(d, "company_inn") ? ` (${pickStr(d, "company_inn")})` : ""}` },
        { label: "Xodimlar", value: String(d.employees_count ?? 0) },
        { label: "Jami doxod", value: `${fmtMoney(d.total_gross)} UZS` },
        { label: "ИНПС взнос", value: `${fmtMoney(d.total_inps)} UZS` },
      ]}
    />
  );
}

// ---------- data-card widgets ----------

function CompaniesWidget({ d }: { d: Record<string, unknown> }) {
  const items = asArr(d);
  return (
    <WCard title={`Kompaniyalar (${items.length})`} icon={<Building2 className="h-4 w-4" />}>
      <div className="divide-y divide-border/60">
        {items.slice(0, 15).map((raw, i) => {
          const c = asObj(raw);
          return (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{pickStr(c, "name")}</div>
                {pickStr(c, "legal_form") ? (
                  <div className="truncate text-[11px] text-muted-foreground">{pickStr(c, "legal_form")}</div>
                ) : null}
              </div>
              {pickStr(c, "inn") ? (
                <Badge variant={toneVariant(c.is_active ? "success" : "muted")}>{pickStr(c, "inn")}</Badge>
              ) : null}
              {c.id != null ? (
                <Link to={`/companies/${c.id}`} className="text-muted-foreground hover:text-primary">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </WCard>
  );
}

function CompanyDetailWidget({ d }: { d: Record<string, unknown> }) {
  return (
    <WCard title={pickStr(d, "name") || "Kompaniya"} icon={<Building2 className="h-4 w-4" />}>
      {pickStr(d, "inn") ? <WRow label="INN" value={pickStr(d, "inn")} /> : null}
      <WRow
        label="Holat"
        value={<Badge variant={toneVariant(d.is_active ? "success" : "danger")}>{d.is_active ? "Faol" : "Nofaol"}</Badge>}
      />
      {pickStr(d, "legal_form") ? <WRow label="Shakl" value={pickStr(d, "legal_form")} /> : null}
      {d.keys_count != null ? <WRow label="Kalitlar" value={String(d.keys_count)} /> : null}
      {d.id != null ? (
        <div className="px-4 py-3">
          <Button asChild size="sm" variant="outline">
            <Link to={`/companies/${d.id}`}>Ko‘rish<ChevronRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      ) : null}
    </WCard>
  );
}

function DocumentsWidget({ d }: { d: Record<string, unknown> }) {
  const items = asArr(d.items ?? d);
  const total = d.total ?? items.length;
  return (
    <WCard
      title={`Hujjatlar (${items.length}${typeof total === "number" && total > items.length ? ` / ${total}` : ""})`}
      icon={<FileText className="h-4 w-4" />}
    >
      <div className="divide-y divide-border/60">
        {items.slice(0, 15).map((raw, i) => {
          const doc = asObj(raw);
          const jsonData = asObj(doc.json_data);
          const docInner = asObj(jsonData.document);
          let docName = pickStr(docInner, "documentname") || getDoctypeName(doc.doctype);
          if (pickStr(doc, "name")) docName += ` №${pickStr(doc, "name")}`;
          const partner = pickStr(doc, "partnerCompany", "partner");
          const date = pickStr(doc, "doc_date", "date");
          const amount = parseFloat(String(doc.total_sum ?? doc.amount ?? 0));
          const st = docStatus(doc);
          return (
            <div key={i} className="flex items-start justify-between gap-3 px-4 py-2.5 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{docName}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {partner}{date ? ` · ${date}` : ""}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={st.tone === "muted" ? "muted" : st.tone}>{st.label}</Badge>
                {amount > 0 ? <span className="text-[12px] font-semibold">{fmtMoney(amount)} UZS</span> : null}
              </div>
              {doc.id != null ? (
                <Link to={`/documents/${doc.id}`} className="text-muted-foreground hover:text-primary">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </WCard>
  );
}

function EmployeesWidget({ d }: { d: Record<string, unknown> }) {
  const items = asArr(d);
  return (
    <WCard title={`Xodimlar (${items.length})`} icon={<Users className="h-4 w-4" />}>
      <div className="divide-y divide-border/60">
        {items.slice(0, 20).map((raw, i) => {
          const e = asObj(raw);
          const name = pickStr(e, "full_name") ||
            [e.last_name, e.first_name, e.middle_name].filter(Boolean).join(" ").trim() ||
            pickStr(e, "name") || "?";
          const initial = name.charAt(0).toUpperCase();
          const code = pickStr(e, "employeeCode", "employee_code");
          return (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[12px] font-semibold text-primary">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {pickStr(e, "position") || "Lavozim ko‘rsatilmagan"}
                  {pickStr(e, "phone") ? ` · ${pickStr(e, "phone")}` : ""}
                  {code ? ` · #${code}` : ""}
                </div>
              </div>
              {e.status === "active" ? <Badge variant="success">Faol</Badge> : null}
              {e.id != null ? (
                <Link to={`/employees/${e.id}`} className="text-muted-foreground hover:text-primary">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </WCard>
  );
}

// ---------- generic widgets ----------

function TableWidget({ d }: { d: Record<string, unknown> }) {
  // Accept { columns:[{key,label}], rows:[{...}] } or { headers:[], rows:[[...]] }
  const headers: string[] = Array.isArray(d.headers)
    ? (d.headers as unknown[]).map(String)
    : Array.isArray(d.columns)
      ? (d.columns as unknown[]).map(c => {
          const o = asObj(c);
          return pickStr(o, "label", "title", "key");
        })
      : [];
  const cols: string[] = Array.isArray(d.columns)
    ? (d.columns as unknown[]).map(c => pickStr(asObj(c), "key", "label", "title"))
    : [];
  const rows = asArr(d.rows ?? d.items ?? d.data);
  return (
    <WCard title={pickStr(d, "title") || "Jadval"} icon={<BarChart3 className="h-4 w-4" />}>
      <Table>
        {headers.length ? (
          <TableHeader>
            <TableRow>{headers.map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow>
          </TableHeader>
        ) : null}
        <TableBody>
          {rows.slice(0, 50).map((raw, i) => {
            if (Array.isArray(raw)) {
              return (
                <TableRow key={i}>
                  {raw.map((cell, j) => <TableCell key={j}>{String(cell ?? "")}</TableCell>)}
                </TableRow>
              );
            }
            const obj = asObj(raw);
            const keys = cols.length ? cols : Object.keys(obj);
            return (
              <TableRow key={i}>
                {keys.map((k, j) => <TableCell key={j}>{String(obj[k] ?? "")}</TableCell>)}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </WCard>
  );
}

function CitationsWidget({ d }: { d: Record<string, unknown> }) {
  const items = asArr(d.items ?? d.sources ?? d);
  return (
    <WCard title={`Manbalar (${items.length})`} icon={<Quote className="h-4 w-4" />}>
      <ol className="list-decimal space-y-1 px-6 py-3 text-[12px] text-muted-foreground">
        {items.map((raw, i) => {
          const c = asObj(raw);
          const title = pickStr(c, "title", "name") || `Manba ${i + 1}`;
          const url = pickStr(c, "url", "href", "link");
          return (
            <li key={i}>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">{title}</a>
              ) : (
                title
              )}
              {pickStr(c, "snippet") ? (
                <div className="text-[11px] opacity-80">{pickStr(c, "snippet")}</div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </WCard>
  );
}

function ChartWidget({ d }: { d: Record<string, unknown> }) {
  // Cloud renders canvas charts; we stub with summary + data toggle.
  const points = asArr(d.points ?? d.data ?? d.series);
  return (
    <WCard title={pickStr(d, "title") || "Grafik"} icon={<BarChart3 className="h-4 w-4" />}>
      <div className="px-4 py-3 text-[13px]">
        <div className="text-muted-foreground">
          {points.length} ta nuqta
          {pickStr(d, "xLabel") ? ` · ${pickStr(d, "xLabel")}` : ""}
          {pickStr(d, "yLabel") ? ` ↔ ${pickStr(d, "yLabel")}` : ""}
        </div>
        <Collapsible className="mt-2">
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="ghost">Ma’lumotni ko‘rsatish</Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px]">
              {JSON.stringify(d, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </WCard>
  );
}

function ToolResultWidget({ d, kind }: { d: Record<string, unknown>; kind: "call" | "result" }) {
  const [open, setOpen] = useState(false);
  const name = pickStr(d, "name", "tool", "tool_name") || (kind === "call" ? "Tool call" : "Tool result");
  const args = d.args ?? d.arguments ?? d.input;
  const result = d.result ?? d.output ?? d.response;
  const summary = pickStr(d, "summary", "message");
  return (
    <Card className="my-2 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex h-auto w-full items-center justify-start gap-2 rounded-none border-b border-border bg-muted px-4 py-2 text-left text-[13px] font-semibold transition-colors hover:bg-muted/80"
          >
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{name}</span>
            {summary ? (
              <span className="ml-auto truncate text-[11px] font-normal text-muted-foreground">{summary}</span>
            ) : null}
            <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 p-3 text-[12px]">
            {args !== undefined ? (
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.5px] text-muted-foreground">Argumentlar</div>
                <pre className="overflow-auto rounded-md bg-muted p-2 font-mono">{JSON.stringify(args, null, 2)}</pre>
              </div>
            ) : null}
            {result !== undefined ? (
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.5px] text-muted-foreground">Natija</div>
                <pre className="overflow-auto rounded-md bg-muted p-2 font-mono">{JSON.stringify(result, null, 2)}</pre>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ---------- new widgets for high-frequency types in nc_uic ----------

function DocCreatedWidget({ d }: { d: Record<string, unknown> }) {
  const docType = pickStr(d, "doc_type");
  const docId = pickStr(d, "doc_id");
  const signed = Boolean(d.signed);
  const seller = pickStr(d, "seller");
  const buyer = pickStr(d, "buyer");
  const amount = d.amount;
  const signErr = pickStr(d, "sign_error");
  const isOk = pickStr(d, "status") === "success";
  return (
    <WCard
      title={`Yangi ${getDoctypeName(docType)}${docId ? ` · ${docId.slice(0, 12)}…` : ""}`}
      icon={isOk ? <CheckCircle2 className="h-4 w-4 text-success" /> : <FileText className="h-4 w-4" />}
      accent={isOk}
    >
      {seller ? <WRow label="Sotuvchi" value={seller} /> : null}
      {buyer ? <WRow label="Xaridor" value={buyer} /> : null}
      {amount != null ? <WRow label="Summa" value={<strong>{fmtMoney(amount)} UZS</strong>} /> : null}
      <WRow
        label="Imzo"
        value={signed
          ? <Badge variant={toneVariant("success")}>Imzolangan</Badge>
          : signErr
            ? <Badge variant={toneVariant("destructive")}>Imzolanmadi</Badge>
            : <Badge variant={toneVariant("warning")}>Imzo kutilmoqda</Badge>}
      />
      {signErr ? <WRow label="Imzo xatosi" value={<span className="text-destructive text-[12px]">{signErr}</span>} /> : null}
    </WCard>
  );
}

function SverkaCounterpartiesWidget({ d, raw }: { d: Record<string, unknown>; raw: unknown }) {
  // Cloud sometimes emits a top-level array.
  const items = Array.isArray(raw) ? (raw as unknown[]) : asArr(d.items ?? raw);
  return (
    <WCard
      title={`Sverka kontragentlari (${items.length})`}
      icon={<Building2 className="h-4 w-4" />}
    >
      <div className="max-h-72 divide-y divide-border overflow-auto text-[12.5px]">
        {items.slice(0, 50).map((it, i) => {
          const c = asObj(it);
          const name = pickStr(c, "name") || "—";
          const inn = pickStr(c, "inn");
          const hasPay = Boolean(c.hasPaymentData ?? c.has_payment_data);
          return (
            <div key={i} className="flex items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1 truncate">{name.trim()}</div>
              {inn ? <span className="font-mono text-[11px] text-muted-foreground">{inn}</span> : null}
              {hasPay ? <Badge variant={toneVariant("info")} className="shrink-0">to'lov</Badge> : null}
            </div>
          );
        })}
        {items.length > 50 ? (
          <div className="px-4 py-2 text-[11px] italic text-muted-foreground">… yana {items.length - 50} ta</div>
        ) : null}
      </div>
    </WCard>
  );
}

function SverkaContractsWidget({ d, raw }: { d: Record<string, unknown>; raw: unknown }) {
  const items = Array.isArray(raw) ? (raw as unknown[]) : asArr(d.items ?? raw);
  return (
    <WCard title={`Shartnomalar (${items.length})`} icon={<FileText className="h-4 w-4" />}>
      <div className="divide-y divide-border text-[12.5px]">
        {items.slice(0, 40).map((it, i) => {
          const c = asObj(it);
          const contract = pickStr(c, "contract") || "—";
          const cp = pickStr(c, "counterparty");
          const count = c.documentCount ?? c.document_count;
          return (
            <div key={i} className="px-4 py-2">
              <div className="font-medium">{contract}</div>
              <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                <span className="truncate">{cp || "—"}</span>
                {count != null ? <span>{String(count)} hujjat</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </WCard>
  );
}

function SverkaDetailWidget({ d }: { d: Record<string, unknown> }) {
  const name = pickStr(d, "counterpartyName", "counterparty_name", "counterparty") || "—";
  const contract = pickStr(d, "contract");
  const period = asObj(d.period);
  const txs = asArr(d.transactions ?? d.items);
  const opening = d.openingBalance ?? d.opening_balance;
  const closing = d.closingBalance ?? d.closing_balance;
  let totalDr = 0, totalCr = 0;
  for (const t of txs) {
    const x = asObj(t);
    totalDr += Number(x.debit ?? 0) || 0;
    totalCr += Number(x.credit ?? 0) || 0;
  }
  return (
    <WCard title={`Akt sverka · ${name}`} icon={<FileText className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-x-4 px-4 py-2 text-[12px]">
        {contract ? (
          <div className="col-span-2 text-muted-foreground">Shartnoma: {contract}</div>
        ) : null}
        {(period.from || period.to) ? (
          <div className="col-span-2 text-muted-foreground">
            Davr: {String(period.from ?? "")} → {String(period.to ?? "")}
          </div>
        ) : null}
        {opening != null ? <div>Boshlang'ich qoldiq: <strong>{fmtMoney(opening)}</strong></div> : null}
        {closing != null ? <div>Yakuniy qoldiq: <strong>{fmtMoney(closing)}</strong></div> : null}
      </div>
      <div className="max-h-80 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sana</TableHead>
              <TableHead>Hujjat</TableHead>
              <TableHead className="text-right">Дт</TableHead>
              <TableHead className="text-right">Кт</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {txs.slice(0, 50).map((it, i) => {
              const t = asObj(it);
              return (
                <TableRow key={i}>
                  <TableCell className="text-[11.5px] whitespace-nowrap">{pickStr(t, "date")}</TableCell>
                  <TableCell className="font-mono text-[11.5px]">{pickStr(t, "documentNumber", "document_number")}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(t.debit) ? fmtMoney(t.debit) : ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(t.credit) ? fmtMoney(t.credit) : ""}</TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/50 font-semibold">
              <TableCell colSpan={2}>Jami</TableCell>
              <TableCell className="text-right tabular-nums">{fmtMoney(totalDr)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtMoney(totalCr)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        {txs.length > 50 ? (
          <div className="px-4 py-1 text-[11px] italic text-muted-foreground">… yana {txs.length - 50} ta tranzaksiya</div>
        ) : null}
      </div>
    </WCard>
  );
}

function PaymentResultWidget({ d }: { d: Record<string, unknown> }) {
  const err = Boolean(d.error);
  const msg = pickStr(d, "message");
  const data = asObj(d.data);
  return (
    <WCard
      title={err ? "To'lov xatosi" : "To'lov natijasi"}
      icon={err ? <FileText className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
      accent={!err}
    >
      {msg ? <div className="border-b border-border/60 px-4 py-2 text-[13px]">{msg}</div> : null}
      {data.payment_id != null ? <WRow label="ID" value={String(data.payment_id)} /> : null}
      {data.payment_number != null ? <WRow label="Raqam" value={`№ ${String(data.payment_number)}`} /> : null}
      {data.status ? <WRow label="Holat" value={<Badge variant={toneVariant(data.status === "signed" ? "success" : "warning")}>{String(data.status)}</Badge>} /> : null}
      {data.amount != null ? <WRow label="Summa" value={<strong>{fmtMoney(data.amount)} UZS</strong>} /> : null}
    </WCard>
  );
}

function PayrollResultWidget({ d }: { d: Record<string, unknown> }) {
  const err = Boolean(d.error);
  const msg = pickStr(d, "message");
  const data = asObj(d.data);
  return (
    <WCard
      title={err ? "Oylik xatosi" : "Oylik hisoblandi"}
      icon={err ? <FileText className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
      accent={!err}
    >
      {msg ? <div className="border-b border-border/60 px-4 py-2 text-[13px]">{msg}</div> : null}
      {data.run_id != null ? <WRow label="Run ID" value={String(data.run_id)} /> : null}
      {data.employees_count != null ? <WRow label="Xodimlar" value={String(data.employees_count)} /> : null}
      {data.period ? <WRow label="Davr" value={String(data.period)} /> : null}
      {data.total != null ? <WRow label="Jami" value={<strong>{fmtMoney(data.total)} UZS</strong>} /> : null}
    </WCard>
  );
}

function TaxPaymentsWidget({ d }: { d: Record<string, unknown> }) {
  const items = asArr(d.items ?? d.payments ?? d);
  return (
    <WCard
      title={`Soliq to'lovlari (${items.length})`}
      icon={<Receipt className="h-4 w-4" />}
    >
      <div className="max-h-80 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sana</TableHead>
              <TableHead>Raqam</TableHead>
              <TableHead>Soliq</TableHead>
              <TableHead className="text-right">Summa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.slice(0, 40).map((it, i) => {
              const p = asObj(it);
              return (
                <TableRow key={i}>
                  <TableCell className="text-[11.5px] whitespace-nowrap">{pickStr(p, "payment_date")}</TableCell>
                  <TableCell className="font-mono text-[11.5px]">{pickStr(p, "payment_num")}</TableCell>
                  <TableCell className="text-[11.5px]">{pickStr(p, "payment_type")}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(p.amount ?? p.summa)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {items.length > 40 ? (
          <div className="px-4 py-1 text-[11px] italic text-muted-foreground">… yana {items.length - 40} ta to'lov</div>
        ) : null}
      </div>
    </WCard>
  );
}

function BalanceWidget({ d }: { d: Record<string, unknown> }) {
  const accs = asArr(d.accounts ?? d.items ?? d);
  const company = pickStr(d, "company", "company_name") || "Balans";
  return (
    <WCard title={company} icon={<Receipt className="h-4 w-4" />}>
      <div className="divide-y divide-border">
        {accs.map((it, i) => {
          const a = asObj(it);
          const num = pickStr(a, "number", "account_number");
          const bank = pickStr(a, "bank", "bank_name");
          const cur = pickStr(a, "currency") || "UZS";
          const bal = Number(a.balance ?? a.amount ?? 0);
          return (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2">
              <div className="min-w-0">
                <div className="font-mono text-[12px]">{num}</div>
                <div className="text-[11px] text-muted-foreground truncate">{bank}</div>
              </div>
              <div className={`text-right text-[13px] font-semibold tabular-nums ${bal < 0 ? "text-destructive" : ""}`}>
                {fmtMoney(bal)} <small className="font-normal text-muted-foreground">{cur}</small>
              </div>
            </div>
          );
        })}
      </div>
    </WCard>
  );
}

function TransactionsWidget({ d }: { d: Record<string, unknown> }) {
  const items = asArr(d.items ?? d.transactions ?? d);
  return (
    <WCard title={`Tranzaksiyalar (${items.length})`} icon={<Receipt className="h-4 w-4" />}>
      <div className="max-h-80 overflow-auto divide-y divide-border">
        {items.slice(0, 40).map((it, i) => {
          const t = asObj(it);
          const dir = pickStr(t, "direction");
          const isIn = dir === "in" || dir === "credit";
          const amt = Math.abs(Number(t.amount ?? 0));
          const cp = pickStr(t, "counterparty", "sender", "receiver") || "—";
          const date = pickStr(t, "date");
          return (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-2">
              <div className="min-w-0">
                <div className="truncate text-[12.5px]">{cp}</div>
                {date ? <div className="text-[11px] text-muted-foreground">{date}</div> : null}
              </div>
              <div className={`text-right text-[12.5px] tabular-nums ${isIn ? "text-success" : "text-destructive"}`}>
                {isIn ? "+" : "−"}{fmtMoney(amt)}
              </div>
            </div>
          );
        })}
      </div>
    </WCard>
  );
}

function DocumentDetailWidget({ d }: { d: Record<string, unknown> }) {
  const docId = pickStr(d, "doc_id", "id");
  const doctype = pickStr(d, "doc_type", "doctype");
  const seller = pickStr(d, "seller_name", "seller");
  const buyer = pickStr(d, "buyer_name", "buyer");
  const status = docStatus(d);
  return (
    <WCard title={`${getDoctypeName(doctype)}${docId ? ` · ${docId.slice(0, 12)}…` : ""}`} icon={<FileText className="h-4 w-4" />}>
      {seller ? <WRow label="Sotuvchi" value={seller} /> : null}
      {buyer ? <WRow label="Xaridor" value={buyer} /> : null}
      <WRow label="Holat" value={<Badge variant={toneVariant(status.tone === "danger" ? "destructive" : status.tone)}>{status.label}</Badge>} />
      {d.amount != null ? <WRow label="Summa" value={<strong>{fmtMoney(d.amount)} UZS</strong>} /> : null}
      {d.date ? <WRow label="Sana" value={String(d.date)} /> : null}
    </WCard>
  );
}

function AttendanceWidget({ d }: { d: Record<string, unknown> }) {
  const items = asArr(d.items ?? d.events);
  const summary = asObj(d.summary);
  return (
    <WCard title={pickStr(d, "title") || `Davomat (${items.length})`} icon={<Users className="h-4 w-4" />}>
      {(summary.present != null || summary.late != null || summary.absent != null) ? (
        <div className="grid grid-cols-3 gap-2 border-b border-border/60 p-3 text-[12px]">
          {summary.present != null ? <div className="text-success">✓ {String(summary.present)} kelgan</div> : null}
          {summary.late != null ? <div className="text-warning">⏱ {String(summary.late)} kechikkan</div> : null}
          {summary.absent != null ? <div className="text-destructive">✗ {String(summary.absent)} yo'q</div> : null}
        </div>
      ) : null}
      <div className="max-h-72 divide-y divide-border overflow-auto text-[12.5px]">
        {items.slice(0, 30).map((it, i) => {
          const e = asObj(it);
          return (
            <div key={i} className="flex items-center justify-between px-4 py-1.5">
              <span className="truncate">{pickStr(e, "name", "employee", "full_name") || "—"}</span>
              <span className="text-[11.5px] text-muted-foreground">{pickStr(e, "date", "event_date")} {pickStr(e, "time", "event_time")}</span>
            </div>
          );
        })}
      </div>
    </WCard>
  );
}

function SoliqOpenWidget({ d }: { d: Record<string, unknown> }) {
  const url = pickStr(d, "url", "open_url");
  return (
    <WCard title="my.soliq.uz portali" icon={<ExternalLink className="h-4 w-4" />} accent>
      {pickStr(d, "form") ? <WRow label="Forma" value={pickStr(d, "form")} /> : null}
      {pickStr(d, "period") ? <WRow label="Davr" value={pickStr(d, "period")} /> : null}
      {pickStr(d, "message") ? (
        <div className="border-b border-border/60 px-4 py-2 text-[13px]">{pickStr(d, "message")}</div>
      ) : null}
      {url ? (
        <div className="px-4 py-3">
          <Button asChild size="sm" variant="default">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />my.soliq.uz da ochish
            </a>
          </Button>
        </div>
      ) : null}
    </WCard>
  );
}

// "tax" widget in nc_uic actually carries a {items:[company...]} list with
// tax-focused fields (vat, tax_mode, sustainability). Re-use CompaniesWidget.

// Smart fallback — auto-detect items[] table OR scalar key/value list
// before falling back to raw JSON dump.
function UnknownWidget({ type, raw }: { type: string; raw: unknown }) {
  // Case 1: array of objects → render as table.
  if (Array.isArray(raw) && raw.length && raw.every(it => it && typeof it === "object")) {
    const items = raw as Record<string, unknown>[];
    const keys = Object.keys(items[0]).slice(0, 6);
    return (
      <WCard title={`${type} (${items.length})`} icon={<FileText className="h-4 w-4" />}>
        <div className="max-h-72 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>{keys.map(k => <TableHead key={k} className="text-[11px]">{k}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {items.slice(0, 30).map((it, i) => (
                <TableRow key={i}>
                  {keys.map(k => (
                    <TableCell key={k} className="text-[11.5px] max-w-[200px] truncate">
                      {it[k] == null ? "" : typeof it[k] === "object" ? JSON.stringify(it[k]) : String(it[k])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </WCard>
    );
  }
  // Case 2: object with items[] → table on items.
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items) && obj.items.length && obj.items[0] && typeof obj.items[0] === "object") {
      return <UnknownWidget type={type} raw={obj.items} />;
    }
    // Case 3: flat key-value object — render as WCard rows (skip nested complex values).
    const entries = Object.entries(obj).filter(([, v]) => v == null || typeof v !== "object");
    if (entries.length && entries.length <= 12) {
      return (
        <WCard title={type} icon={<FileText className="h-4 w-4" />}>
          {entries.map(([k, v]) => (
            <WRow key={k} label={k} value={v == null || v === "" ? "—" : String(v)} />
          ))}
        </WCard>
      );
    }
  }
  // Final fallback: collapsible raw JSON (less prominent than always-open pre).
  const text = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
  return (
    <Card className="my-2 overflow-hidden">
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex h-auto w-full items-center justify-start gap-2 rounded-none border-b border-border bg-muted px-4 py-2 text-left text-[12px] font-semibold text-muted-foreground hover:bg-muted/80"
          >
            <FileText className="h-4 w-4" />
            <span>{type}</span>
            <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="max-h-72 overflow-auto p-3 font-mono text-[11px]">{text}</pre>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ---------- main dispatcher ----------

export interface WidgetRendererProps {
  widget_type: string;
  widget_json: unknown;
}

export function WidgetRenderer({ widget_type, widget_json }: WidgetRendererProps) {
  const parsed = useMemo(() => safeParse(widget_json), [widget_json]);
  const type = (widget_type || "").toLowerCase().replace(/_/g, "-");
  // If parse failed (string came back), treat as raw markdown / fallback.
  if (typeof parsed === "string") {
    if (type === "markdown" || type === "md") return <MdRenderer source={parsed} className="text-[13px]" />;
    return <UnknownWidget type={widget_type} raw={parsed} />;
  }
  const d = asObj(parsed);

  switch (type) {
    case "markdown":
    case "md": {
      const src = typeof parsed === "string" ? parsed : pickStr(d, "content", "text", "source", "markdown");
      return <MdRenderer source={src} className="text-[13px]" />;
    }
    case "table":
      return <TableWidget d={d} />;
    case "citations":
    case "sources":
      return <CitationsWidget d={d} />;
    case "chart":
      return <ChartWidget d={d} />;
    case "tool-result":
      return <ToolResultWidget d={d} kind="result" />;
    case "tool-call":
      return <ToolResultWidget d={d} kind="call" />;

    case "sverka-pdf":
      return <SverkaPdfWidget d={d} />;
    case "invoice-pdf":
      return <InvoicePdfWidget d={d} />;
    case "soliq-xlsx":
    case "soliq-submit":
      return <SoliqXlsxWidget d={d} />;
    case "inps-xlsx":
    case "inps-merge":
    case "inps-submit":
      return <InpsXlsxWidget d={d} />;

    case "companies":
      return <CompaniesWidget d={d} />;
    case "company":
    case "company-lookup":
      return <CompanyDetailWidget d={d} />;
    case "documents":
      return <DocumentsWidget d={d} />;
    case "document-detail":
      return <DocumentDetailWidget d={d} />;
    case "employees":
      return <EmployeesWidget d={d} />;

    case "doc-created":
    case "doc-generated":
      return <DocCreatedWidget d={d} />;
    case "sverka-counterparties":
      return <SverkaCounterpartiesWidget d={d} raw={parsed} />;
    case "sverka-contracts":
      return <SverkaContractsWidget d={d} raw={parsed} />;
    case "sverka-detail":
    case "sverka-summary":
      return <SverkaDetailWidget d={d} />;
    case "payment-result":
      return <PaymentResultWidget d={d} />;
    case "payroll-result":
      return <PayrollResultWidget d={d} />;
    case "tax-payments":
      return <TaxPaymentsWidget d={d} />;
    case "balance":
      return <BalanceWidget d={d} />;
    case "transactions":
      return <TransactionsWidget d={d} />;
    case "attendance":
    case "employee-attendance":
      return <AttendanceWidget d={d} />;
    case "soliq-open":
      return <SoliqOpenWidget d={d} />;
    // `tax` widget actually carries a company list with tax-focused fields
    // (vat_number/sustainability/etc.) — reuse the existing companies view.
    case "tax":
    case "payrolls":
      return <CompaniesWidget d={d} />;
    case "qqs-reconcile":
      // QQS reconcile carries a status text + figures — fall to smart key/value.
      return <UnknownWidget type={widget_type} raw={parsed} />;

    default:
      return <UnknownWidget type={widget_type} raw={parsed} />;
  }
}
