import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export type FooterLink = { label: string; url: string };
export type FooterSocials = {
  instagram?: string;
  linkedin?: string;
  telegram?: string;
  facebook?: string;
};
export type FooterConfig = {
  links: FooterLink[];
  socials: FooterSocials;
};

const EMPTY: FooterConfig = {
  links: [],
  socials: { instagram: "", linkedin: "", telegram: "", facebook: "" },
};

/** Public login-screen footer config — no auth required. */
export function useFooterConfig() {
  return useQuery({
    queryKey: ["footer"],
    queryFn: async () => (await api.get<FooterConfig>("/public/footer")).data,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** Superadmin: overwrite the footer config. */
export function useUpdateFooter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: FooterConfig) =>
      (await api.put<FooterConfig>("/admin/footer", cfg)).data,
    onSuccess: (data) => qc.setQueryData(["footer"], data),
  });
}

export const EMPTY_FOOTER = EMPTY;
