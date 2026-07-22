import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

/** The three editable languages for home prompts (uz_Cyrl folds into uz). */
export type PromptLang = "ru" | "uz" | "en";
export type LangText = Record<PromptLang, string>;

/** One home-screen suggestion: a rotating heading + description + the prompt
 *  that drops into the composer on click. Each is authored in 3 languages and
 *  may contain {variable} tokens resolved at render time. */
export type HomePrompt = {
  id: string;
  enabled: boolean;
  title: LangText;
  description: LangText;
  prompt: LangText;
};
export type HomePromptsConfig = { prompts: HomePrompt[] };

export const PROMPT_LANGS: PromptLang[] = ["ru", "uz", "en"];

/** Tokens the editor can insert; resolved client-side when a prompt is used. */
export const PROMPT_VARIABLES = [
  "current_company",
  "current_user",
  "current_date",
] as const;

const EMPTY: HomePromptsConfig = { prompts: [] };
export const EMPTY_HOME_PROMPTS = EMPTY;

export const emptyLangText = (): LangText => ({ ru: "", uz: "", en: "" });

/** Map the active i18n language onto one of the 3 authored variants. */
export function toPromptLang(lng: string): PromptLang {
  if (lng.startsWith("ru")) return "ru";
  if (lng.startsWith("en")) return "en";
  return "uz"; // uz + uz_Cyrl
}

/** Pick a language variant, falling back ru → uz → en → first non-empty. */
export function pickLangText(lt: LangText | undefined, lng: PromptLang): string {
  if (!lt) return "";
  return lt[lng] || lt.ru || lt.uz || lt.en || "";
}

/** Substitute {current_company} etc.; unknown tokens are left untouched. */
export function applyVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? vars[k] : `{${k}}`));
}

/** Any authenticated user reads the prompt cards. */
export function useHomePrompts() {
  return useQuery({
    queryKey: ["home-prompts"],
    queryFn: async () => (await api.get<HomePromptsConfig>("/config/home-prompts")).data,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** Superadmin: overwrite the prompt cards. */
export function useUpdateHomePrompts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: HomePromptsConfig) =>
      (await api.put<HomePromptsConfig>("/admin/home-prompts", cfg)).data,
    onSuccess: (data) => qc.setQueryData(["home-prompts"], data),
  });
}
