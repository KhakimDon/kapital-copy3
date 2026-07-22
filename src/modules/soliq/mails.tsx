import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUrlNumber, useUrlSearch, useUrlState } from "@/shared/hooks/use-url-state";
import { useCompany } from "@/shared/store/company";
import {
  useMails, useMailCategories, useMailDetail, useMailMarkRead,
  useMailAcceptRequirement, useMailSync, useMailStatsByCompany,
  useReconciliation, useReconciliationSync,
} from "./api";
import { api } from "@/shared/api/client";
import {
  MAIL_CATEGORIES, SMART_CHIPS, MAIL_ANSWER_STATUSES,
  type MailCategory, type MailRow, type MailCategoriesOut,
} from "./types";
import { localized } from "./localized";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Mail, RefreshCw, FileText, CheckCheck, SlidersHorizontal, Download,
  ArrowDownLeft, ArrowUpRight, AlertTriangle, Paperclip,
} from "lucide-react";

const PAGE_SIZE = 50;

export function SoliqMailsPage() {
  const { t } = useTranslation();
  const company = useCompany((s) => s.current);
  const navigate = useNavigate();

  const [categoryRaw, setCategoryRaw] = useUrlState("tab", "requirement");
  const [directionRaw, setDirectionRaw] = useUrlState("dir", ""); // received
  const [answerStatusRaw, setAnswerStatusRaw] = useUrlState("answer", "");
  const [presetRaw, setPresetRaw] = useUrlState("preset", "");
  const [searchInput, search, setSearchInput] = useUrlSearch("q");
  const [regNum, setRegNum] = useUrlState("reg", "");
  const [readRaw, setReadRaw] = useUrlState("read", "");
  const [dateFrom, setDateFrom] = useUrlState("from", "");
  const [dateTo, setDateTo] = useUrlState("to", "");
  const [deadlineFrom, setDeadlineFrom] = useUrlState("dlFrom", "");
  const [deadlineTo, setDeadlineTo] = useUrlState("dlTo", "");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useUrlNumber("page", 0);
  const [openPkey, setOpenPkey] = useState<string | null>(null);

  const category = categoryRaw as MailCategory;
  const direction = directionRaw as "" | "1" | "0";
  const answerStatus = answerStatusRaw as "" | "answered" | "not_answered";
  const preset = presetRaw || null;
  const read = readRaw as "" | "true" | "false";
  const setCategory = (v: MailCategory) => setCategoryRaw(v);
  const setDirection = (v: "" | "1" | "0") => setDirectionRaw(v);
  const setAnswerStatus = (v: "" | "answered" | "not_answered") => setAnswerStatusRaw(v);
  const setPreset = (v: string | null) => setPresetRaw(v ?? "");
  const setRead = (v: "" | "true" | "false") => setReadRaw(v);

  const companyId = company?.id ?? null;

  const filters: Record<string, unknown> = {
    ...(category !== "all" && { mail_type: category }),
    // tax_report is always outgoing; don't send a direction filter for it.
    ...(direction && category !== "tax_report" && { received: direction }),
    ...(answerStatus && category === "requirement" && { status_code: answerStatus }),
    ...(preset && { preset }),
    ...(search && { search }),
    ...(regNum && { registered_num: regNum }),
    ...(read && { read }),
    ...(dateFrom && { date_from: dateFrom }),
    ...(dateTo && { date_to: dateTo }),
    ...(deadlineFrom && { deadline_from: deadlineFrom }),
    ...(deadlineTo && { deadline_to: deadlineTo }),
    page, size: PAGE_SIZE, limit: PAGE_SIZE, skip: page * PAGE_SIZE,
  };

  const { data, isLoading } = useMails(companyId, filters);
  const { data: cats } = useMailCategories(companyId);
  const byCompany = useMailStatsByCompany(!!companyId);
  const sync = useMailSync();

  const resetFilters = () => {
    setSearchInput(""); setRegNum(""); setRead(""); setDateFrom(""); setDateTo("");
    setDeadlineFrom(""); setDeadlineTo(""); setPreset(null); setAnswerStatus("");
    setPage(0);
  };

  const activeFilterCount =
    [search, regNum, read, dateFrom, dateTo, deadlineFrom, deadlineTo].filter(Boolean).length +
    (preset ? 1 : 0);

  if (!company) {
    return <p className="text-muted-foreground">{t("modules.soliq.common.pickCompanyFirst")}</p>;
  }

  const totals = cats?.totals ?? { total: 0, incoming: 0, outgoing: 0 };
  const agg = cats?.aggregates;
  const reqCat = cats?.categories?.requirement;
  const total = data?.count ?? 0;

  return (
    <div className="space-y-3">
      {/* Header: title + action-center + sync */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t("modules.soliq.mails.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("modules.soliq.mails.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <ActionCenter items={byCompany.data?.items ?? []} currentId={company.id}
                        onGo={(id) => navigate(`/soliq/mails?company=${id}`)} />
          <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal className="size-4 mr-2" /> {t("modules.soliq.cheques.filters")}
            {activeFilterCount > 0 && <Badge variant="info" className="ml-2">{activeFilterCount}</Badge>}
          </Button>
          <Button variant="default" size="sm" onClick={() => sync.mutate(company.id)}
                  disabled={sync.isPending}>
            <RefreshCw className={`size-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />
            {t("modules.soliq.actions.refresh")}
          </Button>
        </div>
      </div>

      {/* Direction-total cards (Jami / Kiruvchi / Chiquvchi) */}
      <div className="grid grid-cols-3 gap-2">
        <DirCard label={t("modules.soliq.mails.dirAll")} value={totals.total} active={direction === ""}
                 onClick={() => { setDirection(""); setPage(0); }} />
        <DirCard label={t("modules.soliq.ijara.incoming")} value={totals.incoming} tone="in" active={direction === "1"}
                 onClick={() => { setDirection("1"); setPage(0); }} />
        <DirCard label={t("modules.soliq.ijara.outgoing")} value={totals.outgoing} tone="out" active={direction === "0"}
                 onClick={() => { setDirection("0"); setPage(0); }} />
      </div>

      {/* Answer-status totals row (javob beriladigan/berilgan/berilmagan/talab qilinmaydi) */}
      {agg && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <StatChip label={t("modules.soliq.mails.actionable")} value={agg.actionable} tone="amber" />
          <StatChip label={t("modules.soliq.mails.answered")} value={reqCat?.answered ?? agg.answered} tone="green" />
          <StatChip label={t("modules.soliq.mails.notAnswered")} value={reqCat?.actionable ?? 0} tone="red" />
          <StatChip label={t("modules.soliq.mails.unread")} value={agg.unread} tone="blue" />
          <StatChip label={t("modules.soliq.mails.overdue")} value={agg.overdue} tone="red" />
          <StatChip label={t("modules.soliq.mails.staleUnanswered")} value={agg.stale_unanswered} tone="amber" />
        </div>
      )}

      <div className="flex gap-3">
        {/* Sidebar — categories with counts + unread sub-badge */}
        <aside className="w-56 shrink-0 border-r border-border bg-sidebar rounded-l-lg p-2 space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1">{t("modules.soliq.mails.categories")}</div>
          {MAIL_CATEGORIES.map((c) => (
            <CategoryItem key={c.key} cat={c} cats={cats}
                          active={category === c.key}
                          onClick={() => {
                            setCategory(c.key); setPreset(null); setAnswerStatus(""); setPage(0);
                          }} />
          ))}
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Answer-status pills (requirements) */}
          {category === "requirement" && (
            <div className="flex items-center gap-1">
              {MAIL_ANSWER_STATUSES.map((a) => {
                const cnt = a.value === "" ? reqCat?.total
                  : a.value === "answered" ? reqCat?.answered
                  : reqCat?.actionable;
                // Map types.ts off-palette dots to NC tokens at render boundary.
                const dotNc = a.value === "answered" ? "bg-success"
                  : a.value === "not_answered" ? "bg-destructive" : "";
                return (
                  <Button key={a.value || "all"}
                          variant={answerStatus === a.value ? "default" : "outline"} size="sm"
                          onClick={() => { setAnswerStatus(a.value); setPage(0); }}>
                    {dotNc && <span className={`mr-2 size-2 rounded-full ${dotNc}`} />}
                    {t(`modules.soliq.mails.ans.${a.value || "all"}`, { defaultValue: a.label })}
                    {cnt != null && (
                      <span className={`ml-2 rounded-full px-1.5 text-xs ${
                        answerStatus === a.value ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"}`}>
                        {cnt}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          )}

          {/* Smart preset chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {SMART_CHIPS.map((chip) => {
              const cnt = chip.countKey && agg
                ? (agg as unknown as Record<string, number>)[chip.countKey] : undefined;
              return (
                <Button key={chip.id}
                        variant={preset === chip.preset ? "default" : "outline"} size="sm"
                        onClick={() => { setPreset(preset === chip.preset ? null : chip.preset); setPage(0); }}>
                  {t(`modules.soliq.mails.chip.${chip.id}`, { defaultValue: chip.label })}
                  {cnt ? (
                    <span className={`ml-2 rounded-full px-1.5 text-xs ${
                      preset === chip.preset ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"}`}>
                      {cnt}
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>

          {/* Filter panel */}
          {showFilters && (
            <Card>
              <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label={t("modules.soliq.mails.filterTitle")}>
                  <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(0); }} />
                </Field>
                <Field label={t("modules.soliq.mails.filterRegNum")}>
                  <Input value={regNum} onChange={(e) => { setRegNum(e.target.value); setPage(0); }} />
                </Field>
                <Field label={t("modules.soliq.mails.filterReadState")}>
                  <Select value={read || "__all"}
                          onValueChange={(v) => { setRead(v === "__all" ? "" : (v as "true" | "false")); setPage(0); }}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">{t("modules.soliq.cheques.payAll")}</SelectItem>
                      <SelectItem value="false">{t("modules.soliq.mails.unread")}</SelectItem>
                      <SelectItem value="true">{t("modules.soliq.mails.read")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div />
                <Field label={t("modules.soliq.cheques.dateFrom")}>
                  <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(0); }} />
                </Field>
                <Field label={t("modules.soliq.cheques.dateTo")}>
                  <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setPage(0); }} />
                </Field>
                <Field label={t("modules.soliq.mails.deadlineFrom")}>
                  <DatePicker value={deadlineFrom} onChange={(v) => { setDeadlineFrom(v); setPage(0); }} />
                </Field>
                <Field label={t("modules.soliq.mails.deadlineTo")}>
                  <DatePicker value={deadlineTo} onChange={(v) => { setDeadlineTo(v); setPage(0); }} />
                </Field>
                <div className="col-span-full flex justify-end">
                  <Button variant="ghost" size="sm" onClick={resetFilters}>{t("modules.soliq.mails.clear")}</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* List */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="[&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:font-medium hover:bg-transparent">
                    <TableHead className="w-8" />
                    <TableHead>{titleColHeader(category, t)}</TableHead>
                    <TableHead>{numColHeader(category, t)}</TableHead>
                    <TableHead>{dateColHeader(category, t)}</TableHead>
                    <TableHead>{col5Header(category, t)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                        <TableCell><Skeleton className="size-4 rounded" /></TableCell>
                        <TableCell><Skeleton className="h-3.5 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : (data?.items.length ?? 0) === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="py-16">
                        <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                          <div className="size-14 rounded-full bg-muted grid place-items-center">
                            <Mail className="size-7 text-muted-foreground" />
                          </div>
                          <div className="text-sm font-medium text-foreground">{t("modules.soliq.mails.empty")}</div>
                          {activeFilterCount > 0 && (
                            <Button variant="outline" size="sm" onClick={resetFilters}>
                              {t("modules.soliq.mails.clear")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    data?.items.map((m, i) => (
                      <MailListRow key={m.pkey} m={m} category={category} index={i}
                                   onOpen={() => setOpenPkey(m.pkey)} />
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {total > PAGE_SIZE && (
            <div className="flex items-center gap-2 justify-end text-sm">
              <Button variant="outline" size="sm" disabled={page <= 0}
                      onClick={() => setPage(page - 1)}>{t("modules.soliq.pagination.prev")}</Button>
              <span className="text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
              </span>
              <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total}
                      onClick={() => setPage(page + 1)}>{t("modules.soliq.pagination.next")}</Button>
            </div>
          )}
        </div>
      </div>

      <MailDetailModal pkey={openPkey} companyId={company.id} onClose={() => setOpenPkey(null)} />
    </div>
  );
}

// ---- Row -------------------------------------------------------------------

function MailListRow({ m, category, index, onOpen }: {
  m: MailRow; category: MailCategory; index: number; onOpen: () => void;
}) {
  const { t } = useTranslation();
  const isRead = !!m.read_at_soliq;
  const isIn = m.direction === "in" || (m.raw as any)?.received === 1;
  const showArrow = category !== "tax_report" && category !== "tax_pay";

  return (
    <TableRow className="cursor-pointer hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
              style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }} onClick={onOpen}>
      <TableCell>
        {showArrow && (isIn
          ? <ArrowDownLeft className="size-4 text-success" />
          : <ArrowUpRight className="size-4 text-info" />)}
      </TableCell>
      <TableCell className="text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={isRead ? "" : "font-semibold"}>
            {m.title ?? m.registered_num ?? "—"}
          </span>
          {!isRead && category !== "tax_report" && <Badge variant="info" className="text-[10px]">{t("modules.soliq.mails.newBadge")}</Badge>}
          <AnswerPill m={m} category={category} />
          <FileBadge m={m} />
        </div>
      </TableCell>
      <TableCell className="tabular-nums text-xs">{m.registered_num ?? "—"}</TableCell>
      <TableCell className="text-xs">
        {m.registered_at ? new Date(m.registered_at as string).toLocaleDateString("ru-RU") : "—"}
      </TableCell>
      <TableCell className="text-xs">
        {m.deadlined_at && <DeadlineBadge date={m.deadlined_at as string}
          done={m.status_code === "answered"} />}
      </TableCell>
    </TableRow>
  );
}

function AnswerPill({ m, category }: { m: MailRow; category: MailCategory }) {
  const { t } = useTranslation();
  if (category !== "requirement") return null;
  if (m.status_code === "not_answered")
    return <Badge variant="danger" className="text-[10px]">{t("modules.soliq.mails.notAnswered")}</Badge>;
  if (m.status_code === "answered")
    return <Badge variant="success" className="text-[10px]">{t("modules.soliq.mails.answered")}</Badge>;
  if (m.status_code === "answer_not_required")
    return <Badge variant="muted" className="text-[10px]">{t("modules.soliq.mails.answerNotRequired")}</Badge>;
  return null;
}

function FileBadge({ m }: { m: MailRow }) {
  const files = (m.raw as any)?.files;
  if (!Array.isArray(files) || files.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
      <Paperclip className="size-3" /> {files.length}
    </span>
  );
}

function DeadlineBadge({ date, done }: { date: string; done?: boolean }) {
  const { t } = useTranslation();
  const days = Math.floor((new Date(date).getTime() - Date.now()) / 86400000);
  if (done) return <span className="text-muted-foreground">{fmtDate(date)}</span>;
  if (days < 0) return <Badge variant="danger">{t("modules.soliq.mails.daysOverdue", { count: Math.abs(days) })}</Badge>;
  if (days <= 5) return <Badge variant="danger">{t("modules.soliq.mails.days", { count: days })}</Badge>;
  if (days <= 15) return <Badge variant="warning">{t("modules.soliq.mails.days", { count: days })}</Badge>;
  return <Badge variant="muted">{t("modules.soliq.mails.days", { count: days })}</Badge>;
}

// ---- Direction total card --------------------------------------------------

function DirCard({ label, value, tone, active, onClick }: {
  label: string; value: number; tone?: "in" | "out"; active: boolean; onClick: () => void;
}) {
  const accent = tone === "in" ? "border-l-success" : tone === "out" ? "border-l-info" : "border-l-primary";
  return (
    <Button type="button" variant="ghost" onClick={onClick}
      className={`h-auto flex-col items-start gap-0 rounded-lg border border-border border-l-4 ${accent} p-3 text-left font-normal transition-colors
        ${active ? "bg-secondary ring-1 ring-primary hover:bg-secondary" : "bg-card hover:bg-muted"}`}>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-0.5">{value.toLocaleString("ru-RU")}</div>
    </Button>
  );
}

function StatChip({ label, value, tone }: { label: string; value?: number; tone: string }) {
  const cls: Record<string, string> = {
    amber: "bg-warning/15 text-warning",
    green: "bg-success/15 text-success",
    red: "bg-destructive/15 text-destructive",
    blue: "bg-info/15 text-info",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${cls[tone] ?? "bg-muted text-muted-foreground"}`}>
      {label}
      <span className="font-semibold">{value ?? 0}</span>
    </span>
  );
}

// ---- Category sidebar item -------------------------------------------------

function CategoryItem({ cat, cats, active, onClick }: {
  cat: (typeof MAIL_CATEGORIES)[number];
  cats?: MailCategoriesOut;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  // "all" is not a real backend category — its total lives on cats.totals.
  // Show the roll-up count from the top-level directional totals so
  // Hammasi matches the JAMI card above and never renders as 0 when
  // there are actual mails.
  const stat = cats?.categories?.[cat.key];
  const total =
    cat.key === "all"
      ? cats?.totals?.total ?? 0
      : stat?.total ?? 0;
  const unread =
    cat.key === "tax_report"
      ? 0
      : cat.key === "all"
      ? cats?.aggregates?.unread ?? 0
      : stat?.unread ?? 0;
  return (
    <Button variant="ghost" onClick={onClick}
      className={`w-full h-auto px-2 py-1.5 rounded-md text-sm font-normal flex items-center justify-between gap-1
        ${active ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-muted"}`}>
      <span className="truncate">{t(`modules.soliq.mails.cat.${cat.key}`, { defaultValue: cat.label })}</span>
      <span className="flex items-center gap-1 shrink-0">
        {unread > 0 && (
          <span className="rounded-full bg-warning/20 text-warning px-1.5 text-[10px]">
            {unread}
          </span>
        )}
        {cat.key === "requirement" && stat && stat.actionable > 0 && (
          <span className="text-[10px] text-destructive">{stat.actionable}</span>
        )}
        <Badge variant="muted">{total}</Badge>
      </span>
    </Button>
  );
}

// ---- Action center (cross-company unread banner) ---------------------------

function ActionCenter({ items, currentId, onGo }: {
  items: { nc_id: number; display_name?: string; company_name?: string; counts: { unread?: number } }[];
  currentId: number;
  onGo: (id: number) => void;
}) {
  const { t } = useTranslation();
  const others = items.filter((i) => i.nc_id !== currentId && (i.counts.unread ?? 0) > 0);
  const totalUnread = others.reduce((s, i) => s + (i.counts.unread ?? 0), 0);
  if (totalUnread === 0) return null;
  const hottest = others.slice().sort((a, b) => (b.counts.unread ?? 0) - (a.counts.unread ?? 0))[0];
  return (
    <Button type="button" variant="ghost"
      onClick={() => others.length === 1 ? onGo(hottest.nc_id) : undefined}
      className="h-auto gap-2 rounded-md border border-warning/40 bg-warning/15 px-3 py-1.5 text-sm font-normal hover:bg-warning/15"
      title={t("modules.soliq.mails.unreadOthersTitle")}>
      <AlertTriangle className="size-4 text-warning" />
      <span className="text-warning font-medium">{t("modules.soliq.mails.unreadCount", { count: totalUnread })}</span>
      <span className="text-xs text-muted-foreground">
        {others.length > 1 ? t("modules.soliq.mails.companyCount", { count: others.length }) : hottest.display_name ?? hottest.company_name}
      </span>
    </Button>
  );
}

// ---- Detail modal ----------------------------------------------------------

function MailDetailModal({ pkey, companyId, onClose }: {
  pkey: string | null; companyId: string | number | null; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: detail, isLoading } = useMailDetail(pkey, companyId);
  const markRead = useMailMarkRead();
  const accept = useMailAcceptRequirement();
  const [actionErr, setActionErr] = useState<string | null>(null);

  const doAction = (fn: () => Promise<unknown>) => {
    setActionErr(null);
    fn().catch((e) => setActionErr(extractErr(e, t)));
  };

  const downloadFile = async (fileId: string) => {
    setActionErr(null);
    try {
      const res = await api.get(`/soliq/mails/files/${fileId}/presigned`);
      const url = res.data?.url || res.data?.presigned_url || res.data?.download_url;
      if (url) window.open(url, "_blank");
      else setActionErr(t("modules.soliq.taxPayments.downloadLinkMissing"));
    } catch (e) {
      setActionErr(extractErr(e, t));
    }
  };

  const [sverkaOpen, setSverkaOpen] = useState(false);

  const bodyText = useMemo(() => {
    const raw = (detail?.raw ?? {}) as Record<string, unknown>;
    return (raw.body as string) || (raw.text as string) || (raw.content as string)
      || (raw.message as string) || "";
  }, [detail]);

  // Default act-sverka date = registered_at − 1 day (matches Soliq cabinet).
  const defaultSverkaDate = useMemo(() => {
    const r = detail?.registered_at as string | undefined;
    if (!r) return undefined;
    const d = new Date(r);
    if (isNaN(d.getTime())) return undefined;
    d.setDate(d.getDate() - 1);
    return localDate(d);
  }, [detail]);

  const isRequirement = detail?.mail_type === "requirement";
  const wide = isRequirement && sverkaOpen;

  return (
    <Dialog open={!!pkey} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={`${wide ? "max-w-6xl" : "max-w-3xl"} max-h-[85vh] overflow-y-auto`}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle>{detail?.title ?? detail?.registered_num ?? t("modules.soliq.mails.letter")}</DialogTitle>
            {isRequirement && (
              <Button variant={sverkaOpen ? "default" : "outline"} size="sm"
                      onClick={() => setSverkaOpen((v) => !v)}>
                {t("modules.soliq.mails.actSverka")}
              </Button>
            )}
          </div>
        </DialogHeader>

        <Reveal loading={isLoading} skeleton={<Skeleton className="h-60 w-full" />}>
          {detail ? (
          <div className={wide ? "grid grid-cols-2 gap-4" : ""}>
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              {detail.mail_type && <Badge variant="muted">{detail.mail_type}</Badge>}
              {detail.direction && (
                <Badge variant="info">{detail.direction === "in" ? t("modules.soliq.ijara.incoming") : t("modules.soliq.ijara.outgoing")}</Badge>
              )}
              {detail.status_name && <Badge variant="success">{detail.status_name}</Badge>}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <Row k={t("modules.soliq.cheques.fieldNum")} v={detail.registered_num} />
              <Row k={t("modules.soliq.mails.registeredAt")} v={fmtDate(detail.registered_at as string)} />
              <Row k={t("modules.soliq.mails.deadline")} v={fmtDate(detail.deadlined_at as string)} />
              <Row k={t("modules.soliq.profileTab.status")} v={detail.status_name} />
            </div>

            {/* Document / text */}
            {bodyText && (
              <div>
                <SectionTitle>{t("modules.soliq.mails.docText")}</SectionTitle>
                <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {bodyText}
                </div>
              </div>
            )}

            {/* Attachments with download */}
            {detail.files.length > 0 && (
              <div>
                <SectionTitle>{t("modules.soliq.mails.files", { count: detail.files.length })}</SectionTitle>
                <div className="space-y-1">
                  {detail.files.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded border text-sm">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{f.name ?? f.id}</span>
                      {f.file_type && <Badge variant="muted" className="text-[10px]">{f.file_type}</Badge>}
                      <Button variant="ghost" size="sm" className="h-7"
                              onClick={() => downloadFile(f.id)}>
                        <Download className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* History timeline */}
            {detail.history.length > 0 && (
              <div>
                <SectionTitle>{t("modules.soliq.taxPayments.sectionHistory")}</SectionTitle>
                <ol className="relative border-l ml-2 space-y-3 pl-4">
                  {detail.history.map((h, i) => (
                    <li key={i} className="text-xs">
                      <span className="absolute -left-[5px] mt-1 size-2 rounded-full bg-primary" />
                      <div className="text-muted-foreground">
                        {h.at ? new Date(h.at).toLocaleString("ru-RU") : ""}
                      </div>
                      <div>{h.state_name ?? "—"}</div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {actionErr && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {actionErr}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-3 border-t">
              <Button variant="outline" size="sm"
                      onClick={() => pkey && doAction(() => markRead.mutateAsync(pkey))}
                      disabled={markRead.isPending}>
                <Mail className="size-4 mr-1" /> {t("modules.soliq.mails.markRead")}
              </Button>
              {detail.mail_type === "requirement" && (
                <Button variant="default" size="sm"
                        onClick={() => pkey && doAction(() => accept.mutateAsync({ pkey }))}
                        disabled={accept.isPending}>
                  <CheckCheck className="size-4 mr-1" /> {t("modules.soliq.mails.acceptRequirement")}
                </Button>
              )}
            </div>
          </div>
          {/* Act-sverka side pane (reconciliation snapshot next to the requirement) */}
          {wide && (
            <ActSverkaPane companyId={companyId} defaultDate={defaultSverkaDate} />
          )}
          </div>
          ) : null}
        </Reveal>
      </DialogContent>
    </Dialog>
  );
}

// Reconciliation (akt-sverka) snapshot pane — date picker + Show + sync,
// rendered side-by-side with the requirement letter. Mirrors cloud mails-detail.
function ActSverkaPane({ companyId, defaultDate }: {
  companyId: string | number | null; defaultDate?: string;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState<string | undefined>(defaultDate);
  // Auto-fetch once with the default date on mount; subsequent date changes
  // require an explicit "Ko'rsatish" click.
  const [applied, setApplied] = useState<string | undefined>(defaultDate);
  const year = applied ? Number(applied.slice(0, 4)) : new Date().getFullYear();

  const { data, isLoading } = useReconciliation(
    applied ? companyId : null,
    { year, request_date: applied },
  );
  const sync = useReconciliationSync();

  return (
    <div className="border-l pl-4 space-y-3">
      <h4 className="text-sm font-semibold">{t("modules.soliq.mails.actSverka")}</h4>
      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <div className="text-xs uppercase text-muted-foreground">{t("modules.soliq.reconciliationTab.date")}</div>
          <DatePicker value={date ?? ""} className="h-9"
                 onChange={(v) => setDate(v)} />
        </div>
        <Button size="sm" onClick={() => setApplied(date)} disabled={!date}>{t("modules.soliq.reconciliationTab.show")}</Button>
        <Button size="sm" variant="outline" title={t("modules.soliq.actions.sync")}
                disabled={!date || sync.isPending}
                onClick={() => date && companyId && sync.mutate({ companyId, request_date: date })}>
          <RefreshCw className={`size-4 ${sync.isPending ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {!applied ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          {t("modules.soliq.mails.pickDateAndShow")}
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[55vh]">
          <Table>
            <TableHeader>
              <TableRow className="[&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:font-medium hover:bg-transparent">
                <TableHead>{t("modules.soliq.reconciliationTab.colTaxType")}</TableHead>
                <TableHead className="text-right">{t("modules.soliq.reconciliationTab.colCharged")}</TableHead>
                <TableHead className="text-right">{t("modules.soliq.reconciliationTab.colPaid")}</TableHead>
                <TableHead className="text-right">{t("modules.soliq.meta.debt")}</TableHead>
                <TableHead className="text-right">{t("modules.soliq.meta.advance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                    <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-14 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-14 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-14 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-14 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (data?.items ?? []).length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-12">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <FileText className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{t("modules.soliq.mails.notFound")}</div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (data?.items ?? []).map((r, i) => (
                  <TableRow key={i} className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                            style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                    <TableCell className="text-xs">{localized(r.na2_name) ?? r.na2_code ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtNum(r.nach_itogo)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtNum(r.uploch_itogo)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-destructive">{fmtNum(r.total_debt)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-success">{fmtNum(r.total_over_payment)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ---- per-category column header helpers ------------------------------------

type TFn = (key: string, opts?: Record<string, unknown>) => string;
function titleColHeader(c: MailCategory, t: TFn): string {
  if (c === "tax_report") return t("modules.soliq.mails.colReportName");
  if (c === "tax_pay") return t("modules.soliq.mails.colDocType");
  return t("modules.soliq.mails.colDocType");
}
function numColHeader(c: MailCategory, t: TFn): string {
  return c === "tax_pay" ? t("modules.soliq.taxPayments.colDocNum") : t("modules.soliq.cheques.fieldNum");
}
function dateColHeader(c: MailCategory, t: TFn): string {
  if (c === "tax_report") return t("modules.soliq.mails.colSentDate");
  if (c === "tax_pay") return t("modules.soliq.taxPayments.colPayDate");
  return t("modules.soliq.mails.colRegDate");
}
function col5Header(c: MailCategory, t: TFn): string {
  if (c === "tax_report") return t("modules.soliq.mails.colCheckedDate");
  if (c === "tax_pay") return t("modules.soliq.paymentsTab.colTaxType");
  return t("modules.soliq.mails.colAnswerDeadline");
}

// ---- bits ------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{children}</h4>;
}
function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="font-medium truncate">{v ?? "—"}</span>
    </div>
  );
}
function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ru-RU");
}
function fmtNum(v?: number | null): string {
  if (v == null || Number(v) === 0) return "—";
  return Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}
function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function extractErr(e: unknown, t: TFn): string {
  const ax = e as { response?: { data?: { detail?: string; error?: string } }; message?: string };
  return ax?.response?.data?.detail || ax?.response?.data?.error || ax?.message || t("modules.soliq.page.errorPrefix");
}
