// Event editor + invites. Invite privacy: typing a phone number NEVER shows
// who it belongs to — the typeahead only suggests KNOWN contacts (people who
// accepted an invite before). Once someone accepts, their name appears on the
// invite chip and in future typeahead.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Clock, Loader2, MapPin, Pencil, Phone, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/shared/lib/utils";
import {
  type CalendarInfo, type EventOccurrence,
  uid, useAddInvites, useContacts, useDeleteEvent, useDeleteInvite, useSaveEvent,
} from "./api";
import { hhmm, ymd } from "./util";

const REPEATS = ["", "daily", "weekly", "monthly", "yearly"] as const;

export function EventDialog({
  companyId,
  calendars,
  event,
  createAt,
  open,
  onClose,
}: {
  companyId: number;
  calendars: CalendarInfo[];
  /** Existing occurrence being edited (null = creating). */
  event: EventOccurrence | null;
  /** Prefill start for a new event. */
  createAt: Date | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.calendar.${k}`, { defaultValue: d });
  const locals = useMemo(() => calendars.filter((c) => c.kind === "local"), [calendars]);

  const save = useSaveEvent(companyId);
  const del = useDeleteEvent(companyId);
  const addInvites = useAddInvites(companyId);
  const delInvite = useDeleteInvite(companyId);

  const [title, setTitle] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [repeat, setRepeat] = useState<string>("");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [pendingPhones, setPendingPhones] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState(false);
  // Existing events open in read-only VIEW mode; the user taps "Edit" to change
  // them. New events (createAt) open straight in edit mode.
  const [mode, setMode] = useState<"view" | "edit">("edit");

  const contacts = useContacts(companyId, phone);

  useEffect(() => {
    if (!open) return;
    setConfirmDel(false);
    setPhone("");
    setPendingPhones([]);
    setMode(event ? "view" : "edit");
    if (event) {
      const s = new Date(event.startsAt);
      const e = new Date(event.endsAt);
      setTitle(event.title);
      setCalendarId(event.calendarId);
      setDate(ymd(s));
      setStartTime(hhmm(s));
      setEndDate(ymd(e));
      setEndTime(hhmm(e));
      setAllDay(event.allDay);
      setRepeat(event.repeat ?? "");
      setRepeatUntil(event.repeatUntil ?? "");
      setLocation(event.location);
      setDescription(event.description);
    } else {
      const s = createAt ?? new Date();
      setTitle("");
      setCalendarId(locals[0]?.id ?? "");
      setDate(ymd(s));
      setStartTime(`${String(s.getHours()).padStart(2, "0")}:00`);
      setEndDate(ymd(s));
      setEndTime(`${String(Math.min(23, s.getHours() + 1)).padStart(2, "0")}:00`);
      setAllDay(false);
      setRepeat("");
      setRepeatUntil("");
      setLocation("");
      setDescription("");
    }
  }, [open, event, createAt, locals]);

  const readOnly = event?.source === "ics";
  const viewing = mode === "view";
  // Fields are locked while viewing (or for non-editable ICS events). ICS events
  // can never be edited; other existing events can, via the "Edit" button.
  const locked = readOnly || viewing;
  const canEdit = !readOnly;
  const baseId = event?.baseId ?? event?.id ?? null;

  const submit = async () => {
    const id = baseId ?? uid("ev");
    const startsAt = allDay
      ? new Date(`${date}T00:00:00`).toISOString()
      : new Date(`${date}T${startTime}:00`).toISOString();
    const endsAt = allDay
      ? new Date(`${endDate || date}T23:59:59`).toISOString()
      : new Date(`${endDate || date}T${endTime}:00`).toISOString();
    await save.mutateAsync({
      id, calendarId, title: title.trim(), description, location,
      startsAt, endsAt, allDay, repeat, repeatUntil: repeat ? repeatUntil || null : null,
    });
    if (pendingPhones.length) {
      await addInvites.mutateAsync({ eventId: id, phones: pendingPhones });
    }
    onClose();
  };

  const addPhone = (p: string) => {
    const digits = p.replace(/\D/g, "");
    if (digits.length < 7) return;
    setPendingPhones((v) => (v.includes(digits) ? v : [...v, digits]));
    setPhone("");
  };

  const statusBadge = (s: string) =>
    s === "accepted" ? (
      <Check className="size-3 text-emerald-500" />
    ) : s === "declined" ? (
      <X className="size-3 text-destructive" />
    ) : (
      <Clock className="size-3 text-muted-foreground" />
    );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {viewing
              ? tr("eventView", "Tadbir")
              : event
                ? tr("eventEdit", "Tadbirni tahrirlash")
                : tr("eventNew", "Yangi tadbir")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tr("titlePh", "Nomi")}
            disabled={locked}
            className="text-base font-medium"
          />

          {!locked && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">{tr("calendar", "Kalendar")}</span>
              <Select value={calendarId} onValueChange={setCalendarId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {locals.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="text-sm">{tr("allDay", "Kun bo'yi")}</span>
            <Switch checked={allDay} onCheckedChange={setAllDay} disabled={locked} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0 space-y-1">
              <span className="text-xs text-muted-foreground">{tr("starts", "Boshlanishi")}</span>
              <div className="flex min-w-0 gap-1.5">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={locked} className="h-8 min-w-0 flex-1 text-xs" />
                {!allDay && (
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={locked} className="h-8 w-[86px] shrink-0 px-2 text-xs" />
                )}
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <span className="text-xs text-muted-foreground">{tr("ends", "Tugashi")}</span>
              <div className="flex min-w-0 gap-1.5">
                <Input type="date" value={endDate || date} onChange={(e) => setEndDate(e.target.value)} disabled={locked} className="h-8 min-w-0 flex-1 text-xs" />
                {!allDay && (
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={locked} className="h-8 w-[86px] shrink-0 px-2 text-xs" />
                )}
              </div>
            </div>
          </div>

          {!locked && (
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">{tr("repeat", "Takror")}</span>
              <Select value={repeat || "none"} onValueChange={(v) => setRepeat(v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPEATS.map((r) => (
                    <SelectItem key={r || "none"} value={r || "none"}>
                      {tr(`repeats.${r || "none"}`, r === "" ? "Takrorlanmaydi" : r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {repeat && (
                <Input
                  type="date"
                  value={repeatUntil}
                  onChange={(e) => setRepeatUntil(e.target.value)}
                  title={tr("repeatUntil", "…gacha")}
                  className="h-8 w-36 text-xs"
                />
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-muted-foreground" />
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={tr("locationPh", "Joylashuv")}
              disabled={locked}
              className="h-8 text-xs"
            />
          </div>

          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={tr("descPh", "Izoh…")}
            disabled={locked}
            rows={2}
            className="text-sm"
          />

          {/* invites */}
          {!locked && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">{tr("invites", "Takliflar")}</span>
              {(event?.invites ?? []).map((i) => (
                <div key={i.id} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm">
                  {statusBadge(i.status)}
                  <span className={cn("flex-1 truncate", !i.name && "font-mono text-xs")}>
                    {i.name ? (
                      <>
                        {i.name} <span className="font-mono text-[10px] text-muted-foreground">+{i.phone}</span>
                      </>
                    ) : (
                      `+${i.phone}`
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => delInvite.mutate(i.id)}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {pendingPhones.map((p) => (
                <div key={p} className="flex items-center gap-2 rounded-md border border-dashed bg-background px-2 py-1 text-sm">
                  <Phone className="size-3 text-muted-foreground" />
                  <span className="flex-1 font-mono text-xs">+{p}</span>
                  <button
                    type="button"
                    onClick={() => setPendingPhones((v) => v.filter((x) => x !== p))}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <div className="relative">
                <div className="flex gap-1.5">
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPhone(phone); } }}
                    placeholder={tr("phonePh", "+998 90 123 45 67")}
                    inputMode="tel"
                    className="h-8 text-xs"
                  />
                  <Button size="sm" variant="outline" className="h-8" onClick={() => addPhone(phone)} disabled={phone.replace(/\D/g, "").length < 7}>
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                {(contacts.data?.length ?? 0) > 0 && (
                  <div className="absolute inset-x-0 top-9 z-20 rounded-md border bg-popover p-1 shadow-md">
                    {contacts.data!.map((c) => (
                      <button
                        key={c.phone}
                        type="button"
                        onClick={() => addPhone(c.phone)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">+{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {event && !readOnly ? (
            confirmDel ? (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="destructive" onClick={async () => { if (baseId) await del.mutateAsync(baseId); onClose(); }}>
                  {t("common.delete", { defaultValue: "O'chirish" })}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDel(false)}>
                  {t("modules.tasks.actions.cancel", { defaultValue: "Bekor qilish" })}
                </Button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1 text-sm text-destructive hover:underline">
                <Trash2 className="size-4" /> {t("common.delete", { defaultValue: "O'chirish" })}
              </button>
            )
          ) : (
            <span />
          )}
          {viewing ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>{t("common.close", { defaultValue: "Yopish" })}</Button>
              {canEdit && (
                <Button onClick={() => setMode("edit")} className="gap-1.5">
                  <Pencil className="size-4" /> {t("common.edit", { defaultValue: "Tahrirlash" })}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>{t("modules.tasks.actions.cancel", { defaultValue: "Bekor qilish" })}</Button>
              <Button onClick={submit} disabled={!calendarId || save.isPending}>
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : t("modules.tasks.actions.save", { defaultValue: "Saqlash" })}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
