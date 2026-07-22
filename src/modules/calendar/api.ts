// Calendar module API — calendars (local + ICS subscriptions), events with
// server-expanded recurrence, invites-by-phone (privacy: names appear only
// after acceptance), tasks-due overlay and the personal ICS export feed.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

export type CalendarInfo = {
  id: string;
  name: string;
  color: string;
  kind: "local" | "ics";
  icsUrl?: string | null;
  owner: string;
  order: number;
};

export type InviteInfo = {
  id: string;
  phone: string;
  /** Only present for people who ACCEPTED an invite before (known contacts). */
  name: string | null;
  status: "pending" | "accepted" | "declined";
};

export type EventOccurrence = {
  id: string;
  baseId: string | null;
  calendarId: string;
  color: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  repeat: "" | "daily" | "weekly" | "monthly" | "yearly";
  repeatUntil?: string | null;
  createdBy?: string;
  invites: InviteInfo[];
  myInvite?: string | null;
  source: "local" | "ics";
};

export type TaskDue = {
  id: string;
  title: string;
  due: string;
  priority: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  color: string;
  done: boolean;
};

export type MyInvite = {
  id: string;
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  invitedBy: string;
};

const key = (companyId: number | undefined, ...rest: unknown[]) => ["calendar", companyId, ...rest];

export function useCalendars(companyId: number | undefined) {
  return useQuery({
    queryKey: key(companyId, "calendars"),
    enabled: !!companyId,
    queryFn: async () =>
      (await api.get<{ items: CalendarInfo[] }>(`/calendar/${companyId}/calendars`)).data.items,
  });
}

export function useSaveCalendar(companyId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<CalendarInfo> & { id: string }) =>
      (await api.put(`/calendar/${companyId}/calendars/${c.id}`, c)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(companyId) }),
  });
}

export function useDeleteCalendar(companyId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/calendar/${companyId}/calendars/${id}`)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(companyId) }),
  });
}

/** Occurrences in [from, to) — repeats already expanded server-side. */
export function useEvents(companyId: number | undefined, from: string, to: string) {
  return useQuery({
    queryKey: key(companyId, "events", from, to),
    enabled: !!companyId,
    queryFn: async () =>
      (await api.get<{ items: EventOccurrence[] }>(
        `/calendar/${companyId}/events`,
        { params: { from, to } },
      )).data.items,
    refetchInterval: 60_000,
  });
}

export function useSaveEvent(companyId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: {
      id: string;
      calendarId: string;
      title: string;
      description?: string;
      location?: string;
      startsAt: string;
      endsAt: string;
      allDay?: boolean;
      repeat?: string;
      repeatUntil?: string | null;
    }) => (await api.put(`/calendar/${companyId}/events/${e.id}`, e)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(companyId, "events") }),
  });
}

export function useDeleteEvent(companyId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/calendar/${companyId}/events/${id}`)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(companyId, "events") }),
  });
}

export function useAddInvites(companyId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { eventId: string; phones: string[] }) =>
      (await api.post(`/calendar/${companyId}/events/${p.eventId}/invites`, { phones: p.phones })).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(companyId, "events") }),
  });
}

export function useDeleteInvite(companyId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) =>
      (await api.delete(`/calendar/${companyId}/invites/${inviteId}`)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(companyId, "events") }),
  });
}

export function useMyInvites(companyId: number | undefined) {
  return useQuery({
    queryKey: key(companyId, "my-invites"),
    enabled: !!companyId,
    queryFn: async () =>
      (await api.get<{ items: MyInvite[] }>(`/calendar/${companyId}/my-invites`)).data.items,
    refetchInterval: 60_000,
  });
}

export function useRespondInvite(companyId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { inviteId: string; accept: boolean }) =>
      (await api.post(`/calendar/${companyId}/invites/${p.inviteId}/respond`, { accept: p.accept })).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(companyId) }),
  });
}

/** Typeahead over KNOWN contacts only (accepted an invite at least once). */
export function useContacts(companyId: number | undefined, q: string) {
  return useQuery({
    queryKey: key(companyId, "contacts", q),
    enabled: !!companyId && q.replace(/\D/g, "").length >= 3,
    queryFn: async () =>
      (await api.get<{ items: { phone: string; name: string }[] }>(
        `/calendar/${companyId}/contacts`,
        { params: { q } },
      )).data.items,
  });
}

export function useTasksDue(companyId: number | undefined, from: string, to: string) {
  return useQuery({
    queryKey: key(companyId, "tasks", from, to),
    enabled: !!companyId,
    queryFn: async () =>
      (await api.get<{ items: TaskDue[] }>(`/calendar/${companyId}/tasks`, {
        params: { from, to },
      })).data.items,
    refetchInterval: 60_000,
  });
}

export function useFeedLink(companyId: number | undefined) {
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ token: string; url: string }>(`/calendar/${companyId}/feed`, {})).data,
  });
}

/** Per-calendar ICS share link — each LOCAL calendar gets its own, generated
 *  on demand (only when the user clicks). */
export function useCalendarFeedLink(companyId: number | undefined, calendarId: string) {
  return useMutation({
    mutationFn: async () =>
      (
        await api.post<{ token: string; url: string }>(
          `/calendar/${companyId}/calendars/${encodeURIComponent(calendarId)}/feed`,
          {},
        )
      ).data,
  });
}

export const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
