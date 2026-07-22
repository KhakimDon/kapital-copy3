import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export type Me = {
  username: string;
  user_id: string | null;
  phone: string | null;
  is_admin: boolean;
  /** Platform role: "superadmin" | "tenant_admin" | "user". */
  role?: string;
  /** Tenant slug this session belongs to (null for a superadmin). */
  tenant?: string | null;
  is_superadmin?: boolean;
  /** Module slugs the superadmin has hidden for this tenant — the nav filters by this. */
  disabled_modules?: string[];
  /** Self-set avatar thumbnail (data-URL) or null. */
  avatar?: string | null;
  /** Per-user profile (name, birthday, bio) + the onboarding flag. */
  profile?: MeProfile;
};

export type MeProfile = {
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD or "". */
  birthday: string;
  about: string;
  /** Welcome/onboarding dialog completed (or skipped). */
  onboarded: boolean;
};

/** Current user claims — gates admin-only UI (keys/company CRUD). */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get<Me>("/me")).data,
    staleTime: 5 * 60_000,
  });
}

/** Upsert the caller's profile (name/birthday/about + onboarding stamp). */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: MeProfile) => (await api.put("/me/profile", p)).data,
    onSuccess: (_d, p) => qc.setQueryData<Me>(["me"], (m) => (m ? { ...m, profile: p } : m)),
  });
}

/** Set (or clear, with null) the caller's avatar thumbnail. */
export function useSetAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (avatar: string | null) => (await api.put("/me/avatar", { avatar })).data,
    onSuccess: (_d, avatar) => qc.setQueryData<Me>(["me"], (m) => (m ? { ...m, avatar } : m)),
  });
}
